// Relates firestore.rules' `allow` conditions to the Firestore emulator's rule
// coverage report, so a condition no test has seen both grant and refuse fails
// the rules lane instead of shipping untested.
//
// The report resets every time a test file loads the rules, so the harness
// (packages/shared/test/helpers/rulesTestEnv.ts) saves one reduced report per
// file into RULES_COVERAGE_DIR; scripts/check-rules-coverage.mjs merges them and
// compares the result with packages/shared/test/e2e/rules-uncovered.json, a list
// that may only shrink. See docs/plans/ongoing/rules-coverage-ratchet.md.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const rulesPath = join(repoRoot, 'firestore.rules');
export const uncoveredPath = join(repoRoot, 'packages/shared/test/e2e/rules-uncovered.json');

// The gap a condition shows: never run, run but never granting, or run but
// never returning false (an error is not a refusal: see mergeCoverage). An entry's reason starts with its gap, so a gap that changes
// kind (a test now reaches it, but only one way) is noticed.
export const GAPS = ['never-evaluated', 'never-true', 'never-false'];

const DOCUMENTS_ROOT = '/databases/{database}/documents';

// Blank out comments and string contents (keeping offsets and newlines), so
// braces, `allow` and `;` inside them don't confuse the scan.
function mask(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (c === '/' && text[i + 1] === '*') {
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        out += text[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += '  ';
      i += 2;
    } else if (c === "'" || c === '"') {
      out += c;
      i++;
      while (i < text.length && text[i] !== c) {
        if (text[i] === '\\') {
          out += ' ';
          i++;
        }
        out += text[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += c;
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/**
 * Every `allow … : if <condition>;` in a rules file, keyed by the enclosing
 * match path (below the documents root) and its operations, e.g.
 * `/persons/{personId} delete` — never by line, so the key survives edits
 * elsewhere in the file. A key repeated in one match block gets `#2`, `#3`.
 */
export function parseRules(text) {
  const src = mask(text);
  const conditions = [];
  const stack = []; // one frame per `{`: { match?: string }
  const seen = new Map();
  const tokenRe = /\bmatch\s+(\S+)\s*\{|\ballow\s+([a-z,\s]+?)\s*:\s*if\b|[{}]/g;
  let m;
  while ((m = tokenRe.exec(src))) {
    if (m[1] !== undefined) {
      stack.push({ match: m[1] });
    } else if (m[2] !== undefined) {
      const start = tokenRe.lastIndex;
      const end = src.indexOf(';', start);
      if (end < 0) throw new Error(`rules: unterminated allow at offset ${m.index}`);
      const path = stack.map((f) => f.match).filter(Boolean).join('');
      const relPath = path.startsWith(DOCUMENTS_ROOT) ? path.slice(DOCUMENTS_ROOT.length) || '/' : path;
      const ops = m[2].split(',').map((o) => o.trim()).filter(Boolean).join(', ');
      let key = `${relPath} ${ops}`;
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      if (n > 1) key = `${key} #${n}`;
      const body = text.slice(start, end).trim();
      conditions.push({ key, start, end, constant: body === 'true' || body === 'false' });
      tokenRe.lastIndex = end + 1;
    } else if (m[0] === '{') {
      stack.push({});
    } else {
      stack.pop();
    }
  }
  return conditions;
}

function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}

/**
 * Fold the per-file reports into one result per condition key. A report entry
 * that falls inside no `allow` condition is a function body, which this
 * ratchet does not judge.
 */
export function mergeCoverage(text, conditions, reports) {
  const starts = lineStarts(text);
  const merged = new Map(conditions.map((c) => [c.key, { ...c, evaluated: false, sawTrue: false, sawFalse: false }]));
  for (const report of reports) {
    for (const e of report.entries) {
      const lineStart = starts[e.line - 1];
      if (lineStart === undefined) continue;
      const lineEnd = starts[e.line] ?? text.length;
      const offset = Math.min(lineStart + e.column - 1, lineEnd - 1);
      const cond = conditions.find((c) => offset >= c.start && offset < c.end);
      if (!cond) continue;
      const r = merged.get(cond.key);
      // An evaluation error denies too, but only a `false` is the condition
      // refusing; a test whose deny comes from a null dereference proves nothing
      // about the condition.
      if (e.trueCount + e.falseCount + e.errorCount > 0) r.evaluated = true;
      if (e.trueCount > 0) r.sawTrue = true;
      if (e.falseCount > 0) r.sawFalse = true;
    }
  }
  return merged;
}

/** key → gap, for every non-constant condition not seen both ways. */
export function gaps(merged) {
  const out = new Map();
  for (const [key, r] of merged) {
    if (r.constant) continue;
    if (!r.evaluated) out.set(key, 'never-evaluated');
    else if (!r.sawTrue) out.set(key, 'never-true');
    else if (!r.sawFalse) out.set(key, 'never-false');
  }
  return out;
}

const gapOf = (reason) => GAPS.find((g) => reason.startsWith(`${g}:`));

/**
 * Compare the measured gaps with the listed ones.
 * - unlisted: a gap with no entry (write the missing test, or list it with why);
 * - stale: an entry now seen both ways (the list only shrinks);
 * - missing: an entry whose key is gone from the rules;
 * - wrongKind: an entry whose reason names a different gap than measured,
 *   or names none.
 */
export function check(gapMap, listed, conditions) {
  const keys = new Set(conditions.map((c) => c.key));
  const unlisted = [...gapMap.keys()].filter((k) => !(k in listed));
  const missing = Object.keys(listed).filter((k) => !keys.has(k));
  const stale = Object.keys(listed).filter((k) => keys.has(k) && !gapMap.has(k));
  const wrongKind = Object.entries(listed)
    .filter(([k, reason]) => gapMap.has(k) && gapOf(reason) !== gapMap.get(k))
    .map(([k, reason]) => ({ key: k, reason, measured: gapMap.get(k) }));
  return { unlisted, stale, missing, wrongKind };
}

export function readUncovered(path = uncoveredPath) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
}

export function writeUncovered(entries, path = uncoveredPath) {
  const sorted = Object.fromEntries(Object.keys(entries).sort().map((k) => [k, entries[k]]));
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`);
}

export function readReports(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

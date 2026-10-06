/**
 * Shared pieces of the two PR-time breaking-change detectors:
 *   scripts/check-callable-removal.mjs  — a client-reachable function vanished
 *   scripts/check-schema-change.mjs     — a stored Zod schema got stricter or looser
 *
 * Pure parsing lives here so it is unit-testable without git; the git helpers
 * at the bottom are the only IO. See docs/decisions/breaking-change-and-hard-wall.md.
 */

import { execFileSync } from 'node:child_process';
import { SENTINEL_RE, isBackfillScriptPath } from './backfill-registry.mjs';

export { isBackfillScriptPath };

// ---------------------------------------------------------------------------
// Trailers
// ---------------------------------------------------------------------------

function trailerValues(commitMessages, key) {
  const re = new RegExp(`^[ \\t]*${key}:[ \\t]*(.+?)[ \\t]*$`, 'gim');
  const out = [];
  for (const msg of commitMessages ?? []) {
    for (const m of String(msg).matchAll(re)) {
      const reason = m[1].trim();
      if (reason) out.push(reason);
    }
  }
  return out;
}

/** `Breaking-Client: <reason>` — the change strands installed clients. */
export function parseBreakingTrailers(commitMessages) {
  return trailerValues(commitMessages, 'Breaking-Client');
}

/**
 * `Breaking-Client-Exempt: <reason>` — CI sees a breaking-looking change that
 * provably strands nobody (no supported client calls the callable; every
 * stored doc already carries the field). Satisfies the detectors without
 * declaring a break, so it never moves the hard wall.
 */
export function parseExemptTrailers(commitMessages) {
  return trailerValues(commitMessages, 'Breaking-Client-Exempt');
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

/**
 * `export { a, b as c } from './x/y';` blocks of functions/src/index.ts →
 * [{ exported, local, from }]. `export *` is not used there and is not parsed.
 */
export function parseIndexExports(source) {
  const out = [];
  const re = /export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  for (const m of String(source).matchAll(re)) {
    for (const raw of m[1].split(',')) {
      const spec = raw.replace(/\/\/.*$/gm, '').trim();
      if (!spec) continue;
      const [local, exported = local] = spec.split(/\s+as\s+/).map((s) => s.trim());
      out.push({ exported, local, from: m[2] });
    }
  }
  return out;
}

// Builders whose functions no client can call: Firestore/Storage/Pub/Sub/Auth
// event triggers and schedulers. Everything else — onCall, onRequest, and any
// shape not recognised here — is treated as client-reachable.
const TRIGGER_BUILDER = /^(onDocument|onObject|onSchedule|onMessagePublished|onTaskDispatched|onCustomEventPublished|onValue|onAlert|onConfigUpdated|onTestMatrixCompleted|before[A-Z])/;

/**
 * How a module defines `name`: the v2 builder it is assigned from
 * (`onCall`, `onRequest`, `onDocumentWritten`, `onSchedule`, …), or null when
 * the definition does not have the `export const name = builder(` shape.
 */
export function definitionKind(moduleSource, name) {
  const re = new RegExp(`export\\s+const\\s+${name}\\s*(?::[^=]+)?=\\s*([A-Za-z_$][\\w$]*)\\s*[<(]`);
  const m = String(moduleSource).match(re);
  return m ? m[1] : null;
}

/**
 * Exported function names a store client can reach: callables and HTTPS
 * endpoints. Triggers and schedulers are invisible to clients, so removing one
 * is never client-breaking. An export whose builder is unknown or cannot be
 * read is counted as reachable — a false alarm is cheaper than a missed removal.
 *
 * `readModule(from)` returns the defining module's source, or null.
 */
/**
 * A function assigned from a local factory (`cleanupTrigger(source)`) is read
 * through the module: it is a trigger only when every v2 builder the module
 * imports from firebase-functions is a trigger builder.
 */
function isTriggerOnly(kind, moduleSource) {
  if (/^(on|before)[A-Z]/.test(kind)) return TRIGGER_BUILDER.test(kind);
  const imported = [...String(moduleSource).matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]firebase-functions[^'"]*['"]/g)]
    .flatMap((m) => m[1].split(','))
    .map((spec) => spec.trim().split(/\s+as\s+/)[0])
    .filter((name) => /^(on|before)[A-Z]/.test(name));
  return imported.length > 0 && imported.every((name) => TRIGGER_BUILDER.test(name));
}

export function clientReachableNames(indexSource, readModule) {
  const names = [];
  for (const { exported, local, from } of parseIndexExports(indexSource)) {
    const src = readModule(from);
    const kind = src == null ? null : definitionKind(src, local);
    if (kind === null || !isTriggerOnly(kind, src)) names.push(exported);
  }
  return [...new Set(names)].sort();
}

export function removedNames(before, after) {
  const now = new Set(after);
  return [...new Set(before)].filter((n) => !now.has(n)).sort();
}

// ---------------------------------------------------------------------------
// Stored schemas
// ---------------------------------------------------------------------------

/** Model files read through a strict converter. Form schemas are never stored. */
export function isStoredSchemaFile(path) {
  return (
    path.startsWith('packages/shared/src/models/') &&
    path.endsWith('.ts') &&
    !path.endsWith('.test.ts') &&
    !path.endsWith('/index.ts') &&
    !/FormSchema\.ts$/.test(path)
  );
}

const FIELD_START = /^\s*([A-Za-z_$][\w$]*|'[^']+'|"[^"]+")\s*:\s*(z\b|[A-Z][\w$]*(?:Schema|Shape)\b)/;
const OPTIONALISH = /\.(optional|nullish)\(\)|\.default\(|\.catch\(/;

function bracketDelta(line) {
  const code = line.replace(/\/\/.*$/, '').replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '');
  let d = 0;
  for (const ch of code) {
    if ('([{'.includes(ch)) d++;
    else if (')]}'.includes(ch)) d--;
  }
  return d;
}

/** Last line (1-based) of the expression starting on line `n`: brackets balanced, no `.chain` continuation. */
function expressionEnd(lines, n) {
  let depth = bracketDelta(lines[n - 1]);
  let i = n;
  while (i < lines.length && (depth > 0 || /^\s*\./.test(lines[i]))) {
    depth += bracketDelta(lines[i]);
    i++;
  }
  return i;
}

const DECLARATION_START = /^\s*(export\s+)?(const|let|function)\s+([A-Za-z_$][\w$]*)/;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The expression with every bracketed argument emptied: `z.object({ n: z.number().optional() })`
 * → `z.object()`. A field's own optionality lives on its top-level chain; a
 * nested key's `.optional()` says nothing about the field that contains it.
 */
function topLevelChain(expr) {
  let depth = 0;
  let out = '';
  for (const ch of expr) {
    if (')]}'.includes(ch)) depth--;
    if (depth === 0) out += ch;
    if ('([{'.includes(ch)) depth++;
  }
  return out;
}

// A module-level declaration: the scope a field name is looked up in. Schemas,
// TS interfaces and mappers in one file reuse key names freely (`community`,
// `address`, `name`), so a lookup across the whole file mistakes one schema's
// key for another's.
const TOP_DECLARATION = /^(?:export\s+)?(?:const|let|function|interface|type)\s+([A-Za-z_$][\w$]*)/;

/** Name of the module-level declaration whose span holds line `n`, or null. */
function scopeOf(lines, n) {
  for (let k = n; k >= 1; k--) {
    const m = lines[k - 1].match(TOP_DECLARATION);
    if (m) return expressionEnd(lines, k) >= n ? m[1] : null;
  }
  return null;
}

/** Lines of the module-level declaration `scope` in `source`, or null when it has none. */
function scopeLines(source, scope) {
  const lines = String(source).split('\n');
  const k = lines.findIndex((l) => l.match(TOP_DECLARATION)?.[1] === scope);
  return k < 0 ? null : lines.slice(k, expressionEnd(lines, k + 1));
}

/**
 * A field (or quoted key) `name` is declared in `source` within the
 * declaration `scope` — or anywhere in the file when the field sits outside
 * every declaration (`scope` null).
 */
function declaredInScope(source, name, scope) {
  if (scope === null) return declaredIn(source, name);
  const lines = scopeLines(source, scope);
  return lines !== null && declaredIn(lines.join('\n'), name);
}

/**
 * The fields (`name: z…`) and declarations (`export const X = …`) that START on
 * one of `lineNumbers` (1-based), each with its full span — a field may run
 * over several lines (`foo: z\n  .string()\n  .optional(),`) — and the
 * module-level declaration it sits in (`scope`). `whole` is true when the block
 * exists on this side only: every line of its span changed AND its name is not
 * declared in the same scope of `otherSource`. The name check is what keeps an
 * edited block whose every line also changed (a commented declaration line
 * with all its fields replaced) from reading as one added or removed whole.
 */
function spansStartingOn(source, lineNumbers, otherSource) {
  const lines = String(source).split('\n');
  const changed = new Set(lineNumbers);
  const spans = [];
  for (const n of lineNumbers) {
    const first = lines[n - 1];
    if (first === undefined) continue;
    const decl = first.match(DECLARATION_START);
    const field = decl ? null : first.match(FIELD_START);
    if (!decl && !field) continue;
    const end = expressionEnd(lines, n);
    const name = decl ? decl[3] : field[1].replace(/^['"]|['"]$/g, '');
    const scope = decl ? null : scopeOf(lines, n);
    let whole = !(decl ? declarationIn(otherSource, name) : declaredInScope(otherSource, name, scope));
    for (let k = n; k <= end && whole; k++) whole = changed.has(k);
    const span = { kind: decl ? 'declaration' : 'field', name, scope, start: n, end, whole };
    if (field) {
      const expr = lines.slice(n - 1, end).join('\n');
      span.expr = expr.slice(expr.indexOf(':') + 1).replace(/\s+/g, '').replace(/,$/, '');
      const chain = topLevelChain(span.expr);
      span.optional = OPTIONALISH.test(chain);
      span.nullable = /\.nullable\(\)/.test(chain);
    }
    spans.push(span);
  }
  return spans;
}

const insideAWholeSpan = (spans, s) => spans.some((o) => o !== s && o.whole && o.start < s.start && o.end >= s.start);

/**
 * Zod fields declared in `source` that start on one of `lineNumbers`.
 *
 * Fields nested inside a block added or removed WHOLE are dropped: the keys of
 * a nested object added whole are that field's business (an optional
 * `stats: z.object({ n: z.number() }).optional()` adds no required field,
 * however required `n` is inside it), and the keys of a schema constant added
 * whole only matter through the field that references it. A block whose first
 * line was merely edited (a comment, a rename) hides nothing.
 */
export function fieldsStartingOn(source, lineNumbers, otherSource) {
  const spans = spansStartingOn(source, lineNumbers, otherSource);
  return spans
    .filter((s) => s.kind === 'field' && !insideAWholeSpan(spans, s))
    .map(({ name, scope, expr, optional, nullable, start, end }) => ({ name, scope, expr, optional, nullable, start, end }));
}

/** Hunk line numbers from `git diff -U0` output: { removed: [...], added: [...] }. */
export function changedLineNumbers(diffText) {
  const removed = [];
  const added = [];
  for (const m of String(diffText).matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
    const [oldStart, oldLen = '1', newStart, newLen = '1'] = [m[1], m[2], m[3], m[4]];
    for (let k = 0; k < Number(oldLen); k++) removed.push(Number(oldStart) + k);
    for (let k = 0; k < Number(newLen); k++) added.push(Number(newStart) + k);
  }
  return { removed, added };
}

/** A field (or a quoted key) named `name` is declared somewhere in `source`. */
function declaredIn(source, name) {
  return new RegExp(`^\\s*(['"]?)${escapeRegExp(name)}\\1\\s*:`, 'm').test(String(source));
}

/** A `const`/`let`/`function` named `name` is declared somewhere in `source`. */
function declarationIn(source, name) {
  return new RegExp(`^\\s*(export\\s+)?(const|let|function)\\s+${escapeRegExp(name)}\\b`, 'm').test(String(source));
}

/**
 * `.strict()` calls on the changed lines of one side, minus those inside a
 * block that exists only on this side (a new strict sub-schema, a new optional
 * strict nested object): such a block constrains no doc that already exists,
 * and a new REQUIRED one is caught as a new required field anyway.
 */
function strictCallsOnChangedLines(source, lineNumbers, otherSource) {
  const lines = String(source).split('\n');
  const onlyHere = spansStartingOn(source, lineNumbers, otherSource).filter((s) => s.whole);
  let count = 0;
  for (const n of lineNumbers) {
    if (onlyHere.some((s) => s.start <= n && s.end >= n)) continue;
    count += (String(lines[n - 1] ?? '').replace(/\/\/.*$/, '').match(/\.strict\(\)/g) ?? []).length;
  }
  return count;
}

/**
 * Classify a stored-schema file's change. Field identity is the field NAME
 * within its module-level declaration, so a field that was reformatted or moved
 * inside its schema cancels out, while one moved to another schema is a
 * removal there and an addition here.
 *
 *   tightened — the new code reads old docs more strictly: a new required
 *               field, a field that lost `.optional()`/`.nullish()`/`.default()`,
 *               lost `.nullable()`, or `.strict()` appeared on an existing
 *               schema. Old docs make the new converter throw → needs a
 *               pre-deploy backfill.
 *   loosened  — installed clients read new docs more strictly than new code
 *               writes them: a required field removed or made optional/nullable.
 *               No backfill helps an old binary → needs a trailer.
 */
export function classifySchemaChange({ before, after, diff }) {
  const { removed, added } = changedLineNumbers(diff);
  const key = (f) => `${f.scope ?? ''}\0${f.name}`;
  const oldFields = new Map(fieldsStartingOn(before, removed, after).map((f) => [key(f), f]));
  const newFields = new Map(fieldsStartingOn(after, added, before).map((f) => [key(f), f]));

  // A field whose declaration is unchanged-but-elsewhere in the other version
  // (the diff split its lines unevenly) must not read as added/removed.
  const tightened = [];
  const loosened = [];
  for (const [k, nf] of newFields) {
    const { name } = nf;
    const of = oldFields.get(k);
    if (!of) {
      if (!nf.optional && !declaredInScope(before, name, nf.scope)) tightened.push(`${name}: new required field`);
      continue;
    }
    if (of.expr === nf.expr) continue;
    if (of.optional && !nf.optional) tightened.push(`${name}: no longer optional`);
    else if (of.nullable && !nf.nullable && !nf.optional) tightened.push(`${name}: no longer nullable`);
    else if (!of.optional && nf.optional) loosened.push(`${name}: became optional`);
    else if (!of.nullable && nf.nullable && !of.optional) loosened.push(`${name}: became nullable`);
  }
  for (const [k, of] of oldFields) {
    if (newFields.has(k) || declaredInScope(after, of.name, of.scope)) continue;
    if (!of.optional) loosened.push(`${of.name}: required field removed`);
  }
  if (strictCallsOnChangedLines(after, added, before) > strictCallsOnChangedLines(before, removed, after)) {
    tightened.push('.strict() added: unknown keys now throw');
  }
  return { tightened, loosened };
}

/**
 * A registered backfill that gates the deploy: on the harness (the sentinel
 * discovery imports by) and exporting `meta` with phase pre-deploy. A script
 * off the harness is invisible to the deploy's backfill gate, so it cannot
 * stand in for one.
 */
export function isPreDeployBackfill(source) {
  const s = String(source);
  return SENTINEL_RE.test(s) && /export\s+const\s+meta\b/.test(s) && /phase:\s*['"]pre-deploy['"]/.test(s);
}

// ---------------------------------------------------------------------------
// git
// ---------------------------------------------------------------------------

export function git(args, cwd = process.cwd()) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
}

/** File content at `ref`, or null when it does not exist there. */
export function showAt(ref, path, cwd) {
  try {
    return git(['show', `${ref}:${path}`], cwd);
  } catch {
    return null;
  }
}

/** Divergence point, or null when the clone is too shallow to have one. */
export function mergeBaseOf(base, head, cwd) {
  try {
    return git(['merge-base', base, head], cwd).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Non-merge commit messages in mergeBase..head, or null when the range is
 * empty — a detected change had to happen in SOME commit, so an empty range
 * means truncated history, not an absent trailer.
 */
export function commitMessagesInRange(mergeBase, head, cwd) {
  const msgs = git(['log', '--no-merges', '--pretty=format:%B%x1e', `${mergeBase}..${head}`], cwd)
    .split('\x1e')
    .map((s) => s.trim())
    .filter(Boolean);
  return msgs.length === 0 ? null : msgs;
}

export function argValue(argv, flag, fallback) {
  const hit = argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : fallback;
}

/**
 * The common prologue: resolve the merge-base or exit 1 with a shallow-clone
 * explanation. Compare against the divergence point, never the base tip —
 * against the tip, anything the base gained after the branch was cut looks
 * like something the branch removed.
 */
export function resolveRange(argv, cwd, tag) {
  const base = argValue(argv, '--base', 'origin/develop');
  const head = argValue(argv, '--head', 'HEAD');
  const mergeBase = mergeBaseOf(base, head, cwd);
  if (mergeBase === null) {
    console.error(`::error::[${tag}] No merge-base between ${head} and ${base} in this clone, so the branch's own changes cannot be isolated.`);
    console.error(`::error::[${tag}] This is shallow history, not the diff. CI fetches both histories first with scripts/ci-fetch-merge-base.sh.`);
    process.exit(1);
  }
  return { base, head, mergeBase };
}

/**
 * Decide on a detected change from the PR's trailers. `extraOk` is a
 * detector-specific satisfier (a pre-deploy backfill in the diff).
 * Returns { ok, message }.
 */
export function judge({ findings, msgs, tag, extraOk = null }) {
  if (findings.length === 0) return { ok: true, message: `[${tag}] nothing breaking detected — ok.` };
  if (extraOk) return { ok: true, message: `[${tag}] ${findings.join('; ')} — ${extraOk} — ok.` };
  if (msgs === null) {
    return {
      ok: false,
      message: `::error::[${tag}] Detected ${findings.join('; ')}, but the commit range is empty — truncated history, not a missing trailer. Deepen the fetch and re-run.`,
    };
  }
  const breaking = parseBreakingTrailers(msgs);
  if (breaking.length) return { ok: true, message: `[${tag}] ${findings.join('; ')} — declared Breaking-Client: ${breaking.join('; ')} — ok.` };
  const exempt = parseExemptTrailers(msgs);
  if (exempt.length) return { ok: true, message: `[${tag}] ${findings.join('; ')} — declared non-breaking: ${exempt.join('; ')} — ok (no wall).` };
  return { ok: false, message: null };
}

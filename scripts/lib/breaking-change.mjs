/**
 * Shared pieces of the two PR-time breaking-change detectors:
 *   scripts/check-callable-removal.mjs  — a client-reachable function vanished
 *   scripts/check-schema-change.mjs     — a stored Zod schema got stricter or looser
 *
 * Pure parsing lives here so it is unit-testable without git; the git helpers
 * at the bottom are the only IO. See docs/decisions/breaking-change-and-hard-wall.md.
 */

import { execFileSync } from 'node:child_process';

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

const DECLARATION_START = /^\s*(export\s+)?(const|let|function)\s+[A-Za-z_$]/;

/**
 * Zod fields declared in `source` that start on one of `lineNumbers`
 * (1-based), with their full expression — a field may span lines
 * (`foo: z\n  .string()\n  .optional(),`).
 *
 * Fields nested inside another changed span are dropped: the keys of a nested
 * object added or removed whole are that field's business (an optional
 * `stats: z.object({ n: z.number() }).optional()` adds no required field,
 * however required `n` is inside it), and the keys of a schema constant added
 * or removed whole only matter through the field that references it.
 */
export function fieldsStartingOn(source, lineNumbers) {
  const lines = String(source).split('\n');
  const fields = [];
  const containers = [];
  for (const n of lineNumbers) {
    const first = lines[n - 1];
    if (first === undefined) continue;
    if (DECLARATION_START.test(first)) {
      containers.push({ start: n, end: expressionEnd(lines, n) });
      continue;
    }
    const m = first.match(FIELD_START);
    if (!m) continue;
    const end = expressionEnd(lines, n);
    const expr = lines.slice(n - 1, end).join('\n');
    const name = m[1].replace(/^['"]|['"]$/g, '');
    const body = expr.slice(expr.indexOf(':') + 1).replace(/\s+/g, '').replace(/,$/, '');
    fields.push({
      name,
      expr: body,
      optional: OPTIONALISH.test(body),
      nullable: /\.nullable\(\)/.test(body),
      start: n,
      end,
    });
  }
  const spans = [...fields, ...containers];
  return fields.filter((f) => !spans.some((o) => o !== f && o.start < f.start && o.end >= f.start));
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

/**
 * Classify a stored-schema file's change. Field identity is the field NAME
 * within the file, so a field that only moved or was reformatted cancels out.
 *
 *   tightened — the new code reads old docs more strictly: a new required
 *               field, a field that lost `.optional()`/`.nullish()`/`.default()`,
 *               lost `.nullable()`, or `.strict()` appeared. Old docs make the
 *               new converter throw → needs a pre-deploy backfill.
 *   loosened  — installed clients read new docs more strictly than new code
 *               writes them: a required field removed or made optional/nullable.
 *               No backfill helps an old binary → needs a trailer.
 */
export function classifySchemaChange({ before, after, diff }) {
  const { removed, added } = changedLineNumbers(diff);
  const oldFields = new Map(fieldsStartingOn(before, removed).map((f) => [f.name, f]));
  const newFields = new Map(fieldsStartingOn(after, added).map((f) => [f.name, f]));
  // A field whose declaration is unchanged-but-elsewhere in the other version
  // (the diff split its lines unevenly) must not read as added/removed.
  const declaredIn = (source, name) =>
    new RegExp(`^\\s*(['"]?)${name.replace(/[$]/g, '\\$')}\\1\\s*:`, 'm').test(String(source));

  const tightened = [];
  const loosened = [];
  for (const [name, nf] of newFields) {
    const of = oldFields.get(name);
    if (!of) {
      if (!nf.optional && !declaredIn(before, name)) tightened.push(`${name}: new required field`);
      continue;
    }
    if (of.expr === nf.expr) continue;
    if (of.optional && !nf.optional) tightened.push(`${name}: no longer optional`);
    else if (of.nullable && !nf.nullable && !nf.optional) tightened.push(`${name}: no longer nullable`);
    else if (!of.optional && nf.optional) loosened.push(`${name}: became optional`);
    else if (!of.nullable && nf.nullable && !of.optional) loosened.push(`${name}: became nullable`);
  }
  for (const [name, of] of oldFields) {
    if (newFields.has(name) || declaredIn(after, name)) continue;
    if (!of.optional) loosened.push(`${name}: required field removed`);
  }
  const strictBefore = (String(before).match(/\.strict\(\)/g) ?? []).length;
  const strictAfter = (String(after).match(/\.strict\(\)/g) ?? []).length;
  if (strictAfter > strictBefore) tightened.push('.strict() added: unknown keys now throw');
  return { tightened, loosened };
}

/** A registered backfill that gates the deploy: exports `meta` with phase pre-deploy. */
export function isPreDeployBackfill(source) {
  const s = String(source);
  return /export\s+const\s+meta\b/.test(s) && /phase:\s*['"]pre-deploy['"]/.test(s);
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

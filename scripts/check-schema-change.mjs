#!/usr/bin/env node
/**
 * PR guardrail: a stored Zod schema that got stricter must ship with the
 * backfill that makes old data conform; one that got looser must be declared.
 *
 * Every Firestore read goes through a strict converter (makeConverter →
 * schema.parse), so the schema IS the compatibility contract, in both
 * directions:
 *
 *   TIGHTENED — new code reads old docs more strictly. A new required field,
 *     a field that lost `.optional()` / `.nullish()` / `.default()` /
 *     `.nullable()`, or a new `.strict()` on an existing schema. Every existing
 *     doc without it makes the new converter throw, so a registered
 *     `pre-deploy` backfill must be added or changed in the same PR: a script
 *     the registry discovers (a direct child of scripts/ or scripts/backfill/,
 *     on the harness) whose `meta` has `phase: 'pre-deploy'`. The deploy's
 *     backfill gate then refuses to ship the code to an env the backfill has
 *     not run on.
 *
 *   LOOSENED — installed clients read new docs more strictly than the new code
 *     writes them. A required field removed, or made optional / nullable: once
 *     new code writes a doc without it, every store build still requiring it
 *     throws on that doc. No backfill fixes an old binary, so only a trailer
 *     satisfies this: `Breaking-Client:` (the release raises minSupported), or
 *     `Breaking-Client-Exempt:` (e.g. new code still always writes the field —
 *     the step is the *expand*, the contract comes later).
 *
 * A trailer also satisfies TIGHTENED (e.g. `Breaking-Client-Exempt: every doc
 * already carries the field`).
 *
 * The heuristic, and its limits — it is a tripwire, not a type checker:
 *   - Scope: packages/shared/src/models/**.ts, minus *FormSchema.ts, index.ts
 *     and tests. A file ADDED by the PR is a new collection with no old data,
 *     so it is skipped. Schemas defined anywhere else are not seen.
 *   - Fields are recognised line-wise: `name: z…` or `name: SomethingSchema…`
 *     at the start of a line, the expression followed across continuation
 *     lines. Spreads (`...Base.shape`), `.extend({…})` passed in a variable,
 *     `.merge()`, `.pick()`/`.omit()` and changes inside a referenced schema
 *     (an enum gaining a value) are NOT seen.
 *   - Field identity is the name within the file. A name declared in another
 *     schema of the same file can mask an added or removed field.
 *   - Narrowing a type (`z.string()` → `z.enum([...])`, a new `.min()`) and
 *     WIDENING an enum (old clients throw on the new value) are not detected.
 *   - "Backfill in the diff" is not checked against the field — any changed
 *     pre-deploy backfill satisfies TIGHTENED. The conformance gate on every
 *     promotion is what verifies the data actually parses.
 *
 *   node scripts/check-schema-change.mjs --base=origin/develop [--head=HEAD]
 */

import { pathToFileURL } from 'node:url';
import {
  classifySchemaChange,
  commitMessagesInRange,
  git,
  isBackfillScriptPath,
  isPreDeployBackfill,
  isStoredSchemaFile,
  judge,
  resolveRange,
  showAt,
} from './lib/breaking-change.mjs';

const TAG = 'schema-change';

/** [{ status, path }] for mergeBase..head; renames are reported under the new path. */
function changedFiles(mergeBase, head, cwd) {
  return git(['diff', '--name-status', '-M', mergeBase, head], cwd)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      return { status: parts[0][0], path: parts[parts.length - 1], oldPath: parts[1] };
    });
}

export function analyse(mergeBase, head, cwd) {
  const files = changedFiles(mergeBase, head, cwd);
  const tightened = [];
  const loosened = [];
  for (const f of files) {
    if (!isStoredSchemaFile(f.path) || f.status === 'A' || f.status === 'D') continue;
    const before = showAt(mergeBase, f.oldPath, cwd) ?? '';
    const after = showAt(head, f.path, cwd) ?? '';
    const diff = git(['diff', '-U0', '-M', mergeBase, head, '--', f.oldPath, f.path], cwd);
    const r = classifySchemaChange({ before, after, diff });
    tightened.push(...r.tightened.map((x) => `${f.path} ${x}`));
    loosened.push(...r.loosened.map((x) => `${f.path} ${x}`));
  }
  const backfills = files
    .filter((f) => (f.status === 'A' || f.status === 'M' || f.status === 'R') && isBackfillScriptPath(f.path))
    .filter((f) => isPreDeployBackfill(showAt(head, f.path, cwd) ?? ''))
    .map((f) => f.path);
  return { tightened, loosened, backfills };
}

function main() {
  const cwd = process.cwd();
  const { head, mergeBase } = resolveRange(process.argv, cwd, TAG);
  const { tightened, loosened, backfills } = analyse(mergeBase, head, cwd);
  const anything = tightened.length + loosened.length > 0;
  const msgs = anything ? commitMessagesInRange(mergeBase, head, cwd) : [];
  let failed = false;

  const t = judge({
    findings: tightened,
    msgs,
    tag: `${TAG}:tightened`,
    extraOk: backfills.length ? `pre-deploy backfill in this PR: ${backfills.join(', ')}` : null,
  });
  if (t.ok) console.log(t.message);
  else {
    failed = true;
    console.error(t.message ?? `::error::[${TAG}] Stored schema got stricter with no pre-deploy backfill in this PR:\n  - ${tightened.join('\n  - ')}`);
    if (!t.message) {
      console.error(`::error::[${TAG}] Existing docs without the field make the converter throw. Add or update a registered backfill (phase: 'pre-deploy', see AGENTS.md "Backfills"), or declare \`Breaking-Client-Exempt: <why every doc already conforms>\`.`);
    }
  }

  const l = judge({ findings: loosened, msgs, tag: `${TAG}:loosened` });
  if (l.ok) console.log(l.message);
  else {
    failed = true;
    console.error(l.message ?? `::error::[${TAG}] Stored schema got looser — installed clients still require:\n  - ${loosened.join('\n  - ')}`);
    if (!l.message) {
      console.error(`::error::[${TAG}] Once new code writes a doc without these, every store build that requires them throws reading it. Keep writing the field until minSupported passes (expand → migrate → contract) and declare \`Breaking-Client-Exempt: <reason>\`, or declare the break with \`Breaking-Client: <reason>\`. See docs/decisions/breaking-change-and-hard-wall.md`);
    }
  }
  if (failed) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

#!/usr/bin/env node
/**
 * check-dev-conformance.mjs
 *
 * Read-only conformance check: walks every collection in the target Firestore
 * env (default dev `villa-events`; `--env beta|prod` for the others) and
 * validates each doc against its current Zod schema — the exact same
 * `schema.parse` the app runs on read (see makeConverter).
 *
 * Why this exists: adding a required field to a model and forgetting to
 * backfill existing dev docs makes the strict converter throw on read, which
 * crashes whatever screen reads that collection. This surfaces the drift as a
 * report instead of a runtime crash. Pairs with the per-field backfill scripts
 * under scripts/ and the AGENTS.md "backfill dev when a field is added" rule.
 *
 * USAGE
 *   pnpm shared:build && node scripts/check-dev-conformance.mjs
 *   (or: pnpm check:dev-conformance)
 *   beta/prod: env -u GOOGLE_APPLICATION_CREDENTIALS node \
 *     scripts/check-dev-conformance.mjs --env beta
 *
 * Exits non-zero when any doc fails to parse, so it is CI-wireable.
 *
 * WHAT IT WALKS
 *   `conformanceTargets` from @cultuvilla/shared/firebase/refs/admin, derived
 *   from the one collection table (packages/shared/src/firebase/refs/collections.ts):
 *   every collection with a schema, subcollections at any depth included. A
 *   collection declared there is gated with nothing else to remember.
 *
 * HOW IT VALIDATES
 *   Each target carries the admin converter its readers use; `fromFirestore`
 *   (→ schema.parse) runs per doc in a try/catch, so every bad doc is collected
 *   instead of the first one aborting the run.
 *
 * ONE QUERY PER COLLECTION ID, CLASSIFIED BY PATH (scripts/lib/conformance-walk.mjs)
 *   Each collection id is streamed once as a collection group, and each doc is
 *   matched to the target whose path template fits its path. Ids collide —
 *   municipalities/{}/members (VillageMember) and organizations/{}/members
 *   (OrgMember) share `members` — so the path, not the id, picks the schema.
 *   This replaced one query per parent doc, which turned the gate into a
 *   30-minute timeout during the 0.21.0 release (~24k sequential reads).
 *
 * ORPHANS WARN, THEY DO NOT FAIL
 *   A collection group also reaches docs whose parent doc was deleted, which
 *   the old walk from parent to child never saw. A doc that fails to parse
 *   under a missing ancestor is reported as an orphan instead of failing the
 *   gate: no reader reaches it by path, and failing on it would gate
 *   promotions on data the gate had never walked before.
 *
 * UNMODELED FIELDS (warnings)
 *   Keys a stored doc carries that the schema drops on parse. Listed here; the
 *   weekly audit (scripts/audit-firestore-schemas.mjs) ratchets them.
 *
 * DRIFT GUARDS (warnings)
 *   - a live root collection the table does not declare;
 *   - a doc, under a walked collection id, at a path no template matches —
 *     a subcollection that exists in data but not in the table.
 */

import admin from 'firebase-admin';
import { initAdminForEnv } from './lib/env-credentials.mjs';
import { conformanceTargets, collectionPaths } from '@cultuvilla/shared/firebase/refs/admin';
import { display, walkConformance } from './lib/conformance-walk.mjs';

// `--env dev|beta|prod` (default dev). Read-only check — safe against any env,
// so no `--yes` gate. For --env beta/prod, unset GOOGLE_APPLICATION_CREDENTIALS
// first so the resolver uses the stored ADC (a dev key would auth to the wrong
// project).
function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}
const envArg = argValue('--env') ?? 'dev';

const { env, projectId } = initAdminForEnv(envArg);
console.log(`Conformance target: ${env} (${projectId})\n`);
const db = admin.firestore();

function report(label, result) {
  const status = result.bad.length === 0 ? 'OK' : `${result.bad.length} NONCONFORMING`;
  console.log(`  ${label}: ${result.total} docs — ${status}`);
  for (const { id, issues } of result.bad) {
    console.log(`    ✗ ${id}`);
    for (const issue of issues) console.log(`        ${issue.path}: ${issue.message}`);
  }
}

async function main() {
  console.log(`Conformance check against ${projectId}\n`);
  const walk = await walkConformance(db, { targets: conformanceTargets, collectionPaths });

  let totalBad = 0;
  for (const target of walk.targets) {
    report(display(target.path), target);
    totalBad += target.bad.length;
  }

  if (walk.orphans.length > 0) {
    console.log(`\n⚠ ${walk.orphans.length} nonconforming doc(s) under a deleted parent (not counted):`);
    for (const { id, issues } of walk.orphans) {
      console.log(`    ✗ ${id}\n        ${issues.map((i) => `${i.path}: ${i.message}`).join('\n        ')}`);
    }
  }

  if (walk.unmatched.length > 0) {
    console.log(`\n⚠ Docs at paths no collection declares (add to refs/collections.ts): ${walk.unmatched.join(', ')}`);
  }

  if (walk.undeclared.length > 0) {
    console.log(`\n⚠ Undeclared root collections (add to refs/collections.ts): ${walk.undeclared.join(', ')}`);
  }

  // Reported, never failed on here: the weekly schema audit
  // (audit-firestore-schemas.mjs) holds these at a baseline that may only shrink.
  if (walk.unmodeled.size > 0) {
    console.log(`\n⚠ ${walk.unmodeled.size} unmodeled field path(s) — stored, but dropped by the schema:`);
    for (const [signature, { count }] of [...walk.unmodeled].sort()) console.log(`    ${signature} (${count})`);
  }

  console.log(`\n${totalBad === 0 ? 'PASS' : `FAIL: ${totalBad} nonconforming docs`}`);
  process.exit(totalBad === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

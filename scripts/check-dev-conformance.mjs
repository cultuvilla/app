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
 * ONE QUERY PER COLLECTION ID, CLASSIFIED BY PATH
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
 * DRIFT GUARDS (warnings)
 *   - a live root collection the table does not declare;
 *   - a doc, under a walked collection id, at a path no template matches —
 *     a subcollection that exists in data but not in the table.
 */

import admin from 'firebase-admin';
import { initAdminForEnv } from './lib/env-credentials.mjs';
import { conformanceTargets, collectionPaths } from '@cultuvilla/shared/firebase/refs/admin';

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

/** Format a caught converter error into `path: message` lines, one per zod issue. */
function formatIssues(err) {
  if (err && Array.isArray(err.issues)) {
    return err.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`);
  }
  return [String(err?.message ?? err)];
}

/** `a/{x}/b` → a regex matching a document path directly under that collection. */
function templateRegex(path) {
  const segments = path.split('/').map((s) => (s.startsWith('{') ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  return new RegExp(`^${segments.join('/')}/[^/]+$`);
}

/** True when every ancestor doc of `ref` exists. Read only for docs that fail to parse. */
async function ancestorsExist(ref) {
  for (let parent = ref.parent.parent; parent; parent = parent.parent.parent) {
    if (!(await parent.get()).exists) return false;
  }
  return true;
}

const display = (path) => path.replace(/\{[^}]+\}/g, '*');

function report(label, result) {
  const status = result.bad.length === 0 ? 'OK' : `${result.bad.length} NONCONFORMING`;
  console.log(`  ${label}: ${result.total} docs — ${status}`);
  for (const { id, issues } of result.bad) {
    console.log(`    ✗ ${id}`);
    for (const issue of issues) console.log(`        ${issue}`);
  }
}

async function main() {
  console.log(`Conformance check against ${projectId}\n`);
  let totalBad = 0;

  const byId = new Map();
  for (const target of conformanceTargets) {
    const id = target.path.slice(target.path.lastIndexOf('/') + 1);
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push({ ...target, regex: templateRegex(target.path), total: 0, bad: [] });
  }

  const unmatched = new Set();
  const orphans = [];
  for (const [id, targets] of byId) {
    for await (const doc of db.collectionGroup(id).stream()) {
      const target = targets.find((t) => t.regex.test(doc.ref.path));
      if (!target) {
        unmatched.add(doc.ref.parent.path.replace(/\/[^/]+\//g, '/*/'));
        continue;
      }
      target.total += 1;
      try {
        target.converter.fromFirestore(doc);
      } catch (err) {
        const finding = { id: doc.ref.path, issues: formatIssues(err) };
        if (await ancestorsExist(doc.ref)) target.bad.push(finding);
        else orphans.push(finding);
      }
    }
    for (const target of targets) {
      report(display(target.path), target);
      totalBad += target.bad.length;
    }
  }

  if (orphans.length > 0) {
    console.log(`\n⚠ ${orphans.length} nonconforming doc(s) under a deleted parent (not counted):`);
    for (const { id, issues } of orphans) console.log(`    ✗ ${id}\n        ${issues.join('\n        ')}`);
  }

  if (unmatched.size > 0) {
    console.log(`\n⚠ Docs at paths no collection declares (add to refs/collections.ts): ${[...unmatched].join(', ')}`);
  }

  // `_admin` is server-only operational state (backfill completion markers —
  // see scripts/lib/backfill-registry.mjs), not domain data.
  const declaredRoots = new Set([...collectionPaths.map((p) => p.split('/')[0]), '_admin']);
  const liveRoots = await db.listCollections();
  const undeclared = liveRoots.map((c) => c.id).filter((id) => !declaredRoots.has(id));
  if (undeclared.length > 0) {
    console.log(`\n⚠ Undeclared root collections (add to refs/collections.ts): ${undeclared.join(', ')}`);
  }

  console.log(`\n${totalBad === 0 ? 'PASS' : `FAIL: ${totalBad} nonconforming docs`}`);
  process.exit(totalBad === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

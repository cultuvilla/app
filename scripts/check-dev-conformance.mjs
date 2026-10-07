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
 * HOW IT VALIDATES
 *   It reuses the admin converters via @cultuvilla/shared/firebase/refs/admin.
 *   A converter-attached ref invokes `fromFirestore` (→ schema.parse) lazily on
 *   `doc.data()`, so we call `doc.data()` per doc in a try/catch and collect the
 *   thrown ZodError instead of letting the first bad doc abort the run.
 *
 * SCHEMA-BY-PATH, NOT collectionGroup
 *   Subcollection ids collide — municipalities/{}/members (VillageMember) and
 *   organizations/{}/members (OrgMember) share the id `members` but use
 *   different schemas. The registry below walks explicit paths (mirroring
 *   refs/admin.ts) so path context selects the right schema.
 *
 * LIMITATION
 *   The registry is hand-authored. The root-level drift guard flags a *new
 *   root* collection that nobody registered; new *subcollections* are not
 *   auto-detected. Keep this registry in sync with refs/admin.ts.
 */

import admin from 'firebase-admin';
import { initAdminForEnv } from './lib/env-credentials.mjs';
import {
  eventsCollection,
  eventRegistrationsCollection,
  municipalitiesCollection,
  municipalityBarriosCollection,
  municipalityPlacesCollection,
  municipalityMembersCollection,
  organizationsCollection,
  organizationMembersCollection,
  organizationJoinRequestsCollection,
  festivalPostersCollection,
  organizerRequestsCollection,
  personsCollection,
  usersCollection,
  publicProfilesCollection,
  censoAnswersCollection,
  userNotificationsCollection,
  userDevicesCollection,
  userPreferencesCollection,
  pushQueueCollection,
  newsCollection,
  commentsCollection,
  occupationsCollection,
  membershipEventsCollection,
  moderationEventsCollection,
  adminsCollection,
  municipalityPeopleCollection,
  vocabularyTermsCollection,
  vocabularyDefinitionsCollection,
  vocabularyWordsCollection,
  historyEntriesCollection,
  contentReportsCollection,
  villageWrappedCollection,
} from '@cultuvilla/shared/firebase/refs/admin';

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

/**
 * Path tree mirroring packages/shared/src/firebase/refs/admin.ts.
 * `coll(db)` returns a converter-attached top-level collection ref.
 * `subs[].coll(db, parentId)` returns a converter-attached subcollection ref.
 */
const REGISTRY = [
  {
    name: 'events',
    coll: (db) => eventsCollection(db),
    subs: [{ name: 'registrations', coll: (db, id) => eventRegistrationsCollection(db, id) }],
  },
  {
    name: 'municipalities',
    coll: (db) => municipalitiesCollection(db),
    // ~6k municipalities are INE reference data with no community and no
    // subcollections (members/joinRequests/barrios/places only
    // exist once a village is activated). Skip the subcollection round-trips
    // for inactive ones.
    //
    // A parent that fails to parse is NOT descended into. It used to be, on the
    // reasoning that a drifted municipality shouldn't hide drift below it — but
    // the parent failure is already the finding, and the cost of that choice
    // lands exactly when the gate is doing its job: on a missing required field
    // every one of the ~6k reference docs throws, so every one gets 4 sequential
    // subcollection reads. ~24k round trips turned a 6-second gate into a
    // 30-minute job timeout during the 0.21.0 release, reported as a timeout
    // rather than "N nonconforming docs". Fail fast and legibly instead;
    // subcollection drift surfaces on the next run, once the parent parses.
    descend: (doc) => {
      try {
        return doc.data().communityActive === true;
      } catch {
        return false;
      }
    },
    subs: [
      { name: 'barrios', coll: (db, id) => municipalityBarriosCollection(db, id) },
      { name: 'places', coll: (db, id) => municipalityPlacesCollection(db, id) },
      { name: 'members', coll: (db, id) => municipalityMembersCollection(db, id) },
    ],
  },
  {
    name: 'organizations',
    coll: (db) => organizationsCollection(db),
    subs: [
      { name: 'members', coll: (db, id) => organizationMembersCollection(db, id) },
      { name: 'joinRequests', coll: (db, id) => organizationJoinRequestsCollection(db, id) },
    ],
  },
  { name: 'festivalPosters', coll: (db) => festivalPostersCollection(db) },
  { name: 'organizerRequests', coll: (db) => organizerRequestsCollection(db) },
  { name: 'persons', coll: (db) => personsCollection(db) },
  {
    name: 'users',
    coll: (db) => usersCollection(db),
    subs: [
      { name: 'notifications', coll: (db, id) => userNotificationsCollection(db, id) },
      { name: 'devices', coll: (db, id) => userDevicesCollection(db, id) },
      { name: 'preferences', coll: (db, id) => userPreferencesCollection(db, id) },
    ],
  },
  { name: 'publicProfiles', coll: (db) => publicProfilesCollection(db) },
  { name: 'censoAnswers', coll: (db) => censoAnswersCollection(db) },
  { name: 'pushQueue', coll: (db) => pushQueueCollection(db) },
  { name: 'news', coll: (db) => newsCollection(db) },
  { name: 'comments', coll: (db) => commentsCollection(db) },
  { name: 'occupations', coll: (db) => occupationsCollection(db) },
  { name: 'membershipEvents', coll: (db) => membershipEventsCollection(db) },
  { name: 'moderationEvents', coll: (db) => moderationEventsCollection(db) },
  { name: 'admins', coll: (db) => adminsCollection(db) },
  { name: 'municipalityPeople', coll: (db) => municipalityPeopleCollection(db) },
  { name: 'vocabularyTerms', coll: (db) => vocabularyTermsCollection(db) },
  { name: 'vocabularyDefinitions', coll: (db) => vocabularyDefinitionsCollection(db) },
  { name: 'vocabularyWords', coll: (db) => vocabularyWordsCollection(db) },
  { name: 'historyEntries', coll: (db) => historyEntriesCollection(db) },
  { name: 'contentReports', coll: (db) => contentReportsCollection(db) },
  { name: 'villageWrapped', coll: (db) => villageWrappedCollection(db) },
];

/** Format a caught converter error into `path: message` lines, one per zod issue. */
function formatIssues(err) {
  if (err && Array.isArray(err.issues)) {
    return err.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`);
  }
  return [String(err?.message ?? err)];
}

/**
 * Validate one converter-attached collection ref. Returns
 * { docs: <DocumentSnapshot[]>, total, bad: [{ id, issues }] }.
 * Snapshots are returned so the caller can descend into subcollections by id
 * even for docs whose own data() throws.
 */
async function checkRef(label, ref) {
  const snap = await ref.get();
  const bad = [];
  for (const doc of snap.docs) {
    try {
      doc.data();
    } catch (err) {
      bad.push({ id: doc.id, issues: formatIssues(err) });
    }
  }
  return { label, docs: snap.docs, total: snap.size, bad };
}

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

  for (const entry of REGISTRY) {
    const parent = await checkRef(entry.name, entry.coll(db));
    report(entry.name, parent);
    totalBad += parent.bad.length;

    const parentsToDescend = entry.descend ? parent.docs.filter(entry.descend) : parent.docs;
    for (const sub of entry.subs ?? []) {
      // Aggregate every parent's subcollection into one count for the report.
      let subTotal = 0;
      const subBad = [];
      for (const parentDoc of parentsToDescend) {
        const res = await checkRef(`${entry.name}/${parentDoc.id}/${sub.name}`, sub.coll(db, parentDoc.id));
        subTotal += res.total;
        for (const b of res.bad) subBad.push({ id: `${parentDoc.id}/${sub.name}/${b.id}`, issues: b.issues });
      }
      report(`${entry.name}/*/${sub.name}`, { total: subTotal, bad: subBad });
      totalBad += subBad.length;
    }
  }

  // Drift guard: a live root collection nobody registered for conformance.
  // `_admin` is server-only operational state (backfill completion markers —
  // see scripts/lib/backfill-registry.mjs), not domain data: it has no model,
  // no converter, and no client reader, so there is nothing to conform.
  const registered = new Set([...REGISTRY.map((e) => e.name), '_admin']);
  const liveRoots = await db.listCollections();
  const unregistered = liveRoots.map((c) => c.id).filter((id) => !registered.has(id));
  if (unregistered.length > 0) {
    console.log(`\n⚠ Unregistered root collections (add to REGISTRY): ${unregistered.join(', ')}`);
  }

  console.log(`\n${totalBad === 0 ? 'PASS' : `FAIL: ${totalBad} nonconforming docs`}`);
  process.exit(totalBad === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

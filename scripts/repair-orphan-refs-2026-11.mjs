#!/usr/bin/env node
/**
 * repair-orphan-refs-2026-11.mjs — reviewed one-off (prod-data-repair skill).
 * Delete once spent: Delete > deprecate.
 *
 * Repairs what three referential-integrity invariants find (the same registry
 * `pnpm audit:refs` runs, so the counts are the audit's by construction):
 *
 *   eventRegistrations.personId.exists — a registration whose persona was
 *     deleted. Cancelled the way `cancelRegistration` cancels a solo seat: the
 *     registration and its registrationPrivate half are deleted and a roster
 *     audit entry is written, in one transaction. The event's confirmedCount /
 *     totalCount and waitlist promotion are NOT touched here: the deployed
 *     `onRegistrationDeleted` trigger recomputes the counters from the roster
 *     and promotes the waitlist, exactly as it does after the callable. A seat
 *     in a group is skipped and reported — cancelling a group is atomic and
 *     would take living people's seats with it; that needs a human.
 *   organizationMembers.parent.exists — an integrante of a deleted group. The
 *     member doc is deleted and a `removed` membershipEvents entry is written in
 *     the same transaction, as deleteAccount's removeMemberships does. Its
 *     municipalityId comes from the group's earlier membershipEvents (the org
 *     doc that held it is gone); with none to read, the row is skipped.
 *   eventRegistrationPrivate.registration.exists — personal answers whose
 *     registration is gone. Deleted.
 *
 * Every write re-checks its premise inside the transaction (the reference is
 * still dangling), so a re-run, or a race with the app, changes nothing.
 * Audit entries name no person: actorUserId is '' — nobody performed the
 * removal; this repair did — the same convention as waitlist promotion.
 *
 * USAGE
 *   node scripts/repair-orphan-refs-2026-11.mjs                       # dev, dry run
 *   node scripts/repair-orphan-refs-2026-11.mjs --apply               # dev, writes
 *   node scripts/repair-orphan-refs-2026-11.mjs --env=prod --confirm  # prod, dry run
 *   node scripts/repair-orphan-refs-2026-11.mjs --env=prod --apply --confirm
 *   Run with `env -u GOOGLE_APPLICATION_CREDENTIALS` (prod-data-repair skill).
 *
 * Every run (dry or not) first snapshots the raw JSON of every document it
 * would touch to ~/backups/cultuvilla/2026-11-27-orphan-refs-<env>/ — outside
 * the repo and the scratchpad. Output is paths and ids only, never PII.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import admin from 'firebase-admin';
import { buildMembershipEventData, buildRegistrationEventData } from '@cultuvilla/shared/models';
import { buildSnapshot, collectionsFor, loadQueries, registry, runInvariants } from '@cultuvilla/shared/validation';
import { initAdminForEnv } from './lib/env-credentials.mjs';
import { isMain } from './lib/backfill-harness.mjs';

export const INVARIANTS = {
  registration: 'eventRegistrations.personId.exists',
  member: 'organizationMembers.parent.exists',
  privateHalf: 'eventRegistrationPrivate.registration.exists',
};

/** `events/{e}/registrations/{r}` → `events/{e}/registrationPrivate/{r}`. */
export function privatePathOf(registrationPath) {
  const [events, eventId, registrations, regId] = registrationPath.split('/');
  if (events !== 'events' || registrations !== 'registrations' || !regId) {
    throw new Error(`Not a registration path: ${registrationPath}`);
  }
  return `events/${eventId}/registrationPrivate/${regId}`;
}

/** `events/{e}/registrationPrivate/{r}` → `events/{e}/registrations/{r}`. */
export function registrationPathOf(privatePath) {
  const [events, eventId, privates, regId] = privatePath.split('/');
  if (events !== 'events' || privates !== 'registrationPrivate' || !regId) {
    throw new Error(`Not a registrationPrivate path: ${privatePath}`);
  }
  return `events/${eventId}/registrations/${regId}`;
}

/** `organizations/{o}/members/{u}` → `{ orgId, userId }`. */
export function memberPathParts(memberPath) {
  const [orgs, orgId, members, userId] = memberPath.split('/');
  if (orgs !== 'organizations' || members !== 'members' || !userId) {
    throw new Error(`Not an organization member path: ${memberPath}`);
  }
  return { orgId, userId };
}

/**
 * Turn the audit's violations plus the loaded rows into the repair plan.
 * Pure: `docs` maps a path to its raw data (only what the invariants read).
 * `orgMunicipality` maps an orgId to the municipalityId its membershipEvents
 * recorded, or is missing the orgId when none exist.
 */
export function planRepair({ violations, docs, orgMunicipality }) {
  const plan = { cancel: [], removeMember: [], deletePrivate: [], skipped: [] };
  for (const v of violations) {
    if (v.invariant === INVARIANTS.registration) {
      const reg = docs.get(v.path);
      if (!reg) continue;
      if (reg.groupId) {
        plan.skipped.push({ path: v.path, reason: 'group seat — cancelling a group is atomic; needs a human' });
        continue;
      }
      plan.cancel.push({ path: v.path, privatePath: privatePathOf(v.path), missingPersonId: v.value });
    } else if (v.invariant === INVARIANTS.member) {
      const { orgId, userId } = memberPathParts(v.path);
      const municipalityId = orgMunicipality.get(orgId);
      if (!municipalityId) {
        plan.skipped.push({ path: v.path, reason: 'no membershipEvents record the group municipality' });
        continue;
      }
      const member = docs.get(v.path) ?? {};
      plan.removeMember.push({
        path: v.path,
        orgId,
        userId: typeof member.userId === 'string' && member.userId ? member.userId : userId,
        role: typeof member.role === 'string' ? member.role : null,
        municipalityId,
      });
    } else if (v.invariant === INVARIANTS.privateHalf) {
      plan.deletePrivate.push({ path: v.path, registrationPath: registrationPathOf(v.path) });
    }
  }
  return plan;
}

/** The roster audit entry a solo cancellation writes (see cancelRegistration). */
export function cancellationEntry(regId, reg) {
  return buildRegistrationEventData({
    registrationId: regId,
    // The seat's holder removed the persona it named; nobody removed the seat.
    action: 'cancelled_self',
    actorUserId: '',
    subjectUserId: typeof reg.userId === 'string' ? reg.userId : '',
    personId: typeof reg.personId === 'string' ? reg.personId : '',
    name: typeof reg.name === 'string' ? reg.name : '',
    status: reg.status,
    groupId: null,
  });
}

/** The `removed` entry deleteAccount's removeMemberships writes, for an org. */
export function removalEntry(item) {
  return buildMembershipEventData({
    scopeType: 'org',
    scopeId: item.orgId,
    municipalityId: item.municipalityId,
    actorUserId: '',
    targetUserId: item.userId,
    action: 'removed',
    fromRole: item.role,
    toRole: null,
  });
}

/** JSON-safe copy of raw Firestore data: Timestamps, GeoPoints and refs tagged. */
export function toSnapshotJson(value) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof admin.firestore.Timestamp) return { __timestamp: value.toDate().toISOString() };
  if (value instanceof admin.firestore.GeoPoint) return { __geopoint: [value.latitude, value.longitude] };
  if (value instanceof admin.firestore.DocumentReference) return { __ref: value.path };
  if (Array.isArray(value)) return value.map(toSnapshotJson);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toSnapshotJson(v)]));
}

function arg(flag) {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : undefined;
}
const has = (flag) => process.argv.includes(flag);

async function main() {
  const envArg = arg('--env') ?? 'dev';
  const apply = has('--apply');
  if (envArg !== 'dev' && !has('--confirm')) {
    console.error(`Refusing to touch ${envArg} without --confirm (dry run included).`);
    process.exit(1);
  }
  const { env, projectId } = initAdminForEnv(envArg);
  const db = admin.firestore();
  const log = (...a) => console.log(`[repair-orphan-refs][${env}]`, ...a);
  log(`${apply ? 'APPLY' : 'DRY RUN'} against ${projectId}`);

  const selected = registry.filter((inv) => Object.values(INVARIANTS).includes(inv.id));
  const keys = collectionsFor(selected);
  const raw = [];
  for (const query of loadQueries(keys)) {
    const source = query.group ? db.collectionGroup(query.collectionId) : db.collection(query.collectionId);
    for await (const doc of source.stream()) raw.push({ path: doc.ref.path, data: doc.data() });
  }
  const violations = runInvariants(buildSnapshot(raw, keys), selected);
  const docs = new Map(raw.map((r) => [r.path, r.data]));
  for (const id of Object.values(INVARIANTS)) {
    log(`found ${id}: ${violations.filter((v) => v.invariant === id).length}`);
  }

  const orgIds = [...new Set(violations.filter((v) => v.invariant === INVARIANTS.member).map((v) => memberPathParts(v.path).orgId))];
  const orgMunicipality = new Map();
  for (const orgId of orgIds) {
    const events = await db.collection('membershipEvents').where('scopeId', '==', orgId).get();
    const hit = events.docs.map((d) => d.data()).find((e) => e.scopeType === 'org' && e.municipalityId);
    if (hit) orgMunicipality.set(orgId, hit.municipalityId);
  }

  const plan = planRepair({ violations, docs, orgMunicipality });

  // Snapshot every document the plan touches, before any write.
  const touched = [
    ...plan.cancel.flatMap((c) => [c.path, c.privatePath]),
    ...plan.removeMember.map((m) => m.path),
    ...plan.deletePrivate.map((p) => p.path),
  ];
  const eventIds = [...new Set(plan.cancel.map((c) => c.path.split('/')[1]))];
  const snapshot = [];
  for (const p of [...touched, ...eventIds.map((e) => `events/${e}`)]) {
    const snap = await db.doc(p).get();
    if (snap.exists) snapshot.push({ path: p, data: toSnapshotJson(snap.data()) });
  }
  const dir = arg('--snapshot-dir') ?? path.join(os.homedir(), 'backups', 'cultuvilla', `2026-11-27-orphan-refs-${env}`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${apply ? 'apply' : 'dryrun'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, `${JSON.stringify({ env, projectId, at: new Date().toISOString(), apply, docs: snapshot }, null, 2)}\n`, { mode: 0o600 });
  log(`snapshot: ${snapshot.length} docs → ${file}`);

  const before = new Map();
  for (const eventId of eventIds) {
    const event = (await db.doc(`events/${eventId}`).get()).data() ?? {};
    const waitlisted = (await db.collection(`events/${eventId}/registrations`).where('status', '==', 'waitlisted').count().get()).data().count;
    before.set(eventId, { confirmedCount: event.confirmedCount, totalCount: event.totalCount, waitlisted });
  }

  const done = { cancelled: 0, privateWithSeat: 0, membersRemoved: 0, privateDeleted: 0, alreadyFixed: 0 };

  for (const c of plan.cancel) {
    const regRef = db.doc(c.path);
    const privRef = db.doc(c.privatePath);
    const result = await db.runTransaction(async (tx) => {
      const [regSnap, privSnap] = await Promise.all([tx.get(regRef), tx.get(privRef)]);
      const reg = regSnap.data();
      if (!reg) return 'gone';
      if (reg.groupId) return 'group';
      const personSnap = await tx.get(db.doc(`persons/${reg.personId}`));
      if (personSnap.exists) return 'person-exists';
      if (apply) {
        tx.delete(regRef);
        tx.delete(privRef);
        tx.set(db.collection(`events/${regRef.parent.parent.id}/registrationEvents`).doc(), cancellationEntry(regRef.id, reg));
      }
      return { status: reg.status, hadPrivate: privSnap.exists };
    });
    if (typeof result === 'string') {
      log(`  skip ${c.path}: ${result}`);
      done.alreadyFixed += 1;
      continue;
    }
    done.cancelled += 1;
    if (result.hadPrivate) done.privateWithSeat += 1;
    log(`  cancel ${c.path} (status ${result.status}, persons/${c.missingPersonId} missing)` +
      `${result.hadPrivate ? ` + delete ${c.privatePath}` : ''} + registrationEvents cancelled_self`);
  }

  for (const m of plan.removeMember) {
    const ref = db.doc(m.path);
    const result = await db.runTransaction(async (tx) => {
      const [memberSnap, orgSnap] = await Promise.all([tx.get(ref), tx.get(db.doc(`organizations/${m.orgId}`))]);
      if (!memberSnap.exists) return 'gone';
      if (orgSnap.exists) return 'org-exists';
      if (apply) {
        tx.delete(ref);
        tx.set(db.collection('membershipEvents').doc(), removalEntry(m));
      }
      return 'ok';
    });
    if (result !== 'ok') {
      log(`  skip ${m.path}: ${result}`);
      done.alreadyFixed += 1;
      continue;
    }
    done.membersRemoved += 1;
    log(`  delete ${m.path} (role ${m.role}) + membershipEvents removed (municipality ${m.municipalityId})`);
  }

  for (const p of plan.deletePrivate) {
    const ref = db.doc(p.path);
    const result = await db.runTransaction(async (tx) => {
      const [privSnap, regSnap] = await Promise.all([tx.get(ref), tx.get(db.doc(p.registrationPath))]);
      if (!privSnap.exists) return 'gone';
      if (regSnap.exists) return 'registration-exists';
      if (apply) tx.delete(ref);
      return 'ok';
    });
    if (result !== 'ok') {
      log(`  skip ${p.path}: ${result}`);
      done.alreadyFixed += 1;
      continue;
    }
    done.privateDeleted += 1;
    log(`  delete ${p.path} (no ${p.registrationPath})`);
  }

  for (const s of plan.skipped) log(`  SKIPPED ${s.path}: ${s.reason}`);
  for (const [eventId, b] of before) {
    const cancelledHere = plan.cancel.filter((c) => c.path.split('/')[1] === eventId).length;
    log(`  events/${eventId}: confirmedCount ${b.confirmedCount}, totalCount ${b.totalCount}, waitlisted ${b.waitlisted}; ` +
      `${cancelledHere} seat(s) cancelled — onRegistrationDeleted recomputes the counts and promotes`);
  }
  log(`${apply ? 'APPLIED' : 'WOULD APPLY'}: ${JSON.stringify(done)}; skipped ${plan.skipped.length}`);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error('Repair failed:', err?.stack ?? err);
    process.exit(1);
  });
}

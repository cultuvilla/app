import { test } from 'node:test';
import assert from 'node:assert/strict';
import admin from 'firebase-admin';
import {
  INVARIANTS,
  cancellationEntry,
  memberPathParts,
  planRepair,
  privatePathOf,
  registrationPathOf,
  removalEntry,
  toSnapshotJson,
} from '../repair-orphan-refs-2026-11.mjs';

const REG = 'events/e1/registrations/r1';
const GROUP_REG = 'events/e1/registrations/r2';
const MEMBER = 'organizations/o1/members/u1';
const LOST_MEMBER = 'organizations/o2/members/u2';
const PRIV = 'events/e2/registrationPrivate/r9';

function fixture() {
  const docs = new Map([
    [REG, { userId: 'holder', personId: 'p-gone', name: 'X', status: 'confirmed', groupId: null }],
    [GROUP_REG, { userId: 'holder', personId: 'p-gone2', name: 'Y', status: 'confirmed', groupId: 'g1' }],
    [MEMBER, { userId: 'u1', role: 'admin' }],
    [LOST_MEMBER, { userId: 'u2', role: 'member' }],
    [PRIV, { phone: 'x' }],
  ]);
  const violations = [
    { invariant: INVARIANTS.registration, path: REG, value: 'p-gone' },
    { invariant: INVARIANTS.registration, path: GROUP_REG, value: 'p-gone2' },
    { invariant: INVARIANTS.member, path: MEMBER },
    { invariant: INVARIANTS.member, path: LOST_MEMBER },
    { invariant: INVARIANTS.privateHalf, path: PRIV },
    { invariant: 'events.totalCount.matches', path: 'events/e1' },
  ];
  return { docs, violations, orgMunicipality: new Map([['o1', 'm1']]) };
}

test('paths map between a registration and its private half', () => {
  assert.equal(privatePathOf(REG), 'events/e1/registrationPrivate/r1');
  assert.equal(registrationPathOf(PRIV), 'events/e2/registrations/r9');
  assert.deepEqual(memberPathParts(MEMBER), { orgId: 'o1', userId: 'u1' });
  assert.throws(() => privatePathOf(PRIV));
  assert.throws(() => registrationPathOf(REG));
  assert.throws(() => memberPathParts('municipalities/m1/members/u1'));
});

test('plans one action per finding of the three invariants and nothing else', () => {
  const plan = planRepair(fixture());
  assert.deepEqual(plan.cancel, [{ path: REG, privatePath: 'events/e1/registrationPrivate/r1', missingPersonId: 'p-gone' }]);
  assert.deepEqual(plan.removeMember, [{ path: MEMBER, orgId: 'o1', userId: 'u1', role: 'admin', municipalityId: 'm1' }]);
  assert.deepEqual(plan.deletePrivate, [{ path: PRIV, registrationPath: 'events/e2/registrations/r9' }]);
});

test('a group seat and a member with no known municipality are skipped, not guessed', () => {
  const plan = planRepair(fixture());
  assert.deepEqual(plan.skipped.map((s) => s.path), [GROUP_REG, LOST_MEMBER]);
});

test('no findings, no plan — a re-run after the repair does nothing', () => {
  const plan = planRepair({ violations: [], docs: new Map(), orgMunicipality: new Map() });
  assert.deepEqual(plan, { cancel: [], removeMember: [], deletePrivate: [], skipped: [] });
});

test('the cancellation entry is a solo self-cancellation that no person performed', () => {
  const entry = cancellationEntry('r1', fixture().docs.get(REG));
  assert.equal(entry.action, 'cancelled_self');
  assert.equal(entry.actorUserId, '');
  assert.equal(entry.subjectUserId, 'holder');
  assert.equal(entry.personId, 'p-gone');
  assert.equal(entry.status, 'confirmed');
  assert.equal(entry.groupId, null);
  assert.ok(entry.at instanceof Date);
});

test('the membership entry is the removal deleteAccount writes', () => {
  const entry = removalEntry({ orgId: 'o1', userId: 'u1', role: 'admin', municipalityId: 'm1' });
  assert.deepEqual({ ...entry, at: undefined }, {
    scopeType: 'org', scopeId: 'o1', municipalityId: 'm1', actorUserId: '', targetUserId: 'u1',
    action: 'removed', fromRole: 'admin', toRole: null, at: undefined,
  });
});

test('snapshot JSON keeps Timestamps and GeoPoints restorable', () => {
  const at = admin.firestore.Timestamp.fromDate(new Date('2026-12-05T13:00:00Z'));
  const out = toSnapshotJson({ at, where: new admin.firestore.GeoPoint(40, -3), list: [at], n: 1 });
  assert.deepEqual(out, {
    at: { __timestamp: '2026-12-05T13:00:00.000Z' },
    where: { __geopoint: [40, -3] },
    list: [{ __timestamp: '2026-12-05T13:00:00.000Z' }],
    n: 1,
  });
});

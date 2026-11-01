import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memberSocioRow, rosterPlan } from '../backfill-socio-roster.mjs';
import { sociosListVisiblePatch } from '../backfill-org-socios-list-visible.mjs';
import { socioNumberPatch } from '../backfill-socio-number.mjs';

test('every member without an active row gets an alta', () => {
  const plan = rosterPlan(['a', 'b'], [{ id: 'r1', kind: 'member', uid: 'a', responsibleUid: null }]);
  assert.deepEqual(plan, { alta: ['b'], baja: [] });
});

test('a re-run changes nothing once every member has a row', () => {
  const rows = [
    { id: 'r1', kind: 'member', uid: 'a', responsibleUid: null },
    { id: 'p1', kind: 'persona', uid: null, responsibleUid: 'a' },
    { id: 't1', kind: 'typed', uid: null, responsibleUid: null },
  ];
  assert.deepEqual(rosterPlan(['a'], rows), { alta: [], baja: [] });
});

test('a member who left, and the personas they answered for, get the baja; typed socios do not', () => {
  const rows = [
    { id: 'r1', kind: 'member', uid: 'gone', responsibleUid: null },
    { id: 'p1', kind: 'persona', uid: null, responsibleUid: 'gone' },
    { id: 't1', kind: 'typed', uid: null, responsibleUid: null },
  ];
  assert.deepEqual(rosterPlan([], rows), { alta: [], baja: ['r1', 'p1'] });
});

test('the member row takes the name and profile from the user doc, alta on joinedAt', () => {
  const joinedAt = new Date('2025-05-01');
  assert.deepEqual(memberSocioRow('a', { displayName: ' Ana ', personId: 'p' }, joinedAt), {
    kind: 'member', socioNumber: null, displayName: 'Ana', uid: 'a', personId: 'p', responsibleUid: null,
    adminTitle: null, altaAt: joinedAt, bajaAt: null, memberJoinedAt: joinedAt, createdBy: 'a',
  });
});

test('sociosListVisible defaults off and never overrides a choice', () => {
  assert.deepEqual(sociosListVisiblePatch({}), { sociosListVisible: false });
  assert.equal(sociosListVisiblePatch({ sociosListVisible: true }), null);
});

test('socioNumber is set to null where missing and never overrides a number', () => {
  assert.deepEqual(socioNumberPatch({ kind: 'typed' }), { socioNumber: null });
  assert.equal(socioNumberPatch({ socioNumber: null }), null);
  assert.equal(socioNumberPatch({ socioNumber: 57 }), null);
});

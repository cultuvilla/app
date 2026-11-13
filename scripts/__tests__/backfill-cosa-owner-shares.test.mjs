import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cosaOwnerSharesPatch, cosaRequestOwnerSharesPatch } from '../backfill-cosa-owner-shares.mjs';

const DEL = Symbol('delete');
const done = { kind: 'prestamo', location: null, locationNote: null, heldBy: null, createdByName: 'Ana', ownerUid: 'ana', ownerName: 'Ana' };

test('an integrante colectivizado cosa passes to its group, keeping who offered it', () => {
  const data = { ...done, createdByName: undefined, mode: 'colectivizado' };
  delete data.createdByName;
  assert.deepEqual(cosaOwnerSharesPatch(data, { groupName: 'Peña' }, DEL), {
    createdByName: 'Ana',
    ownerUid: null,
    ownerName: 'Peña',
    mode: DEL,
  });
});

test("a cosa that stays as it was only loses its mode; the group's own gets its offerer's name", () => {
  assert.deepEqual(cosaOwnerSharesPatch({ ...done, mode: 'prestamo' }, {}, DEL), { mode: DEL });
  const groups = { ...done, ownerUid: null, ownerName: 'Peña', mode: 'prestamo' };
  delete groups.createdByName;
  assert.deepEqual(cosaOwnerSharesPatch(groups, { offererName: 'Luis' }, DEL), { createdByName: 'Luis', mode: DEL });
  assert.deepEqual(cosaOwnerSharesPatch(groups, {}, DEL), { createdByName: '', mode: DEL });
});

test('fills what the location step added, and is idempotent', () => {
  const at = new Date('2026-10-03T10:00:00Z');
  assert.deepEqual(cosaOwnerSharesPatch({ kind: 'regalo', ownerUid: 'ana', ownerName: 'Ana', heldBy: { requestId: 'r', uid: 'u' } }, { heldSince: at }, DEL), {
    location: null,
    locationNote: null,
    'heldBy.since': at,
    createdByName: 'Ana',
  });
  assert.equal(cosaOwnerSharesPatch(done, {}, DEL), null);
});

test("a request follows its cosa's owner and loses its mode", () => {
  const req = { cosaMode: 'colectivizado', ownerUid: 'ana', holderUid: 'luis', status: 'pending', requesterUid: 'pepa' };
  assert.deepEqual(cosaRequestOwnerSharesPatch(req, { kind: 'prestamo', ownerUid: null, heldBy: null }, DEL), { cosaMode: DEL, ownerUid: null });
  assert.deepEqual(cosaRequestOwnerSharesPatch({ cosaKind: 'regalo', ownerUid: 'ana', status: 'pending', requesterUid: 'p' }, null, DEL), { holderUid: null });
});

test("a waiting request of a shared cosa out with someone goes to its holder; the holder's own does not", () => {
  const cosa = { kind: 'prestamo', ownerUid: null, heldBy: { uid: 'luis' } };
  const waiting = { ownerUid: null, holderUid: null, status: 'pending', requesterUid: 'pepa' };
  assert.deepEqual(cosaRequestOwnerSharesPatch(waiting, cosa, DEL), { holderUid: 'luis' });
  assert.equal(cosaRequestOwnerSharesPatch({ ...waiting, requesterUid: 'luis' }, cosa, DEL), null);
  assert.equal(cosaRequestOwnerSharesPatch({ ...waiting, status: 'lent' }, cosa, DEL), null);
  assert.equal(cosaRequestOwnerSharesPatch({ ...waiting, holderUid: 'luis' }, cosa, DEL), null);
  // A personal prestamo out on loan still waits for its return.
  assert.equal(cosaRequestOwnerSharesPatch({ ...waiting, ownerUid: 'ana' }, { ...cosa, ownerUid: 'ana' }, DEL), null);
});

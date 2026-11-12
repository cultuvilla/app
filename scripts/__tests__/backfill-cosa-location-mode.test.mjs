import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cosaLocationModePatch, cosaRequestModePatch } from '../backfill-cosa-location-mode.mjs';

test('a cosa gets no location yet, and a mode only when it is a prestamo', () => {
  assert.deepEqual(cosaLocationModePatch({ kind: 'prestamo', heldBy: null }), { location: null, locationNote: null, mode: 'prestamo' });
  assert.deepEqual(cosaLocationModePatch({ kind: 'reserva', heldBy: null }), { location: null, locationNote: null, mode: null });
  assert.equal(cosaLocationModePatch({ kind: 'prestamo', heldBy: null, location: null, locationNote: 'x', mode: 'colectivizado' }), null);
});

test("a held cosa gets when it was handed over: the holder's request's time, else now", () => {
  const done = { kind: 'prestamo', location: null, locationNote: null, mode: 'prestamo' };
  const at = new Date('2026-10-03T10:00:00Z');
  assert.deepEqual(cosaLocationModePatch({ ...done, heldBy: { requestId: 'r', uid: 'u' } }, at), { 'heldBy.since': at });
  assert.ok(cosaLocationModePatch({ ...done, heldBy: { requestId: 'r', uid: 'u' } })['heldBy.since'] instanceof Date);
  assert.equal(cosaLocationModePatch({ ...done, heldBy: { requestId: 'r', uid: 'u', since: at } }), null);
});

test('a request copies its mode from the kind and names no holder', () => {
  assert.deepEqual(cosaRequestModePatch({ cosaKind: 'prestamo' }), { cosaMode: 'prestamo', holderUid: null });
  assert.deepEqual(cosaRequestModePatch({ cosaKind: 'regalo' }), { cosaMode: null, holderUid: null });
  assert.equal(cosaRequestModePatch({ cosaKind: 'prestamo', cosaMode: 'prestamo', holderUid: null }), null);
});

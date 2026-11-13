import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cosaReservaPatch, cosaRequestSlotPatch } from '../backfill-cosateca-reservas.mjs';

test('a cosa without reserva gets null; one with it is left alone', () => {
  assert.deepEqual(cosaReservaPatch({ kind: 'prestamo' }), { reserva: null });
  assert.equal(cosaReservaPatch({ kind: 'prestamo', reserva: null }), null);
  assert.equal(cosaReservaPatch({ kind: 'reserva', reserva: { slotMinutes: 60 } }), null);
});

test('a request gets whichever of startAt/endAt it lacks', () => {
  assert.deepEqual(cosaRequestSlotPatch({}), { startAt: null, endAt: null });
  assert.deepEqual(cosaRequestSlotPatch({ startAt: null }), { endAt: null });
  assert.equal(cosaRequestSlotPatch({ startAt: null, endAt: null }), null);
});

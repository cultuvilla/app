import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transparencyPatch } from '../backfill-org-transparency.mjs';

const OFF = { transparency: { cuota: false, avisos: false, cuentas: false } };

test('transparency defaults all off and never overrides a choice', () => {
  assert.deepEqual(transparencyPatch({}), OFF);
  assert.deepEqual(transparencyPatch({ transparency: null }), OFF);
  assert.deepEqual(transparencyPatch({ transparency: { cuota: true } }), OFF);
  assert.deepEqual(transparencyPatch({ transparency: { cuota: true, avisos: false, cuentas: false, extra: true } }), OFF);
  assert.equal(transparencyPatch({ transparency: { cuota: true, avisos: false, cuentas: true } }), null);
  assert.equal(transparencyPatch({ transparency: { cuota: false, avisos: false, cuentas: false } }), null);
});

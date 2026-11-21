import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordsEnabledPatch } from '../backfill-org-records-enabled.mjs';

test('actasEnabled and cuentasEnabled default on and never override a choice', () => {
  assert.deepEqual(recordsEnabledPatch({}), { actasEnabled: true, cuentasEnabled: true });
  assert.deepEqual(recordsEnabledPatch({ actasEnabled: false }), { cuentasEnabled: true });
  assert.deepEqual(recordsEnabledPatch({ cuentasEnabled: false }), { actasEnabled: true });
  assert.equal(recordsEnabledPatch({ actasEnabled: false, cuentasEnabled: true }), null);
});

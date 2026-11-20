import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuotaEnabledPatch } from '../backfill-org-cuota-enabled.mjs';

test('cuotaEnabled defaults on and never overrides a choice', () => {
  assert.deepEqual(cuotaEnabledPatch({}), { cuotaEnabled: true });
  assert.equal(cuotaEnabledPatch({ cuotaEnabled: false }), null);
  assert.equal(cuotaEnabledPatch({ cuotaEnabled: true }), null);
});

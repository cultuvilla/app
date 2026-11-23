import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sociosSendAvisosPatch } from '../backfill-org-socios-send-avisos.mjs';

test('sociosSendAvisos defaults off and never overrides a choice', () => {
  assert.deepEqual(sociosSendAvisosPatch({}), { sociosSendAvisos: false });
  assert.deepEqual(sociosSendAvisosPatch({ sociosSendAvisos: 'sí' }), { sociosSendAvisos: false });
  assert.equal(sociosSendAvisosPatch({ sociosSendAvisos: true }), null);
  assert.equal(sociosSendAvisosPatch({ sociosSendAvisos: false }), null);
});

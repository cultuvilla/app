import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cosatecaPatch } from '../backfill-org-cosateca.mjs';

const OFF = { cosateca: { enabled: false, audience: 'integrantes' } };

test('cosateca defaults off for integrantes and never overrides a choice', () => {
  assert.deepEqual(cosatecaPatch({}), OFF);
  assert.deepEqual(cosatecaPatch({ cosateca: null }), OFF);
  assert.deepEqual(cosatecaPatch({ cosateca: { enabled: true } }), OFF);
  assert.equal(cosatecaPatch({ cosateca: { enabled: true, audience: 'pueblo' } }), null);
  assert.equal(cosatecaPatch({ cosateca: { enabled: false, audience: 'integrantes' } }), null);
});

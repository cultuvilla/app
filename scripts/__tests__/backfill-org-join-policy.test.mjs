import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinPolicyPatch } from '../backfill-org-join-policy.mjs';

const withPrivate = new Set(['peña-privada']);

test('an org holding a private event requires approval, so its members keep seeing it', () => {
  assert.deepEqual(joinPolicyPatch({}, 'peña-privada', withPrivate), { joinPolicy: 'approval' });
});

test('every other org stays open, as all orgs behaved before', () => {
  assert.deepEqual(joinPolicyPatch({}, 'peña-abierta', withPrivate), { joinPolicy: 'open' });
});

test("an org that already has a policy is never touched, so an admin's choice survives", () => {
  assert.equal(joinPolicyPatch({ joinPolicy: 'open' }, 'peña-privada', withPrivate), null);
  assert.equal(joinPolicyPatch({ joinPolicy: 'approval' }, 'peña-abierta', withPrivate), null);
});

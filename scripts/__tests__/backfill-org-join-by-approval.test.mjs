import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinByApprovalPatch } from '../backfill-org-join-by-approval.mjs';

test('an open org, or one with no policy, comes to require approval', () => {
  assert.deepEqual(joinByApprovalPatch({ joinPolicy: 'open' }), { joinPolicy: 'approval' });
  assert.deepEqual(joinByApprovalPatch({}), { joinPolicy: 'approval' });
});

test('an org that already requires approval is not touched', () => {
  assert.equal(joinByApprovalPatch({ joinPolicy: 'approval' }), null);
});

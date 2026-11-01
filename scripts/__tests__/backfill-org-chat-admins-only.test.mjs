import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatAdminsOnlyPatch } from '../backfill-org-chat-admins-only.mjs';

test('chatAdminsOnly defaults off and never overrides a choice', () => {
  assert.deepEqual(chatAdminsOnlyPatch({}), { chatAdminsOnly: false });
  assert.equal(chatAdminsOnlyPatch({ chatAdminsOnly: true }), null);
  assert.equal(chatAdminsOnlyPatch({ chatAdminsOnly: false }), null);
});

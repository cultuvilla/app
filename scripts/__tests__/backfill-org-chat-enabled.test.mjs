import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatEnabledPatch } from '../backfill-org-chat-enabled.mjs';

test('chatEnabled defaults on and never overrides a choice', () => {
  assert.deepEqual(chatEnabledPatch({}), { chatEnabled: true });
  assert.equal(chatEnabledPatch({ chatEnabled: false }), null);
  assert.equal(chatEnabledPatch({ chatEnabled: true }), null);
});

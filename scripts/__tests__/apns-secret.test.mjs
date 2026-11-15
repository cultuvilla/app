// The APNS_AUTH_KEY secret shape that scripts/set-apns-key.mjs writes must be
// exactly what functions/src/push/apnsJwt.ts (parseApnsSecret) accepts: a value
// it rejects stops every iOS push, with only a warning in the logs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { buildApnsSecret, describeApnsSecret, withTeamId } from '../lib/apns-secret.mjs';

const pem = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' });

test('builds the { teamId, keyId, privateKey } JSON the functions read', () => {
  const parsed = JSON.parse(buildApnsSecret({ teamId: '8HWS4483VD', keyId: 'KEY1234567', privateKey: pem }));
  assert.deepEqual(Object.keys(parsed), ['teamId', 'keyId', 'privateKey']);
  assert.equal(parsed.teamId, '8HWS4483VD');
  assert.match(parsed.privateKey, /BEGIN PRIVATE KEY/);
});

test('refuses a value the functions would reject', () => {
  assert.throws(() => buildApnsSecret({ teamId: 'team', keyId: 'K', privateKey: pem }), /Team ID/);
  assert.throws(() => buildApnsSecret({ teamId: '8HWS4483VD', keyId: '', privateKey: pem }), /keyId/);
  assert.throws(() => buildApnsSecret({ teamId: '8HWS4483VD', keyId: 'K', privateKey: 'hunter2' }), /PEM/);
});

test('stamps the current key with a team and keeps the key', () => {
  const current = JSON.stringify({ keyId: 'D9ANCTTW73', privateKey: pem });
  const parsed = JSON.parse(withTeamId(current, '78RB67NT38'));
  assert.equal(parsed.teamId, '78RB67NT38');
  assert.equal(parsed.keyId, 'D9ANCTTW73');
  assert.equal(parsed.privateKey.trim(), pem.trim());
});

test('describes a secret without its key', () => {
  const raw = buildApnsSecret({ teamId: '8HWS4483VD', keyId: 'K', privateKey: pem });
  assert.deepEqual(describeApnsSecret(raw), { teamId: '8HWS4483VD', keyId: 'K' });
});

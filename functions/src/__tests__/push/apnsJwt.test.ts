import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, verify } from 'node:crypto';
import { buildApnsJwt, parseApnsSecret } from '../../push/apnsJwt';

// APNs token auth: an ES256 JWT signed with the team's .p8 key. The detail that
// makes or breaks it is the signature encoding — JOSE wants the raw 64-byte
// r‖s (IEEE P1363), node's default is DER, and APNs answers a DER signature
// with `InvalidProviderToken` for every iOS device at once.
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });

const creds = { teamId: '78RB67NT38', keyId: 'KEY1234567', privateKey: pem };

function decode(part: string): unknown {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

describe('buildApnsJwt', () => {
  const now = new Date('2026-09-10T10:00:00Z');
  const jwt = buildApnsJwt(creds, now);
  const [header, claims, signature] = jwt.split('.');

  it('is a three-part compact JWT', () => {
    expect(jwt.split('.')).toHaveLength(3);
  });

  it('names ES256 and the key id in the header', () => {
    expect(decode(header)).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
  });

  it('carries the team id as issuer and a seconds-precision iat', () => {
    expect(decode(claims)).toEqual({ iss: '78RB67NT38', iat: now.getTime() / 1000 });
  });

  it('signs with a raw 64-byte r‖s signature, not DER', () => {
    const sig = Buffer.from(signature, 'base64url');
    expect(sig).toHaveLength(64);
    const ok = verify('sha256', Buffer.from(`${header}.${claims}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, sig);
    expect(ok).toBe(true);
  });
});

describe('parseApnsSecret', () => {
  it('accepts the documented JSON shape, team id included', () => {
    expect(parseApnsSecret(JSON.stringify({ teamId: '8HWS4483VD', keyId: 'K', privateKey: pem }))).toEqual({
      teamId: '8HWS4483VD',
      keyId: 'K',
      privateKey: pem,
    });
  });

  it.each([
    ['empty', ''],
    ['not JSON', '-----BEGIN PRIVATE KEY-----'],
    ['missing teamId', JSON.stringify({ keyId: 'K', privateKey: pem })],
    ['malformed teamId', JSON.stringify({ teamId: 'team', keyId: 'K', privateKey: pem })],
    ['missing keyId', JSON.stringify({ teamId: '8HWS4483VD', privateKey: pem })],
    ['empty keyId', JSON.stringify({ teamId: '8HWS4483VD', keyId: '', privateKey: pem })],
    ['not a key', JSON.stringify({ teamId: '8HWS4483VD', keyId: 'K', privateKey: 'hunter2' })],
  ])('rejects %s instead of throwing', (_label, raw) => {
    expect(parseApnsSecret(raw)).toBeNull();
  });
});

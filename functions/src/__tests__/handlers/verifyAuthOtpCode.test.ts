// Handler test for the verifyAuthOtpCode callable. Firestore + Auth run
// against the real emulators.

import { createHash } from 'crypto';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import functionsTestFactory from 'firebase-functions-test';
import { wrapCallable } from '../helpers/functionsTest';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { bucketIdFor } from '../../auth/rateLimit';
import { verifyAuthOtpCode } from '../../auth/verifyAuthOtpCode';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

interface CallableResult {
  token: string;
}

async function callVerify(data: unknown): Promise<CallableResult> {
  const wrapped = wrapCallable(ft, verifyAuthOtpCode);
  return await wrapped({
    data,
    auth: undefined,
  });
}

async function seedCode(
  email: string,
  code: string,
  overrides: Partial<{ expiresAt: Timestamp; attempts: number }> = {},
): Promise<void> {
  const bucketId = bucketIdFor(email);
  await getFirestore()
    .collection('authOtpCodes')
    .doc(bucketId)
    .set({
      codeHash: createHash('sha256').update(code).digest('hex'),
      expiresAt: overrides.expiresAt ?? Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
      attempts: overrides.attempts ?? 0,
      createdAt: Timestamp.now(),
    });
}

describe('verifyAuthOtpCode (callable)', () => {
  beforeAll(async () => {
    await resetEmulators();
  });
  beforeEach(async () => {
    await resetEmulators();
  });
  afterAll(() => {
    ft.cleanup();
  });

  it('throws invalid-argument for a malformed email', async () => {
    await expect(callVerify({ email: 'not-an-email', code: '123456' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('throws invalid-argument for a non-6-digit code', async () => {
    await expect(callVerify({ email: 'alice@example.com', code: '123' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('throws invalid-argument when no code was ever sent', async () => {
    await expect(
      callVerify({ email: 'nobody@example.com', code: '123456' }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects an expired code', async () => {
    await seedCode('dave@example.com', '111111', {
      expiresAt: Timestamp.fromMillis(Date.now() - 1000),
    });
    await expect(
      callVerify({ email: 'dave@example.com', code: '111111' }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  // The expiry is read back as a Date through the typed ref; the right code is
  // refused after it and accepted before it, and an expired try costs no attempt.
  it('refuses the right code once expired without spending an attempt', async () => {
    await seedCode('gina@example.com', '444444', {
      expiresAt: Timestamp.fromMillis(Date.now() - 1000),
    });
    await expect(
      callVerify({ email: 'gina@example.com', code: '444444' }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    const doc = await getFirestore().collection('authOtpCodes').doc(bucketIdFor('gina@example.com')).get();
    expect((doc.data() as { attempts: number }).attempts).toBe(0);
  });

  it('accepts the right code a minute before it expires', async () => {
    await seedCode('hugo@example.com', '555555', {
      expiresAt: Timestamp.fromMillis(Date.now() + 60 * 1000),
    });
    const result = await callVerify({ email: 'hugo@example.com', code: '555555' });
    expect(typeof result.token).toBe('string');
  });

  it('increments attempts on a wrong code and locks out after 5', async () => {
    await seedCode('erin@example.com', '222222');
    for (let i = 0; i < 5; i += 1) {
      await expect(
        callVerify({ email: 'erin@example.com', code: '000000' }),
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    }
    const bucketId = bucketIdFor('erin@example.com');
    const doc = await getFirestore().collection('authOtpCodes').doc(bucketId).get();
    expect((doc.data() as { attempts: number }).attempts).toBe(5);

    // Even the correct code is now rejected — locked out.
    await expect(
      callVerify({ email: 'erin@example.com', code: '222222' }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('mints a custom token and creates a new user for a first-time email', async () => {
    await seedCode('frank@example.com', '333333');
    const result = await callVerify({ email: 'frank@example.com', code: '333333' });
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(0);

    const user = await getAuth().getUserByEmail('frank@example.com');
    expect(user.email).toBe('frank@example.com');

    // Single-use: the code doc is gone.
    const bucketId = bucketIdFor('frank@example.com');
    const doc = await getFirestore().collection('authOtpCodes').doc(bucketId).get();
    expect(doc.exists).toBe(false);
  });

  it('reuses the existing uid for a returning email', async () => {
    const existing = await getAuth().createUser({ email: 'grace@example.com' });
    await seedCode('grace@example.com', '444444');
    await callVerify({ email: 'grace@example.com', code: '444444' });

    const user = await getAuth().getUserByEmail('grace@example.com');
    expect(user.uid).toBe(existing.uid);
  });
});

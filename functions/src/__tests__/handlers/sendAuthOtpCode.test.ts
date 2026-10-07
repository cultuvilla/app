// Handler test for the sendAuthOtpCode callable. Firestore runs against the
// real emulator (rate-limit doc + authOtpCodes doc); only the Resend secret
// and the `resend` package itself are mocked so no network send happens.

import { createHash } from 'crypto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import functionsTestFactory from 'firebase-functions-test';
import { getFirestore } from 'firebase-admin/firestore';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { bucketIdFor, IP_RATE_LIMIT_MAX_SENDS } from '../../auth/rateLimit';

vi.mock('../../auth/secret', () => ({ RESEND_API_KEY: { value: () => 'TEST_RESEND_KEY' } }));

interface SendCallArgs {
  to: string;
  html: string;
  text: string;
}

const sendMock = vi.fn((_args: SendCallArgs) =>
  Promise.resolve({ data: { id: 'test-email-id' }, error: null }),
);

vi.mock('resend', () => ({
  Resend: vi.fn(function ResendMock(this: { emails: { send: typeof sendMock } }) {
    this.emails = { send: sendMock };
  }),
}));

import { sendAuthOtpCode } from '../../auth/sendAuthOtpCode';
import { runVerifyAuthOtpCode } from '../../auth/verifyAuthOtpCode';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

interface CallableResult {
  ok: true;
}

async function callSend(data: unknown, ip = '198.51.100.1'): Promise<CallableResult> {
  const wrapped = ft.wrap(sendAuthOtpCode as unknown as Parameters<typeof ft.wrap>[0]);
  return (await wrapped({
    data,
    auth: undefined,
    rawRequest: { headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` }, ip: '10.0.0.1' },
  } as unknown as Parameters<typeof wrapped>[0])) as unknown as CallableResult;
}

describe('sendAuthOtpCode (callable)', () => {
  beforeAll(async () => {
    await resetEmulators();
  });
  beforeEach(async () => {
    await resetEmulators();
    sendMock.mockClear();
  });
  afterAll(() => {
    ft.cleanup();
  });

  it('sends a 6-digit code and stores its hash', async () => {
    const result = await callSend({ email: 'alice@example.com' });
    expect(result.ok).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toBe('alice@example.com');
    const codeMatch = call.text.match(/Tu código de acceso: (\d{6})/);
    expect(codeMatch).not.toBeNull();

    const bucketId = bucketIdFor('alice@example.com');
    const doc = await getFirestore().collection('authOtpCodes').doc(bucketId).get();
    expect(doc.exists).toBe(true);
    const data = doc.data() as { codeHash: string; attempts: number };
    expect(data.attempts).toBe(0);
    expect(data.codeHash).not.toBe(codeMatch?.[1]);
  });

  // One caller cycling through many addresses must hit a ceiling too; the
  // per-email bucket alone never fills when every address is new.
  it('caps sends per caller IP across different emails, with the same {ok:true}', async () => {
    for (let i = 0; i < IP_RATE_LIMIT_MAX_SENDS; i++) {
      await callSend({ email: `user${String(i)}@example.com` }, '203.0.113.7');
    }
    expect(sendMock).toHaveBeenCalledTimes(IP_RATE_LIMIT_MAX_SENDS);

    const result = await callSend({ email: 'one-more@example.com' }, '203.0.113.7');
    expect(result.ok).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(IP_RATE_LIMIT_MAX_SENDS);

    await callSend({ email: 'neighbour@example.com' }, '203.0.113.8');
    expect(sendMock).toHaveBeenCalledTimes(IP_RATE_LIMIT_MAX_SENDS + 1);
  });

  it('throws invalid-argument for a malformed email', async () => {
    await expect(callSend({ email: 'not-an-email' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rate-limits after 5 sends in the window, returning the same {ok:true} shape', async () => {
    const data = { email: 'bob@example.com' };
    for (let i = 0; i < 5; i += 1) {
      const result = await callSend(data);
      expect(result.ok).toBe(true);
    }
    expect(sendMock).toHaveBeenCalledTimes(5);

    const sixth = await callSend(data);
    expect(sixth.ok).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(5);
  });

  // Under the Functions emulator there is no Resend key and no mailbox, so the
  // code is written back onto the doc instead of emailed — this is what makes the
  // flow completable locally at all (by hand, or by a future E2E driver).
  describe('under the Functions emulator', () => {
    beforeEach(() => {
      vi.stubEnv('FUNCTIONS_EMULATOR', 'true');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('skips the send and exposes the plaintext code on the doc', async () => {
      const result = await callSend({ email: 'dave@example.com' });
      expect(result.ok).toBe(true);
      expect(sendMock).not.toHaveBeenCalled();

      const bucketId = bucketIdFor('dave@example.com');
      const doc = await getFirestore().collection('authOtpCodes').doc(bucketId).get();
      const data = doc.data() as { codeHash: string; emulatorCode: string };
      expect(data.emulatorCode).toMatch(/^\d{6}$/);
      expect(data.codeHash).toBe(createHash('sha256').update(data.emulatorCode).digest('hex'));
    });

    it('issues a code that actually verifies, completing the flow end to end', async () => {
      await callSend({ email: 'erin@example.com' });
      const bucketId = bucketIdFor('erin@example.com');
      const doc = await getFirestore().collection('authOtpCodes').doc(bucketId).get();
      const { emulatorCode } = doc.data() as { emulatorCode: string };

      const { token } = await runVerifyAuthOtpCode({ email: 'erin@example.com', code: emulatorCode });
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });
  });

  it('never writes the plaintext code when not running under the emulator', async () => {
    await callSend({ email: 'frank@example.com' });
    const bucketId = bucketIdFor('frank@example.com');
    const doc = await getFirestore().collection('authOtpCodes').doc(bucketId).get();
    expect(doc.data()).not.toHaveProperty('emulatorCode');
  });

  it('overwrites a prior pending code for the same email', async () => {
    await callSend({ email: 'carol@example.com' });
    const firstCode = sendMock.mock.calls[0][0].text.match(/Tu código de acceso: (\d{6})/)?.[1];
    await callSend({ email: 'carol@example.com' });
    const secondCode = sendMock.mock.calls[1][0].text.match(/Tu código de acceso: (\d{6})/)?.[1];

    const bucketId = bucketIdFor('carol@example.com');
    const doc = await getFirestore().collection('authOtpCodes').doc(bucketId).get();
    const data = doc.data() as { codeHash: string };
    expect(data.codeHash).toBe(createHash('sha256').update(secondCode ?? '').digest('hex'));
    expect(data.codeHash).not.toBe(createHash('sha256').update(firstCode ?? '').digest('hex'));
  });

  // Store reviewers cannot read the mailbox the code is sent to, so exactly one
  // allowlisted address gets a fixed code. The point of the design is that only
  // WHICH digits get hashed changes — the doc, the expiry and the attempt cap
  // are the same ones a random code goes through, which is what keeps a code
  // that never rotates out of brute-force range.
  describe('store-review account (fixed code)', () => {
    const REVIEW_EMAIL = 'review@example.com';
    const REVIEW_CODE = '424242';
    const reviewHash = createHash('sha256').update(REVIEW_CODE).digest('hex');

    async function allowReview(data: Record<string, unknown> = {
      email: REVIEW_EMAIL,
      code: REVIEW_CODE,
    }) {
      await getFirestore().doc('_admin/reviewAccess').set(data);
    }

    async function storedHash(email: string): Promise<string | undefined> {
      const doc = await getFirestore().collection('authOtpCodes').doc(bucketIdFor(email)).get();
      return (doc.data() as { codeHash?: string } | undefined)?.codeHash;
    }

    it('issues the fixed code without emailing anything, and it verifies', async () => {
      await allowReview();

      const result = await callSend({ email: REVIEW_EMAIL });
      expect(result.ok).toBe(true);
      expect(sendMock).not.toHaveBeenCalled();
      expect(await storedHash(REVIEW_EMAIL)).toBe(reviewHash);

      const { token } = await runVerifyAuthOtpCode({ email: REVIEW_EMAIL, code: REVIEW_CODE });
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('keeps the ordinary expiry and attempt cap on the review doc', async () => {
      await allowReview();
      await callSend({ email: REVIEW_EMAIL });

      const doc = await getFirestore().collection('authOtpCodes').doc(bucketIdFor(REVIEW_EMAIL)).get();
      const data = doc.data() as { attempts: number; expiresAt: { toMillis(): number } };
      expect(data.attempts).toBe(0);
      expect(data.expiresAt.toMillis()).toBeGreaterThan(Date.now());
    });

    it('never leaks the fixed code onto the doc outside the emulator', async () => {
      await allowReview();
      await callSend({ email: REVIEW_EMAIL });
      const doc = await getFirestore().collection('authOtpCodes').doc(bucketIdFor(REVIEW_EMAIL)).get();
      expect(doc.data()).not.toHaveProperty('emulatorCode');
    });

    // A prefix, suffix or domain match here would be an open sign-in for every
    // address containing the allowlisted one.
    it.each([
      'xreview@example.com',
      'review@example.com.attacker.test',
      'review@attacker.test',
      'eview@example.com',
    ])('does not hand the fixed code to the near-miss %s', async (email) => {
      await allowReview();

      const result = await callSend({ email });
      expect(result.ok).toBe(true);
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(await storedHash(email)).not.toBe(reviewHash);
    });

    it('normalises case and surrounding whitespace on the allowlisted address', async () => {
      await allowReview({ email: '  Review@Example.COM  ', code: REVIEW_CODE });

      await callSend({ email: REVIEW_EMAIL });
      expect(sendMock).not.toHaveBeenCalled();
      expect(await storedHash(REVIEW_EMAIL)).toBe(reviewHash);
    });

    it('falls back to a random emailed code when no allowlist doc exists', async () => {
      const result = await callSend({ email: REVIEW_EMAIL });
      expect(result.ok).toBe(true);
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(await storedHash(REVIEW_EMAIL)).not.toBe(reviewHash);
    });

    it.each([
      { case: 'a non-numeric code', doc: { email: 'review@example.com', code: 'letmein' } },
      { case: 'a short code', doc: { email: 'review@example.com', code: '4242' } },
      { case: 'a missing code', doc: { email: 'review@example.com' } },
      { case: 'a missing email', doc: { code: '424242' } },
    ])('falls back to a random emailed code for $case', async ({ doc }) => {
      await allowReview(doc);

      const result = await callSend({ email: REVIEW_EMAIL });
      expect(result.ok).toBe(true);
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(await storedHash(REVIEW_EMAIL)).not.toBe(reviewHash);
    });

    it('still rate-limits the review address like any other', async () => {
      await allowReview();
      for (let i = 0; i < 5; i += 1) {
        expect((await callSend({ email: REVIEW_EMAIL })).ok).toBe(true);
      }
      await getFirestore().collection('authOtpCodes').doc(bucketIdFor(REVIEW_EMAIL)).delete();

      expect((await callSend({ email: REVIEW_EMAIL })).ok).toBe(true);
      expect(await storedHash(REVIEW_EMAIL)).toBeUndefined();
    });
  });
});

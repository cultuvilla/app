// Handler test for the sendAuthSignInEmail callable. Firestore + Auth run
// against the real emulators (rate-limit doc + generateSignInWithEmailLink);
// only the Resend secret and the `resend` package itself are mocked so no
// network send happens.

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { ipBucketIdFor, IP_RATE_LIMIT_MAX_SENDS } from '../../auth/rateLimit';

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
  // Must be a real constructible function — an arrow function (as
  // `mockImplementation` would otherwise use) can't back `new Resend(...)`.
  Resend: vi.fn(function ResendMock(this: { emails: { send: typeof sendMock } }) {
    this.emails = { send: sendMock };
  }),
}));

import { sendAuthSignInEmail } from '../../auth/sendAuthSignInEmail';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

interface CallableResult {
  ok: true;
}

async function callSend(data: unknown, ip = '198.51.100.1'): Promise<CallableResult> {
  const wrapped = ft.wrap(sendAuthSignInEmail as unknown as Parameters<typeof ft.wrap>[0]);
  return (await wrapped({
    data,
    auth: undefined,
    rawRequest: { headers: { 'x-forwarded-for': ip }, ip: '10.0.0.1' },
  } as unknown as Parameters<typeof wrapped>[0])) as unknown as CallableResult;
}

describe('sendAuthSignInEmail (callable)', () => {
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

  it('sends a branded email with an action URL for a valid request', async () => {
    const result = await callSend({
      email: 'alice@example.com',
      continueUrl: 'https://villa-events.web.app/finish',
    });
    expect(result.ok).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toBe('alice@example.com');
    expect(call.html).toContain('Entrar en Cultuvilla');
    // The Auth emulator issues an http:// link (real Firebase issues https://);
    // assert on the oobCode marker rather than the scheme so this test doesn't
    // depend on emulator-vs-prod link shape.
    expect(call.html).toMatch(/oobCode=/);
    expect(call.text).toMatch(/oobCode=/);
  });

  it('throws invalid-argument for a malformed email', async () => {
    await expect(
      callSend({ email: 'not-an-email', continueUrl: 'https://villa-events.web.app/finish' }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('throws invalid-argument when continueUrl is missing', async () => {
    await expect(callSend({ email: 'alice@example.com' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rate-limits after 5 sends in the window, returning the same {ok:true} shape', async () => {
    const data = { email: 'bob@example.com', continueUrl: 'https://villa-events.web.app/finish' };
    for (let i = 0; i < 5; i += 1) {
      const result = await callSend(data);
      expect(result.ok).toBe(true);
    }
    expect(sendMock).toHaveBeenCalledTimes(5);

    const sixth = await callSend(data);
    expect(sixth.ok).toBe(true);
    // Still 5 — the 6th call was silently skipped, not sent.
    expect(sendMock).toHaveBeenCalledTimes(5);
  });

  it('skips the send once the caller IP is over its cap, whatever the address', async () => {
    await getFirestore()
      .collection('authEmailRateLimits')
      .doc(ipBucketIdFor('203.0.113.7'))
      .set({ count: IP_RATE_LIMIT_MAX_SENDS, windowStart: Timestamp.now() });

    const result = await callSend(
      { email: 'fresh@example.com', continueUrl: 'https://villa-events.web.app/finish' },
      '203.0.113.7',
    );
    expect(result.ok).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('does not affect the rate-limit bucket of a different email', async () => {
    const data = { email: 'carol@example.com', continueUrl: 'https://villa-events.web.app/finish' };
    for (let i = 0; i < 5; i += 1) {
      await callSend(data);
    }
    expect(sendMock).toHaveBeenCalledTimes(5);

    const other = await callSend({
      email: 'dave@example.com',
      continueUrl: 'https://villa-events.web.app/finish',
    });
    expect(other.ok).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(6);
  });

  describe('under the Functions emulator', () => {
    beforeEach(() => {
      vi.stubEnv('FUNCTIONS_EMULATOR', 'true');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('generates the link but never calls Resend', async () => {
      const result = await callSend({
        email: 'frank@example.com',
        continueUrl: 'https://villa-events.web.app/finish',
      });
      expect(result.ok).toBe(true);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('still validates the request', async () => {
      await expect(
        callSend({ email: 'not-an-email', continueUrl: 'https://villa-events.web.app/finish' }),
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    });
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { getUsers, projectId, info, send, batchSend } = vi.hoisted(() => ({
  getUsers: vi.fn(),
  projectId: { value: 'villa-events' as string | undefined },
  info: vi.fn(),
  send: vi.fn(() => Promise.resolve({ data: { id: 'x' }, error: null })),
  batchSend: vi.fn((_emails: { to: string }[]) => Promise.resolve({ data: {}, error: null })),
}));

vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ getUsers }) }));
vi.mock('firebase-admin/app', () => ({ getApps: () => [{ options: { projectId: projectId.value } }] }));
vi.mock('firebase-functions/v2', () => ({ logger: { info, warn: vi.fn(), error: vi.fn() } }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
    batch = { send: batchSend };
  },
}));
vi.mock('../../auth/secret', () => ({ RESEND_API_KEY: { value: () => 'key' } }));

import { allowedEmailAddresses, mayPushToUser } from '../../shared/deliveryAudience';
import { sendEmail, sendEmailBatch } from '../../shared/email';

const LOG = { handler: 'test', channel: 'email' as const };

/** Auth knows exactly these addresses / uids. */
function authKnows(known: { email?: string; uid?: string }[]): void {
  getUsers.mockImplementation((ids: { email?: string; uid?: string }[]) =>
    Promise.resolve({
      users: known.filter((k) => ids.some((id) => (id.email && id.email === k.email) || (id.uid && id.uid === k.uid))),
      notFound: [],
    }),
  );
}

const withheldLines = () => info.mock.calls.filter((c) => c[0] === 'Delivery withheld outside production');

const mail = (to: string) => ({ to, subject: 's', html: '<p>h</p>', text: 't' });

beforeEach(() => {
  projectId.value = 'villa-events';
  getUsers.mockReset();
  info.mockClear();
  send.mockClear();
  batchSend.mockClear();
  delete process.env['FUNCTIONS_EMULATOR'];
});

afterEach(() => {
  projectId.value = 'villa-events';
});

describe('deliveryAudience outside production', () => {
  it.each(['villa-events', 'cultuvilla-beta', 'cultuvilla-test', undefined])('%s mails only Auth accounts', async (id) => {
    projectId.value = id;
    authKnows([{ email: 'tester@example.com' }]);
    const allowed = await allowedEmailAddresses(['Tester@Example.com', 'real@example.com'], LOG);
    expect([...allowed]).toEqual(['Tester@Example.com']);
    expect(withheldLines()).toHaveLength(1);
    expect(withheldLines()[0]?.[1]).toMatchObject({ handler: 'test', channel: 'email', count: 1, reason: 'no-auth-account' });
    expect(JSON.stringify(withheldLines())).not.toContain('real@example.com');
  });

  it('withholds everything when Auth cannot be asked', async () => {
    getUsers.mockRejectedValue(new Error('boom'));
    expect((await allowedEmailAddresses(['a@example.com'], LOG)).size).toBe(0);
    expect(await mayPushToUser('u1', { handler: 'deliverPush', channel: 'push' })).toBe(false);
    expect(withheldLines().map((c) => c[1].reason)).toEqual(['auth-lookup-failed', 'auth-lookup-failed']);
  });

  it('pushes only to a uid with an Auth account', async () => {
    authKnows([{ uid: 'tester' }]);
    expect(await mayPushToUser('tester', { handler: 'deliverPush', channel: 'push' })).toBe(true);
    expect(await mayPushToUser('copied', { handler: 'deliverPush', channel: 'push' })).toBe(false);
    expect(withheldLines()).toHaveLength(1);
    expect(withheldLines()[0]?.[1]).toMatchObject({ handler: 'deliverPush', channel: 'push', userId: 'copied' });
  });

  it('looks addresses up in chunks Auth accepts', async () => {
    authKnows([]);
    const many = Array.from({ length: 250 }, (_, i) => `p${String(i)}@example.com`);
    await allowedEmailAddresses(many, LOG);
    expect(getUsers.mock.calls.map((c) => (c[0] as unknown[]).length)).toEqual([100, 100, 50]);
  });
});

describe('deliveryAudience in production', () => {
  it('reaches anyone and never asks Auth', async () => {
    projectId.value = 'cultuvilla-prod';
    expect([...(await allowedEmailAddresses(['real@example.com'], LOG))]).toEqual(['real@example.com']);
    expect(await mayPushToUser('anyone', { handler: 'deliverPush', channel: 'push' })).toBe(true);
    expect(getUsers).not.toHaveBeenCalled();
    expect(withheldLines()).toHaveLength(0);
  });
});

describe('email transport', () => {
  it('skips a single mail to an address without an account', async () => {
    authKnows([]);
    expect(await sendEmail(mail('real@example.com'), { handler: 'h', label: 'Mail' })).toBe('skipped');
    expect(send).not.toHaveBeenCalled();
  });

  it('sends a single mail to an Auth account', async () => {
    authKnows([{ email: 'tester@example.com' }]);
    expect(await sendEmail(mail('tester@example.com'), { handler: 'h', label: 'Mail' })).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('batches only the allowed mails and reports the rest skipped, in order', async () => {
    authKnows([{ email: 'b@example.com' }]);
    const outcomes = await sendEmailBatch([mail('a@example.com'), mail('b@example.com'), mail('c@example.com')], {
      handler: 'h',
      label: 'Group',
    });
    expect(outcomes).toEqual(['skipped', 'sent', 'skipped']);
    const sent = batchSend.mock.calls[0][0];
    expect(sent.map((e) => e.to)).toEqual(['b@example.com']);
  });

  it('production mails everyone without asking Auth', async () => {
    projectId.value = 'cultuvilla-prod';
    expect(await sendEmailBatch([mail('a@example.com')], { handler: 'h', label: 'Group' })).toEqual(['sent']);
    expect(getUsers).not.toHaveBeenCalled();
  });
});

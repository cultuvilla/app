import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { sendMock, loggerMock } = vi.hoisted(() => ({
  sendMock: vi.fn(() => Promise.resolve({ data: { id: 'email-1' }, error: null })),
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('firebase-functions/v2', () => ({ logger: loggerMock }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({}) }));
vi.mock('@cultuvilla/shared/firebase/refs/admin', () => ({
  userDoc: () => ({
    get: () => Promise.resolve({ data: () => ({ email: 'ana@example.test' }) }),
  }),
}));
vi.mock('../../auth/secret', () => ({ RESEND_API_KEY: { value: () => 'TEST_RESEND_KEY' } }));
vi.mock('resend', () => ({
  Resend: vi.fn(function ResendMock(this: { emails: { send: typeof sendMock } }) {
    this.emails = { send: sendMock };
  }),
}));

import { sendEventEmail } from '../../events/eventEmail';

const args = {
  handler: 'registerToEvent',
  userId: 'ana',
  eventId: 'e1',
  content: {
    kind: 'cancellation' as const,
    attendees: [{ name: 'Ana' }],
    eventTitle: 'Fiesta',
    eventUrl: 'https://example.test/e1',
    imageURL: null,
    dateLabel: 'sábado',
    locationName: 'Plaza',
    villageName: 'Matabuena',
  },
};

describe('sendEventEmail', () => {
  beforeEach(() => {
    sendMock.mockClear();
    loggerMock.info.mockClear();
    loggerMock.error.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends through Resend outside the emulator', async () => {
    vi.stubEnv('FUNCTIONS_EMULATOR', '');
    await sendEventEmail(args);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  // The emulator has no RESEND_API_KEY: sending there failed every time and
  // logged a "resend send failed" error into every E2E run.
  it('skips the send under the functions emulator, at info and not error', async () => {
    vi.stubEnv('FUNCTIONS_EMULATOR', 'true');
    await sendEventEmail(args);
    expect(sendMock).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
    expect(loggerMock.info).toHaveBeenCalledWith(
      'Event email skipped (functions emulator)',
      expect.objectContaining({ handler: 'registerToEvent', eventId: 'e1' }),
    );
  });
});

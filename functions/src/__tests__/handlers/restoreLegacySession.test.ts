// Handler test for the restoreLegacySession callable. The exchange and the token
// checks run against the real Auth emulator.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import functionsTestFactory from 'firebase-functions-test';
import { getAuth } from 'firebase-admin/auth';
import { resetEmulators } from '../helpers/firestoreEmulator';
import {
  restoreLegacySession,
  runRestoreLegacySession,
  signedInSince,
} from '../../auth/restoreLegacySession';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const API_KEY = 'fake-api-key';
const UID = 'legacy-user';

async function legacyRefreshToken(uid: string): Promise<string> {
  const customToken = await getAuth().createCustomToken(uid);
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '';
  const response = await fetch(
    `http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const body = (await response.json()) as { refreshToken: string };
  return body.refreshToken;
}

describe('restoreLegacySession (callable)', () => {
  beforeAll(async () => {
    await resetEmulators();
  });
  beforeEach(async () => {
    await resetEmulators();
    await getAuth()
      .deleteUser(UID)
      .catch(() => undefined);
    await getAuth().createUser({ uid: UID, email: 'legacy@example.com' });
  });
  afterAll(() => {
    ft.cleanup();
  });

  it('mints a custom token for a live legacy session', async () => {
    const refreshToken = await legacyRefreshToken(UID);

    const result = await runRestoreLegacySession({ refreshToken, apiKey: API_KEY });

    expect(result).toEqual({ status: 'restored', token: expect.any(String) });
  });

  it('refuses a refresh token Firebase does not recognise', async () => {
    const result = await runRestoreLegacySession({ refreshToken: 'not-a-token', apiKey: API_KEY });

    expect(result).toEqual({ status: 'refused' });
  });

  it('refuses a session whose account is gone', async () => {
    const refreshToken = await legacyRefreshToken(UID);
    await getAuth().deleteUser(UID);

    expect(await runRestoreLegacySession({ refreshToken, apiKey: API_KEY })).toEqual({
      status: 'refused',
    });
  });

  it('refuses a session whose account is disabled', async () => {
    const refreshToken = await legacyRefreshToken(UID);
    await getAuth().updateUser(UID, { disabled: true });

    expect(await runRestoreLegacySession({ refreshToken, apiKey: API_KEY })).toEqual({
      status: 'refused',
    });
  });

  it('rejects a malformed request', async () => {
    const wrapped = ft.wrap(restoreLegacySession as unknown as Parameters<typeof ft.wrap>[0]);

    await expect(
      wrapped({ data: { apiKey: API_KEY }, auth: undefined } as unknown as Parameters<
        typeof wrapped
      >[0]),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('signedInSince', () => {
  const authTime = Date.parse('2026-09-01T10:00:00Z') / 1000;

  it('is false for the sign-in that started this session', () => {
    expect(signedInSince(authTime, '2026-09-01T10:00:02Z')).toBe(false);
  });

  it('is true once the account has signed in again', () => {
    expect(signedInSince(authTime, '2026-10-20T08:00:00Z')).toBe(true);
  });

  it('is false when no sign-in is on record', () => {
    expect(signedInSince(authTime, undefined)).toBe(false);
  });
});

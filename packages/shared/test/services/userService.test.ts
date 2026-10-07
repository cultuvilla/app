/* eslint-disable @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/no-explicit-any,
                  @typescript-eslint/require-await */
// vi.mock factories legitimately fake the firebase/firestore SDK shape;
// the rule family doesn't add value for these inline mocks.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/firebase', () => ({ getDb: vi.fn() }));
vi.mock('firebase/firestore', async () => {
  const makeRef = (..._args: unknown[]) => {
    const ref: { _path: unknown[]; withConverter: ReturnType<typeof vi.fn> } = {
      _path: _args,
      withConverter: vi.fn(),
    };
    ref.withConverter.mockReturnValue(ref);
    return ref;
  };
  return {
    collection: vi.fn((..._args) => makeRef(..._args)),
    doc: vi.fn((..._args) => makeRef(..._args)),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    serverTimestamp: () => '__SERVER_TIMESTAMP__',
    Timestamp: { fromDate: (d: Date) => ({ toDate: () => d, _d: d }) },
    query: vi.fn(),
    orderBy: vi.fn(),
  };
});

import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import {
  createUserProfile,
  getPublicProfile,
  getUserProfile,
  patchUserProfile,
} from '../../src/services/userService';

describe('createUserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls setDoc exactly once with merge:true and never writes displayName', async () => {
    vi.mocked(setDoc).mockResolvedValue(undefined);

    await createUserProfile('uid-1', { email: 'a@b.test', telephone: '600' });

    expect(setDoc).toHaveBeenCalledTimes(1);
    const [, payload, options] = vi.mocked(setDoc).mock.calls[0];

    // displayName is denormalized from the persons doc by the
    // syncPersonDenormalization trigger — clients must not write it.
    expect(payload).not.toHaveProperty('displayName');

    expect(payload).toHaveProperty('email', 'a@b.test');
    expect(payload).toHaveProperty('telephone', '600');
    expect(payload).toHaveProperty('activeMunicipalityId', null);
    expect(payload).toHaveProperty('personId', null);
    expect(payload).toHaveProperty('createdAt', '__SERVER_TIMESTAMP__');

    // Consent defaults to the current version + a server timestamp when the
    // caller omits them (onboarding always passes them explicitly).
    expect(payload).toHaveProperty('termsAcceptedAt', '__SERVER_TIMESTAMP__');
    expect(payload).toHaveProperty('termsVersion', '1.0');

    // birthday/biography/photoURL are NOT on the user doc — they live on the
    // linked person (the profile of record). createUserProfile writes account
    // state only.
    expect(payload).not.toHaveProperty('birthday');
    expect(payload).not.toHaveProperty('biography');
    expect(payload).not.toHaveProperty('photoURL');

    expect(Object.keys(payload as object).sort()).toEqual(
      [
        'activeMunicipalityId',
        'createdAt',
        'email',
        'personId',
        'telephone',
        'termsAcceptedAt',
        'termsVersion',
      ],
    );

    // setDoc must run with { merge: true } so the trigger-written displayName
    // (if it landed first) survives the client's create call.
    expect(options).toEqual({ merge: true });
  });

  it('persists the caller-provided terms acceptance', async () => {
    vi.mocked(setDoc).mockResolvedValue(undefined);

    await createUserProfile('uid-1', {
      email: 'a@b.test',
      personId: 'p1',
      termsAcceptedAt: '__SERVER_TIMESTAMP__' as unknown as Date,
      termsVersion: '1.0',
    });

    const [, payload] = vi.mocked(setDoc).mock.calls[0];
    expect(payload).toHaveProperty('termsVersion', '1.0');
    expect(payload).toHaveProperty('termsAcceptedAt', '__SERVER_TIMESTAMP__');
  });
});

describe('patchUserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls updateDoc once with { personId } when patching personId', async () => {
    vi.mocked(updateDoc).mockResolvedValue(undefined);

    await patchUserProfile('uid-1', { personId: 'person-1' });

    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [, payload] = vi.mocked(updateDoc).mock.calls[0];
    expect(payload).toEqual({ personId: 'person-1' });
  });

  it('calls updateDoc once with all provided fields including nulls', async () => {
    vi.mocked(updateDoc).mockResolvedValue(undefined);

    await patchUserProfile('uid-1', {
      telephone: null,
      activeMunicipalityId: null,
      personId: null,
    });

    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [, payload] = vi.mocked(updateDoc).mock.calls[0];
    expect(payload).toEqual({
      telephone: null,
      activeMunicipalityId: null,
      personId: null,
    });
  });

  it('calls updateDoc once with { email } when patching email', async () => {
    vi.mocked(updateDoc).mockResolvedValue(undefined);

    await patchUserProfile('uid-1', { email: 'new@example.com' });

    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [, payload] = vi.mocked(updateDoc).mock.calls[0];
    expect(payload).toEqual({ email: 'new@example.com' });
  });
});

describe('getUserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when the snapshot does not exist', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as any);

    const result = await getUserProfile('uid-1');

    expect(result).toBeNull();
  });

  it('returns the mapped user shape including denormalized displayName', async () => {
    const fakeDate = new Date('2024-01-01T00:00:00Z');
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      id: 'uid-1',
      data: () => ({
        displayName: 'Ana',
        email: 'a@b.test',
        telephone: '600',
        activeMunicipalityId: 'muni-1',
        personId: 'person-1',
        createdAt: fakeDate,
      }),
    } as any);

    const result = await getUserProfile('uid-1');

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      id: 'uid-1',
      displayName: 'Ana',
      email: 'a@b.test',
      telephone: '600',
      activeMunicipalityId: 'muni-1',
      personId: 'person-1',
      createdAt: fakeDate,
    });
  });
});

describe('getPublicProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads publicProfiles/{uid}, never the private account doc', async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      id: 'uid-2',
      data: () => ({ displayName: 'Bea', activeMunicipalityId: 'muni-1' }),
    } as any);

    const result = await getPublicProfile('uid-2');

    expect(vi.mocked(doc).mock.calls.map((c) => c.slice(1))).toEqual([['publicProfiles', 'uid-2']]);
    expect(result).toEqual({ id: 'uid-2', displayName: 'Bea', activeMunicipalityId: 'muni-1' });
  });

  it('returns null when the projection does not exist', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as any);

    expect(await getPublicProfile('uid-2')).toBeNull();
  });
});

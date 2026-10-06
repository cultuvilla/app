/* eslint-disable @typescript-eslint/no-explicit-any,
                  @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/require-await */
// vi.mock factories legitimately fake the firebase/firestore SDK shape —
// matching notificationService.unreadable.test.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/firebase', () => ({ getDb: vi.fn(), getFirebaseFunctions: vi.fn() }));
vi.mock('firebase/firestore', async () => {
  const makeRef = () => {
    const ref: { withConverter: ReturnType<typeof vi.fn> } = { withConverter: vi.fn() };
    ref.withConverter.mockReturnValue(ref);
    return ref;
  };
  return {
    collection: vi.fn(() => makeRef()),
    doc: vi.fn(() => makeRef()),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    query: vi.fn(),
    orderBy: vi.fn(),
    where: vi.fn(),
  };
});

import { getDoc } from 'firebase/firestore';
import { getReadableWrapped } from '../../src/services/villageWrappedService';

/** Shaped like the SDK's FirebaseError — the service reads only its `code`. */
const firestoreError = (code: string, message: string) => Object.assign(new Error(message), { code });

const snap = (status: string | null) =>
  status === null
    ? { exists: () => false }
    : { exists: () => true, id: 'm1_2026', data: () => ({ status, year: 2026 }) };

describe('getReadableWrapped', () => {
  beforeEach(() => {
    vi.mocked(getDoc).mockReset();
  });

  it('returns a published Wrapped', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap('published') as any);
    await expect(getReadableWrapped('m1', 2026)).resolves.toMatchObject({ id: 'm1_2026', status: 'published' });
  });

  it('has nothing for a year with no Wrapped', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap(null) as any);
    await expect(getReadableWrapped('m1', 2026)).resolves.toBeNull();
  });

  // The rules deny a draft to anyone but the village admins — to a reader it is
  // the same as no Wrapped, not an error to show them.
  it('reads a draft the rules withhold as no Wrapped', async () => {
    vi.mocked(getDoc).mockImplementation(() => Promise.reject(firestoreError('permission-denied', 'denied')));
    await expect(getReadableWrapped('m1', 2026)).resolves.toBeNull();
  });

  it('does not show an admin their own draft as if it were public', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap('draft') as any);
    await expect(getReadableWrapped('m1', 2026)).resolves.toBeNull();
  });

  it('lets any other failure through', async () => {
    vi.mocked(getDoc).mockImplementation(() => Promise.reject(firestoreError('unavailable', 'offline')));
    await expect(getReadableWrapped('m1', 2026)).rejects.toThrow('offline');
  });
});

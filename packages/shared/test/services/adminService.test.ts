import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeFirestoreModule, resetFakeFirestore, fakeStore } from '../helpers/fakeFirestore';

const getDocFailure: { error: Error | null } = { error: null };

vi.mock('../../src/firebase', () => ({ getDb: () => ({}), getFirebaseFunctions: vi.fn(() => ({})) }));
vi.mock('firebase/firestore', () => {
  const m = createFakeFirestoreModule();
  return {
    ...m,
    getDoc: (ref: Parameters<typeof m.getDoc>[0]) =>
      getDocFailure.error ? Promise.reject(getDocFailure.error) : m.getDoc(ref),
  };
});

import { isAppAdmin } from '../../src/services/adminService';

describe('isAppAdmin', () => {
  beforeEach(() => {
    resetFakeFirestore();
    getDocFailure.error = null;
  });

  it('is true when admins/{uid} exists', async () => {
    fakeStore()['admins/sadmin'] = { createdAt: new Date() };
    await expect(isAppAdmin('sadmin')).resolves.toBe(true);
  });

  it('is false when there is no marker doc', async () => {
    fakeStore()['admins/someone-else'] = { createdAt: new Date() };
    await expect(isAppAdmin('alice')).resolves.toBe(false);
  });

  it('treats a denied read as "not admin" rather than throwing', async () => {
    // Rules deny reading admins/* to non-admins, so the probe itself fails.
    getDocFailure.error = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied',
    });
    await expect(isAppAdmin('alice')).resolves.toBe(false);
  });
});

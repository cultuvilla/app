/* eslint-disable @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/no-explicit-any,
                  @typescript-eslint/require-await */
// vi.mock factories legitimately fake the firebase/firestore SDK shape.
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
    deleteDoc: vi.fn(),
    addDoc: vi.fn(),
    updateDoc: vi.fn(),
    writeBatch: vi.fn(),
    getCountFromServer: vi.fn(),
    query: vi.fn(),
    orderBy: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
});

import { deleteDoc, setDoc, writeBatch } from 'firebase/firestore';
import {
  registerDevice,
  saveNotificationSettings,
  unregisterDevice,
} from '../../src/services/notificationService';

const pathOf = (ref: unknown) => (ref as { _path: unknown[] })._path.slice(1);

describe('push devices', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers a device at a doc keyed by its own token', async () => {
    await registerDevice('u1', { token: 'tok', platform: 'android', appVersion: '1.2.0' });
    const [ref, payload] = vi.mocked(setDoc).mock.calls[0];
    expect(pathOf(ref)).toEqual(['users', 'u1', 'devices', 'tok']);
    expect(payload).toMatchObject({ token: 'tok', platform: 'android', apnsEnvironment: null, apnsTopic: null });
  });

  it('unregisters only the one device', async () => {
    await unregisterDevice('u1', 'tok');
    expect(pathOf(vi.mocked(deleteDoc).mock.calls[0][0])).toEqual(['users', 'u1', 'devices', 'tok']);
  });
});

describe('push switches', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves the topics and writes the old coarse doc back all-on, in one batch', async () => {
    const batch = { set: vi.fn(), commit: vi.fn(() => Promise.resolve()) };
    vi.mocked(writeBatch).mockReturnValue(batch as any);
    await saveNotificationSettings('u1', { mutedTopics: ['village_news'], mutedVillages: ['m1'], quietHours: false });

    expect(batch.set).toHaveBeenCalledTimes(2);
    const [settingsRef, settings] = batch.set.mock.calls[0] as [unknown, unknown];
    expect(pathOf(settingsRef)).toEqual(['users', 'u1', 'notificationSettings', 'account']);
    expect(settings).toMatchObject({ mutedTopics: ['village_news'], mutedVillages: ['m1'], quietHours: false });
    const [legacyRef, legacy] = batch.set.mock.calls[1] as [unknown, unknown];
    expect(pathOf(legacyRef)).toEqual(['users', 'u1', 'preferences', 'notifications']);
    expect(legacy).toMatchObject({ mine: true, village: true, social: true, quietHours: false });
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });
});

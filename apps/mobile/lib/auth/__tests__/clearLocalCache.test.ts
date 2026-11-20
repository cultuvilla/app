import { DevSettings } from 'react-native';
import * as Updates from 'expo-updates';
import { observability } from '@cultuvilla/shared';
import { clearIndexedDbPersistence, terminate } from '@cultuvilla/shared/firebase/sdk/firestore';
import { clearLocalCacheAndRestart } from '../clearLocalCache';
import { resumeFetches, trackInflightFetches } from '../inflightFetches';

jest.mock('@cultuvilla/shared/firebase', () => ({ getDb: () => ({ db: true }) }));
jest.mock('@cultuvilla/shared', () => ({ observability: { captureError: jest.fn() } }));
jest.mock('@cultuvilla/shared/firebase/sdk/firestore', () => ({
  terminate: jest.fn(async () => undefined),
  clearIndexedDbPersistence: jest.fn(async () => undefined),
}));
jest.mock('expo-updates', () => ({ reloadAsync: jest.fn(async () => undefined) }));
jest.mock('../../intro/introSkip', () => ({
  skipIntroOnNextLaunch: jest.fn(async () => void mockOrder.push('skip-intro')),
}));
jest.mock('../inflightFetches', () => ({
  trackInflightFetches: jest.fn(),
  quiesceFetches: jest.fn(async () => void mockOrder.push('quiesce')),
  resumeFetches: jest.fn(() => void mockOrder.push('resume')),
}));

const mockOrder: string[] = [];
const order = mockOrder;

beforeEach(() => {
  jest.clearAllMocks();
  order.length = 0;
  (terminate as jest.Mock).mockImplementation(async () => void order.push('terminate'));
  (clearIndexedDbPersistence as jest.Mock).mockImplementation(async () => void order.push('clear'));
  (Updates.reloadAsync as jest.Mock).mockImplementation(async () => void order.push('reload'));
  jest.spyOn(DevSettings, 'reload').mockImplementation(() => void order.push('reload'));
});

const installedAtLoad = (trackInflightFetches as jest.Mock).mock.calls.length;

describe('clearLocalCacheAndRestart', () => {
  it('tracks requests from startup, so a reload can wait for them', () => {
    expect(installedAtLoad).toBe(1);
  });

  it('terminates Firestore, clears its cache, settles open requests, then restarts', async () => {
    await clearLocalCacheAndRestart();
    expect(order).toEqual(['terminate', 'clear', 'skip-intro', 'quiesce', 'reload']);
    expect(clearIndexedDbPersistence).toHaveBeenCalledWith({ db: true });
  });

  it('still restarts, and reports, when clearing fails', async () => {
    (clearIndexedDbPersistence as jest.Mock).mockRejectedValue(new Error('busy'));
    await clearLocalCacheAndRestart();
    expect(observability.captureError).toHaveBeenCalled();
    expect(DevSettings.reload).toHaveBeenCalled();
  });

  it('restarts through expo-updates in a release build', async () => {
    const g = globalThis as { __DEV__?: boolean };
    const dev = g.__DEV__;
    g.__DEV__ = false;
    try {
      await clearLocalCacheAndRestart();
      expect(Updates.reloadAsync).toHaveBeenCalled();
      expect(DevSettings.reload).not.toHaveBeenCalled();
    } finally {
      g.__DEV__ = dev;
    }
  });

  it('lets requests through again when the reload fails', async () => {
    const g = globalThis as { __DEV__?: boolean };
    const dev = g.__DEV__;
    g.__DEV__ = false;
    (Updates.reloadAsync as jest.Mock).mockRejectedValueOnce(new Error('no reload'));
    try {
      await expect(clearLocalCacheAndRestart()).rejects.toThrow('no reload');
      expect(resumeFetches).toHaveBeenCalled();
    } finally {
      g.__DEV__ = dev;
    }
  });
});

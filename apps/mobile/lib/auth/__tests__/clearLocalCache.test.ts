import { DevSettings } from 'react-native';
import * as Updates from 'expo-updates';
import { observability } from '@cultuvilla/shared';
import { clearIndexedDbPersistence, terminate } from '@cultuvilla/shared/firebase/sdk/firestore';
import { clearLocalCacheAndRestart } from '../clearLocalCache';

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

const mockOrder: string[] = [];
const order = mockOrder;

beforeEach(() => {
  jest.clearAllMocks();
  order.length = 0;
  (terminate as jest.Mock).mockImplementation(async () => void order.push('terminate'));
  (clearIndexedDbPersistence as jest.Mock).mockImplementation(async () => void order.push('clear'));
  jest.spyOn(DevSettings, 'reload').mockImplementation(() => void order.push('reload'));
});

describe('clearLocalCacheAndRestart', () => {
  it('terminates Firestore before clearing its cache, then restarts', async () => {
    await clearLocalCacheAndRestart();
    expect(order).toEqual(['terminate', 'clear', 'skip-intro', 'reload']);
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
});

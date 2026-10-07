import AsyncStorage from '@react-native-async-storage/async-storage';
import { consumeIntroSkip, skipIntroOnNextLaunch } from '../introSkip';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('intro skip', () => {
  it('plays the intro on an ordinary launch', async () => {
    expect(await consumeIntroSkip()).toBe(false);
  });

  it('skips exactly one launch after it is asked for', async () => {
    await skipIntroOnNextLaunch();
    expect(await consumeIntroSkip()).toBe(true);
    expect(await consumeIntroSkip()).toBe(false);
  });

  it('plays the intro when storage cannot be read', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('io'));
    expect(await consumeIntroSkip()).toBe(false);
  });
});

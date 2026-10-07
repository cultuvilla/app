import AsyncStorage from '@react-native-async-storage/async-storage';

const SKIP_INTRO_KEY = 'cultuvilla.skipIntroOnce';

/**
 * Asks the next app launch to skip the startup intro. Sign-out restarts the JS
 * app to wipe the on-device cache, and that restart is not a fresh start the
 * intro should greet.
 */
export async function skipIntroOnNextLaunch(): Promise<void> {
  await AsyncStorage.setItem(SKIP_INTRO_KEY, '1');
}

/** True once after skipIntroOnNextLaunch; an unreadable store plays the intro. */
export async function consumeIntroSkip(): Promise<boolean> {
  try {
    if (!(await AsyncStorage.getItem(SKIP_INTRO_KEY))) return false;
    await AsyncStorage.removeItem(SKIP_INTRO_KEY);
    return true;
  } catch {
    return false;
  }
}

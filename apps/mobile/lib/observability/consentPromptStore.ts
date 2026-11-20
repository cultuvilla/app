import AsyncStorage from '@react-native-async-storage/async-storage';
import { observability } from '@cultuvilla/shared';
import { EMPTY_PROMPT_STATE, parsePromptState, type ConsentPromptState } from './analyticsConsentPrompt';

// Per user and per device on purpose: it counts this phone's app days, and an
// answer — the only thing that must follow the account — lives in Firestore.
const key = (uid: string) => `cultuvilla.analyticsConsentPrompt.${uid}`;

export async function readConsentPromptState(uid: string): Promise<ConsentPromptState> {
  try {
    return parsePromptState(await AsyncStorage.getItem(key(uid)));
  } catch (err) {
    observability.captureError(err, { operation: 'privacy:readPromptState' });
    return EMPTY_PROMPT_STATE;
  }
}

export async function writeConsentPromptState(uid: string, state: ConsentPromptState): Promise<void> {
  try {
    await AsyncStorage.setItem(key(uid), JSON.stringify(state));
  } catch (err) {
    observability.captureError(err, { operation: 'privacy:writePromptState' });
  }
}

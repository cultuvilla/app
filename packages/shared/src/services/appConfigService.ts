import { doc, getDoc } from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import { appVersionConfigConverterClient } from '../firebase/converters/appVersionConfigConverter.client';
import type { AppVersionConfig } from '../models/config';

const CONFIG_COLLECTION = 'config';
const APP_VERSION_DOC = 'appVersion';

/**
 * Read the published min/latest version config. Returns null on a missing doc
 * or ANY error (network, malformed doc) — the force-update gate treats null as
 * 'ok' so a bad read can never brick the app.
 */
export async function getAppVersionConfig(): Promise<AppVersionConfig | null> {
  try {
    const ref = doc(getDb(), CONFIG_COLLECTION, APP_VERSION_DOC).withConverter(
      appVersionConfigConverterClient,
    );
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

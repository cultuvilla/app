import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The location picker is a react-native-maps MapView. On Android that is Google
// Maps, which crashes the moment the view mounts if the manifest carries no
// `com.google.android.geo.API_KEY` — and the react-native-maps config plugin
// writes that entry only when it is handed a non-empty key.

const repoRoot = resolve(__dirname, '../../../..');
const appConfig = readFileSync(resolve(repoRoot, 'apps/mobile/app.config.ts'), 'utf8');
const keyMap =
  appConfig.match(/const googleMapsAndroidKeyPerEnv[^=]*=\s*\{([\s\S]*?)\};/)?.[1] ?? '';

describe('Google Maps Android key', () => {
  it.each(['dev', 'beta', 'prod'])('%s has a Maps SDK for Android key', (env) => {
    const value = keyMap.match(new RegExp(`${env}:\\s*'([^']*)'`))?.[1] ?? '';
    expect(value).toMatch(/^AIza[\w-]{35}$/);
  });

  it('is handed to the react-native-maps plugin', () => {
    expect(appConfig).toMatch(
      /'react-native-maps',\s*\{\s*androidGoogleMapsApiKey:\s*googleMapsAndroidKeyPerEnv\[env\]/,
    );
  });
});

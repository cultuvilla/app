import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Android push registers through the native Firebase config in
// apps/mobile/google-services/<env>/google-services.json. A wrong file fails
// SILENTLY: the build succeeds, the app runs, and no Android device ever gets a
// push token — nothing errors anywhere a human would look. So the pairing of
// file → package → Firebase project is locked here.

const repoRoot = resolve(__dirname, '../../../..');
const dir = resolve(repoRoot, 'apps/mobile/google-services');

const EXPECTED = {
  dev: { packageName: 'com.cultuvilla.app.dev', projectId: 'villa-events' },
  beta: { packageName: 'com.cultuvilla.app.beta', projectId: 'cultuvilla-beta' },
  prod: { packageName: 'com.cultuvilla.app', projectId: 'cultuvilla-prod' },
} as const;

interface GoogleServices {
  project_info: { project_id: string };
  client: { client_info: { android_client_info: { package_name: string } } }[];
}

function load(env: keyof typeof EXPECTED): GoogleServices | null {
  const file = resolve(dir, env, 'google-services.json');
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as GoogleServices) : null;
}

describe('Android google-services.json', () => {
  it.each(['prod', 'beta'] as const)('exists for %s — both ship through Play', (env) => {
    // docs/decisions/beta-is-its-own-play-app.md: without this file no install
    // of that app can receive push at all.
    expect(load(env)).not.toBeNull();
  });

  it.each(Object.keys(EXPECTED) as (keyof typeof EXPECTED)[])(
    '%s, when present, belongs to its own Firebase project and package',
    (env) => {
      const config = load(env);
      if (!config) return; // dev is sideload-only; the file is optional there
      expect(config.project_info.project_id).toBe(EXPECTED[env].projectId);
      expect(config.client.map((c) => c.client_info.android_client_info.package_name)).toContain(
        EXPECTED[env].packageName,
      );
    },
  );

  it('matches the package ids app.config.ts builds each env with', () => {
    const appConfig = readFileSync(resolve(repoRoot, 'apps/mobile/app.config.ts'), 'utf8');
    for (const { packageName } of Object.values(EXPECTED)) {
      expect(appConfig).toContain(`'${packageName}'`);
    }
  });
});

// iOS native analytics (@react-native-firebase/app) reads
// <env>/GoogleService-Info.plist. A swapped file fails the same silent way:
// events land in another env's GA4 property, or nowhere.
function plistValue(env: keyof typeof EXPECTED, key: string): string | null {
  const file = resolve(dir, env, 'GoogleService-Info.plist');
  if (!existsSync(file)) return null;
  const match = readFileSync(file, 'utf8').match(
    new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`),
  );
  return match ? match[1] : null;
}

describe('iOS GoogleService-Info.plist', () => {
  it.each(Object.keys(EXPECTED) as (keyof typeof EXPECTED)[])(
    'exists for %s and belongs to its own Firebase project and bundle id',
    (env) => {
      expect(plistValue(env, 'PROJECT_ID')).toBe(EXPECTED[env].projectId);
      expect(plistValue(env, 'BUNDLE_ID')).toBe(EXPECTED[env].packageName);
    },
  );
});

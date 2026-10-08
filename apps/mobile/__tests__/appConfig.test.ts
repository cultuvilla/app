import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import config from '../app.config';

// The EAS account + project this repo builds into. Pinned as literals rather
// than read from the environment: EAS_PROJECT_ID would be machine-global, and
// the dev machines also check out ordago-apps (owner `ordago-apps`). A stray
// export in a shell profile would have silently pointed one repo's builds at
// the other's EAS project — `owner` + `projectId` in the file make the routing
// per-repo by construction.
const EAS_OWNER = 'cultuvilla.app';
const EAS_PROJECT_ID = '53188e5f-c5a1-4b1c-a009-44108826d54d';

// The Apple team the app ships under. Not a secret — it is served publicly in
// every app's apple-app-site-association.
const APPLE_TEAM_ID = '78RB67NT38';

describe('app.config EAS identity', () => {
  it('pins the owning EAS account', () => {
    expect(config.owner).toBe(EAS_OWNER);
  });

  it('pins the EAS project id as a literal, not from the environment', () => {
    expect(config.extra?.['eas']).toMatchObject({ projectId: EAS_PROJECT_ID });

    // Matches env *usage*, not the prose in the comment above the pin.
    const source = readFileSync(join(__dirname, '..', 'app.config.ts'), 'utf8');
    expect(source).not.toMatch(/process\.env\[?['"`]EAS_PROJECT_ID/);
  });
});

describe('native Firebase on iOS', () => {
  // SPM + static frameworks aborts `pod install`; the first iOS build after the
  // native SDKs landed failed exactly there. Both settings must hold together.
  it('links static frameworks with Firebase resolved through CocoaPods, not SPM', () => {
    const plugins = (config.plugins ?? []) as (string | [string, unknown])[];
    const options = (name: string) => plugins.find((p) => Array.isArray(p) && p[0] === name)?.[1];
    expect(options('expo-build-properties')).toMatchObject({ ios: { useFrameworks: 'static' } });
    expect(options('@react-native-firebase/app')).toEqual({ ios: { disableSPM: true } });
  });
});

describe('apple-app-site-association', () => {
  const envs = ['dev', 'beta', 'prod'] as const;
  const bundleIdPerEnv = {
    dev: 'com.cultuvilla.app.dev',
    beta: 'com.cultuvilla.app.beta',
    prod: 'com.cultuvilla.app',
  } as const;

  it.each(envs)('carries the real Apple Team ID for %s', (env) => {
    const path = join(__dirname, '..', '..', '..', 'web', 'well-known', env, 'apple-app-site-association');
    const aasa = JSON.parse(readFileSync(path, 'utf8'));

    const appIDs = aasa.applinks.details.map((d: { appID: string }) => d.appID);
    expect(appIDs).toContain(`${APPLE_TEAM_ID}.${bundleIdPerEnv[env]}`);
  });
});

// The E2E auth bypass used to be structurally unable to reach a store binary
// because the fixture-login seam was web-only. The native (Maestro) driver
// removed that wall, so app.config.ts became the wall instead: it refuses to
// evaluate at all for a non-dev env with the flag set. This test is what keeps
// that refusal from being quietly deleted.
describe('E2E emulator flag guard', () => {
  const load = (env: string | undefined, flag: string | undefined) => {
    const prevEnv = process.env['APP_ENV'];
    const prevFlag = process.env['USE_FIREBASE_EMULATOR'];
    if (env === undefined) delete process.env['APP_ENV'];
    else process.env['APP_ENV'] = env;
    if (flag === undefined) delete process.env['USE_FIREBASE_EMULATOR'];
    else process.env['USE_FIREBASE_EMULATOR'] = flag;
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../app.config');
      });
    } finally {
      if (prevEnv === undefined) delete process.env['APP_ENV'];
      else process.env['APP_ENV'] = prevEnv;
      if (prevFlag === undefined) delete process.env['USE_FIREBASE_EMULATOR'];
      else process.env['USE_FIREBASE_EMULATOR'] = prevFlag;
    }
  };

  it.each(['beta', 'prod'])('refuses to build a %s bundle with the bypass armed', (env) => {
    expect(() => load(env, '1')).toThrow(/USE_FIREBASE_EMULATOR=1/);
  });

  it('allows the dev bundle the E2E jobs actually build', () => {
    expect(() => load('dev', '1')).not.toThrow();
  });

  it.each(['dev', 'beta', 'prod'])('never blocks an ordinary %s build', (env) => {
    expect(() => load(env, undefined)).not.toThrow();
  });

  it('surfaces the flag as extra.useEmulator only when armed', () => {
    expect(config.extra?.['useEmulator']).toBe(false);
  });
});

// The iOS E2E build re-points the native SDK at the emulators' test project
// with a generated plist (scripts/lib/e2e-build-env.mjs). The override must be
// inert unless the bypass is armed, or a stray env var could swap the Firebase
// project of a real build.
describe('E2E native Firebase config override', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-plist-'));
  const plist = join(dir, 'GoogleService-Info.plist');
  writeFileSync(plist, '<plist/>');

  const iosConfigFile = (flag: string | undefined): unknown => {
    const keys = ['APP_ENV', 'USE_FIREBASE_EMULATOR', 'E2E_GOOGLE_SERVICE_INFO_FILE'] as const;
    const prev = keys.map((k) => process.env[k]);
    process.env['APP_ENV'] = 'dev';
    process.env['E2E_GOOGLE_SERVICE_INFO_FILE'] = plist;
    if (flag === undefined) delete process.env['USE_FIREBASE_EMULATOR'];
    else process.env['USE_FIREBASE_EMULATOR'] = flag;
    let loaded: typeof config | undefined;
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        loaded = require('../app.config').default;
      });
    } finally {
      keys.forEach((k, i) => {
        const value = prev[i];
        if (value === undefined) delete process.env[k];
        else process.env[k] = value;
      });
    }
    return loaded?.ios?.googleServicesFile;
  };

  it('uses the generated plist in an armed build', () => {
    expect(iosConfigFile('1')).toBe(plist);
  });

  it('ignores it in an ordinary build', () => {
    expect(iosConfigFile(undefined)).toBe('./google-services/dev/GoogleService-Info.plist');
  });
});

describe('universal link paths', () => {
  // Prod is excluded on purpose: it keeps the legacy claim the live iOS 1.0.0
  // binary can route, pinned in packages/shared/test/ci/storeRelease.test.ts.
  it('claims every path except sign-in, since URLs start with the pueblo slug', () => {
    for (const env of ['dev', 'beta'] as const) {
      const path = join(__dirname, '..', '..', '..', 'web', 'well-known', env, 'apple-app-site-association');
      const aasa = JSON.parse(readFileSync(path, 'utf8'));
      expect(aasa.applinks.details[0].paths).toEqual(['NOT /entrar', 'NOT /entrar/*', '*']);
    }
  });
});

// The dev login buttons carry a real password in `extra`, which ships in every
// bundle's manifest. This gate is what keeps it out of beta/prod builds.
describe('dev login gate', () => {
  type DevLogin = { emails: string[]; password: string } | null;
  const VARS = ['APP_ENV', 'DEV_LOGIN_EMAILS', 'DEV_LOGIN_PASSWORD'] as const;

  const loadDevLogin = (vars: Partial<Record<(typeof VARS)[number], string>>): DevLogin => {
    const prev = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
    for (const k of VARS) {
      const v = vars[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    let devLogin: DevLogin = null;
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const loaded = require('../app.config').default as typeof config;
        devLogin = (loaded.extra?.['devLogin'] ?? null) as DevLogin;
      });
    } finally {
      for (const k of VARS) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    }
    return devLogin;
  };

  const BOTH = { DEV_LOGIN_EMAILS: 'a@x.dev', DEV_LOGIN_PASSWORD: 'pw' };

  it.each(['beta', 'prod'])('never carries dev credentials into a %s bundle', (env) => {
    expect(loadDevLogin({ APP_ENV: env, ...BOTH })).toBeNull();
  });

  it('wires the accounts into a dev bundle', () => {
    expect(loadDevLogin({ APP_ENV: 'dev', ...BOTH })).toEqual({ emails: ['a@x.dev'], password: 'pw' });
  });

  it.each([
    ['emails', { DEV_LOGIN_EMAILS: 'a@x.dev' }],
    ['password', { DEV_LOGIN_PASSWORD: 'pw' }],
  ])('stays off in dev when only the %s are set', (_, vars) => {
    expect(loadDevLogin({ APP_ENV: 'dev', ...vars })).toBeNull();
  });

  it('tolerates whitespace and a trailing comma in the email list', () => {
    const devLogin = loadDevLogin({
      APP_ENV: 'dev',
      DEV_LOGIN_EMAILS: ' a@x.dev, b@x.dev,',
      DEV_LOGIN_PASSWORD: 'pw',
    });
    expect(devLogin?.emails).toEqual(['a@x.dev', 'b@x.dev']);
  });
});

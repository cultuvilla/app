import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Two apps reach Google Play, and only two: the public `com.cultuvilla.app`
// (prod data, promoted across its tracks by an explicit `mobile-release`
// dispatch) and the tester app `com.cultuvilla.app.beta` (beta data, internal
// track only, published on every merge to `beta`). Being separate packages is
// the point — the beta app installs next to the store one instead of replacing
// it. See docs/decisions/beta-is-its-own-play-app.md.
//
// These are invariant tests in the spirit of conformanceGate.test.ts: they fail
// the build if that arrangement is quietly undone.

// Only the fields these invariants actually assert on — this is a lens over
// eas.json, not a mirror of its schema.
interface EasConfig {
  cli: { appVersionSource: string };
  build: Record<
    string,
    {
      environment?: string;
      autoIncrement?: boolean;
      distribution?: string;
      developmentClient?: boolean;
      channel?: string;
      env?: Record<string, string>;
      android?: { buildType?: string };
    }
  >;
  submit: Record<
    string,
    {
      android: { track: string; applicationId: string; serviceAccountKeyPath: string };
      ios?: { ascAppId: string };
    }
  >;
}

interface AssetLinks {
  target: { package_name: string; sha256_cert_fingerprints: string[] };
}

interface AppleAppSiteAssociation {
  applinks: { details: { appID: string; paths: string[] }[] };
}

const repoRoot = resolve(__dirname, '../../../..');
const easJson = JSON.parse(
  readFileSync(resolve(repoRoot, 'apps/mobile/eas.json'), 'utf-8'),
) as EasConfig;
const workflow = readFileSync(resolve(repoRoot, '.github/workflows/mobile-release.yml'), 'utf-8');

const PROD_PACKAGE = 'com.cultuvilla.app';
const BETA_PACKAGE = 'com.cultuvilla.app.beta';
const appConfig = readFileSync(resolve(repoRoot, 'apps/mobile/app.config.ts'), 'utf-8');

describe('Play submit profiles', () => {
  const submitProfiles = ['internal', 'closed', 'production'] as const;

  it.each(submitProfiles)('%s targets the production package, not a per-env one', (profile) => {
    expect(easJson.submit[profile].android.applicationId).toBe(PROD_PACKAGE);
  });

  it('maps each profile to the Play track its name implies', () => {
    // `alpha` is the Play API's name for the closed-testing track — the one the
    // 14-day clock runs on.
    expect(easJson.submit.internal.android.track).toBe('internal');
    expect(easJson.submit.closed.android.track).toBe('alpha');
    expect(easJson.submit.production.android.track).toBe('production');
  });

  it.each([...submitProfiles, 'beta'])('%s reads the gitignored service-account key path', (profile) => {
    // Must stay matched by the repo-wide *service-account*.json gitignore rule,
    // and by the filename mobile-release.yml writes the secret to.
    expect(easJson.submit[profile].android.serviceAccountKeyPath).toBe(
      './google-play-service-account.json',
    );
    expect(workflow).toContain('apps/mobile/google-play-service-account.json');
  });
});

describe('the beta app is the only non-prod build a store sees', () => {
  // A separate package is a separate INSTALL — its own FCM token, Google
  // Sign-In Android OAuth client and App Links verification. That is exactly
  // why the beta app can sit next to the store app, and exactly why no OTHER
  // non-prod identity may reach a store: nobody has provisioned those for it.
  const nonProdBuildProfiles = Object.entries(easJson.build).filter(
    ([, profile]) => profile.env?.APP_ENV !== undefined && profile.env.APP_ENV !== 'prod',
  );

  it('submits only the production package and the beta app', () => {
    const submitted = new Set(
      Object.values(easJson.submit).map((profile) => profile.android.applicationId),
    );
    expect(submitted).toEqual(new Set([PROD_PACKAGE, BETA_PACKAGE]));
  });

  it('keeps the beta app on its internal track — it is never a public release', () => {
    const betaSubmits = Object.values(easJson.submit).filter(
      (profile) => profile.android.applicationId === BETA_PACKAGE,
    );
    expect(betaSubmits.map((profile) => profile.android.track)).toEqual(['internal']);
  });

  it('builds the beta app against beta data, from the EAS preview environment', () => {
    // app.config.ts is evaluated on the EAS build server, where .env does not
    // exist: without `environment` the FIREBASE_*_BETA values never arrive and
    // the app ships an empty Firebase config.
    expect(easJson.build.beta.env?.APP_ENV).toBe('beta');
    expect(easJson.build.beta.environment).toBe('preview');
    expect(easJson.build.beta.android?.buildType).toBe('app-bundle');
    expect(easJson.build.beta.autoIncrement).toBe(true);
  });

  it.each(
    nonProdBuildProfiles.filter(([name]) => name !== 'beta').map(([name]) => name),
  )('%s is internal-distribution — it cannot be handed to a store', (name) => {
    expect(easJson.build[name].distribution).toBe('internal');
  });

  it('keeps every non-prod APP_ENV off the release workflow', () => {
    // mobile-release.yml builds --profile production only; if a second profile
    // ever appears there, the build-invocation test below catches it. This one
    // catches the subtler version: the workflow overriding APP_ENV directly.
    expect(workflow).not.toMatch(/APP_ENV:\s*(dev|beta)\b/);
  });
});

describe('per-env application identity', () => {
  it('gives each env its own identifier, prod bare', () => {
    // The `.dev` / `.beta` identifiers are what let a non-prod build install
    // alongside the store app instead of replacing it.
    expect(appConfig).toContain("dev: 'com.cultuvilla.app.dev'");
    expect(appConfig).toContain("beta: 'com.cultuvilla.app.beta'");
    expect(appConfig).toContain(`prod: '${PROD_PACKAGE}'`);
  });

  it('labels non-prod builds so each icon is identifiable next to the store app', () => {
    // One short word each: launchers truncate "Cultuvilla Beta", and next to
    // the store app's "Cultuvilla" the bare word is the clearer tell.
    expect(appConfig).toContain("dev: 'Dev'");
    expect(appConfig).toContain("beta: 'Beta'");
  });
});

describe('production build profile', () => {
  it('emits an app bundle — Play rejects APKs for new applications', () => {
    expect(easJson.build.production.android.buildType).toBe('app-bundle');
  });

  it('sources its Firebase config from the EAS production environment', () => {
    // app.config.ts is evaluated on the EAS build server, where neither .env nor
    // GitHub Environment vars exist. Without this the prod bundle would ship
    // empty Firebase credentials and fail at runtime, not at build time.
    expect(easJson.build.production.environment).toBe('production');
    expect(easJson.build.production.env.APP_ENV).toBe('prod');
  });

  it('auto-increments the remote version counter', () => {
    expect(easJson.build.production.autoIncrement).toBe(true);
    expect(easJson.cli.appVersionSource).toBe('remote');
  });
});

describe('mobile-release workflow', () => {
  it('builds every track from the single production profile', () => {
    const buildInvocations = [...workflow.matchAll(/eas build \\?\s*\n?\s*--profile (\S+)/g)].map(
      (m) => m[1],
    );
    expect(buildInvocations.length).toBeGreaterThan(0);
    expect(new Set(buildInvocations)).toEqual(new Set(['production']));
  });

  it('routes the chosen track into the submit profile', () => {
    expect(workflow).toContain('--auto-submit-with-profile {0}');
    expect(workflow).toContain('inputs.track');
  });

  it('can resubmit a finished build to the chosen track without rebuilding', () => {
    expect(workflow).toContain('androidBuildId');
    expect(workflow).toMatch(/eas submit[\s\\]*--platform android[\s\\]*--profile "\$TRACK"/);
    expect(workflow).toContain('TRACK: ${{ inputs.track }}');
  });

  it('never triggers automatically — publishing is an explicit decision', () => {
    const triggers = workflow.slice(workflow.indexOf('\non:'), workflow.indexOf('\njobs:'));
    expect(triggers).toContain('workflow_dispatch');
    expect(triggers).not.toContain('push:');
    expect(triggers).not.toContain('pull_request:');
  });
});

describe('prod deep-link association files', () => {
  // Signing identities are public — they ship in world-readable files — so they
  // are committed rather than substituted at deploy time. What can silently
  // break is drift: if these stop naming the same app the submit profiles push
  // to, a shared link stops opening the app with no error message anywhere.
  const wellKnown = resolve(repoRoot, 'web/well-known/prod');
  const [assetLink] = JSON.parse(
    readFileSync(resolve(wellKnown, 'assetlinks.json'), 'utf-8'),
  ) as AssetLinks[];
  const association = JSON.parse(
    readFileSync(resolve(wellKnown, 'apple-app-site-association'), 'utf-8'),
  ) as AppleAppSiteAssociation;

  it('delegates to the same package the submit profiles target', () => {
    expect(assetLink.target.package_name).toBe(PROD_PACKAGE);
  });

  it('carries a real app signing fingerprint, not a placeholder', () => {
    // Play re-signs every AAB, so the certificate reaching a device is the app
    // signing key from Play Console — never the upload key EAS signed with.
    expect(assetLink.target.sha256_cert_fingerprints).toHaveLength(1);
    expect(assetLink.target.sha256_cert_fingerprints[0]).toMatch(
      /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/,
    );
  });

  it('pairs a real Apple Team ID with the same bundle identifier', () => {
    expect(association.applinks.details[0].appID).toMatch(
      new RegExp(`^[A-Z0-9]{10}\\.${PROD_PACKAGE.replace(/\./g, '\\.')}$`),
    );
  });

  it('claims only paths the App Store build can open', () => {
    // The association file applies to EVERY installed version of the app, and
    // the live App Store build (iOS 1.0.0) predates both the village-first URLs
    // and expo-updates, so no OTA can teach it the new routes. Claiming `*` would
    // open `/<pueblo>/evento/…` inside an app that has no such screen — a dead
    // end in place of a web page that works. Until an iOS build carrying the
    // village-first routes is live on the App Store, prod claims only the legacy
    // paths 1.0.0 routes: links shared before the change still open the app, and
    // every new URL opens on the web. Widen to the dev/beta claim then.
    expect(association.applinks.details[0].paths).toEqual([
      '/event/*',
      '/news/*',
      '/village/*',
      '/o/*',
    ]);
  });
});

// The beta branch auto-builds the beta app and submits it to its internal track,
// and builds iOS for TestFlight (.github/workflows/beta-build-and-submit.yml).
// Neither is a public release, so this step is automated while production
// stays an explicit decision.
describe('beta auto-submit workflow', () => {
  const wf = readFileSync(
    resolve(__dirname, '../../../..', '.github/workflows/beta-build-and-submit.yml'),
    'utf8',
  );

  it('triggers on beta and never on main', () => {
    expect(wf).toMatch(/branches:\s*\[beta\]/);
    expect(wf).not.toMatch(/branches:\s*\[[^\]]*main/);
  });

  // Submitting the production profile from here is what made every Android
  // tester's store listing say "(Internal testing)": Play serves the highest
  // version code across the tracks a user has joined, and beta was always ahead.
  it('builds and submits the beta app on Android, never the production package', () => {
    const android = wf.slice(wf.indexOf('  android:'), wf.indexOf('  ios:'));
    expect(android).toMatch(/--profile beta\b/);
    expect(android).toMatch(/--auto-submit-with-profile beta\b/);
    expect(android).not.toMatch(/--profile production/);
  });

  // A GitHub `environment` here would be rejected outright: the Production
  // environment's branch policy allows only `main`.
  it('does not scope itself to a GitHub environment', () => {
    expect(wf).not.toMatch(/^\s*environment:/m);
  });

  it('deletes the service account key even when the build fails', () => {
    expect(wf).toMatch(/if: always\(\)[\s\S]*rm -f apps\/mobile\/google-play-service-account\.json/);
  });

  // Mirrors the Android job — beta merges also build+submit iOS straight to
  // TestFlight, which needs no App Review for internal testers.
  it('has an iOS job that builds the production profile and submits it', () => {
    expect(wf).toMatch(/ios:\s*\n\s*name: iOS/);
    expect(wf).toMatch(/eas build[\s\S]*?--profile production[\s\S]*?--platform ios/);
    expect(wf).toMatch(/eas submit[\s\S]*?--profile production[\s\S]*?--platform ios/);
  });

  it('deletes the Apple API key even when the build fails', () => {
    expect(wf).toMatch(/if: always\(\)[\s\S]*rm -f apps\/mobile\/apple-asc-api-key\.p8/);
  });

  // A Play freeze must not freeze TestFlight: disabling the whole workflow for
  // an open Play review (2026-09-14) silently stopped iOS beta builds as well.
  it('pauses Play on a repo variable, on the Android job only', () => {
    const android = wf.slice(wf.indexOf('  android:'), wf.indexOf('  ios:'));
    const ios = wf.slice(wf.indexOf('  ios:'));
    expect(android).toMatch(/if: \$\{\{ vars\.PLAY_SUBMIT_PAUSED != 'true' \}\}/);
    expect(ios).not.toContain('PLAY_SUBMIT_PAUSED');
  });

  // eas submit adds the build to no TestFlight group, so external testers
  // never saw a beta build until someone added it by hand.
  // Resolving "the latest finished build" after the fact could pick up a
  // concurrent manual build and ship a binary this run never made.
  it.each([
    ['beta-build-and-submit.yml', wf],
    [
      'mobile-release.yml',
      readFileSync(resolve(__dirname, '../../../..', '.github/workflows/mobile-release.yml'), 'utf8'),
    ],
  ])('%s submits and distributes the exact iOS build it made', (_name, source) => {
    const ios = source.slice(source.indexOf('  ios:'));
    expect(ios).toMatch(/eas build[^\n]*--json/);
    expect(ios).toContain('--id "${{ steps.ios_build.outputs.id }}"');
    expect(ios).not.toContain('--latest');
    expect(ios).not.toContain('build:list');
  });

  it('puts the iOS build in front of every TestFlight group, external included', () => {
    expect(wf).toMatch(
      /appstore-release\.mjs testflight --build-number="\$\{BUILD_NUMBER\}" --groups=all --beta-review --apply/,
    );
  });
});

// `eas submit --asc-app-id` doesn't exist in this eas-cli version — the flag
// silently failed a real submission (caught 2026-08-26) after the build had
// already spent ~8 minutes on EAS. ascAppId belongs in the submit profile's
// JSON, not as a CLI flag, so this guards the whole class of "flag doesn't
// exist" mistakes rather than just this one string.
describe('eas submit invocations never pass unsupported flags', () => {
  const mobileReleaseWf = readFileSync(
    resolve(__dirname, '../../../..', '.github/workflows/mobile-release.yml'),
    'utf8',
  );
  const betaWf = readFileSync(
    resolve(__dirname, '../../../..', '.github/workflows/beta-build-and-submit.yml'),
    'utf8',
  );

  it.each([
    ['mobile-release.yml', mobileReleaseWf],
    ['beta-build-and-submit.yml', betaWf],
  ])('%s does not pass --asc-app-id to eas submit', (_name, wf) => {
    expect(wf).not.toContain('--asc-app-id');
  });

  it('ascAppId is committed in the submit profile instead', () => {
    expect(easJson.submit.production.ios?.ascAppId).toBe('6804756586');
  });
});

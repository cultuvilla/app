import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// The iOS E2E job runs the SAME Maestro flows as android-e2e on an iOS
// Simulator. Nothing else in CI runs the app on iOS, and no developer here can
// run it locally (it needs macOS), so these invariants are the only thing that
// notices when the arrangement is quietly undone. The shared halves — the
// emulator-armed env and the suite loop — are pinned in androidE2e.test.ts.

const repoRoot = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(repoRoot, p), 'utf8');

const workflow = read('.github/workflows/ios-e2e.yml');
const appConfig = read('apps/mobile/app.config.ts');
const buildScript = read('scripts/build-ios-e2e-app.mjs');
const runner = read('scripts/run-ios-e2e.mjs');
const rootPkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
const nativeDir = 'apps/mobile/e2e/native';

describe('ios-e2e workflow gating', () => {
  it('always runs on the beta/main release paths, like Android', () => {
    const triggers = workflow.slice(workflow.indexOf('on:'), workflow.indexOf('permissions:'));
    expect(triggers).toMatch(/pull_request:\s*\n\s*branches:\s*\[develop, beta, main\]/);
    expect(triggers).toMatch(/push:\s*\n\s*branches:\s*\[beta, main\]/);
    expect(triggers).toMatch(/workflow_dispatch:/);
  });

  // A develop PR runs the macOS job only when it touches the harness or the
  // shared flows; every other PR (and every release-path event) is decided by
  // the gate job, never by a trigger-level `paths:` that would also filter beta.
  it('runs develop PRs only when they touch the iOS harness or the flows', () => {
    expect(workflow).not.toMatch(/^\s*paths:/m);
    expect(workflow).toMatch(/needs: gate/);
    expect(workflow).toMatch(/if: needs\.gate\.outputs\.run == 'true'/);
    const gate = workflow.slice(workflow.indexOf('  gate:'), workflow.indexOf('  ios-e2e:'));
    for (const path of [
      'scripts/(run-ios-e2e|build-ios-e2e-app)',
      'scripts/lib/(maestro-suite|e2e-build-env)',
      'apps/mobile/e2e/native/',
    ]) {
      expect(gate).toContain(path);
    }
  });

  it('drives the suite through the same entrypoint a developer uses', () => {
    expect(workflow).toContain('run: pnpm test:e2e:ios');
    expect(rootPkg.scripts['test:e2e:ios']).toContain('run-tests-with-emulators.mjs');
    expect(rootPkg.scripts['test:e2e:ios']).toContain('pnpm seed:e2e');
    expect(rootPkg.scripts['test:e2e:ios']).toContain('run-ios-e2e.mjs');
  });
});

describe('iOS E2E build hygiene', () => {
  // Same env object as the Android build, so the two platforms test the same
  // armed dev bundle; it must reach prebuild AND xcodebuild.
  it('builds dev + emulator-armed through the shared env, for both build phases', () => {
    expect(buildScript.match(/const buildEnv = e2eBuildEnv\(EMULATOR_HOST\)/g)).toHaveLength(1);
    expect(buildScript).toMatch(/spawnSync\(cmd, args, \{ cwd, env: buildEnv/);
    expect(buildScript).toMatch(/writeE2ENativeFirebaseConfig\(buildEnv, 'ios'\)/);
  });

  // The Simulator shares the Mac's network: loopback IS the host. Baking the
  // AVD alias in would point the app at nothing.
  it('bakes loopback, not the AVD alias', () => {
    expect(buildScript).toMatch(/\|\| '127\.0\.0\.1'/);
    expect(buildScript).not.toMatch(/10\.0\.2\.2'/);
  });

  // Only Release embeds the JS bundle; Debug would wait for a Metro server.
  it('builds Release for the Simulator, unsigned', () => {
    expect(buildScript).toMatch(/'-configuration',\s*'Release'/);
    expect(buildScript).toMatch(/'iphonesimulator'/);
    expect(buildScript).toMatch(/'CODE_SIGNING_ALLOWED=NO'/);
  });

  // Unsigned means no entitlements, and Firebase Auth's keychain refuses such a
  // client (-34018): every sign-in failed silently and 15/16 flows failed with
  // the app still a guest. Putting them in the SIGNATURE instead made the Mac
  // kernel refuse to launch the app at all (error 162). Xcode's mechanism — a
  // linked __TEXT,__entitlements section — is the one that works, and the
  // build checks the section exists before any flow runs.
  it('links keychain entitlements into the binary, not the signature', () => {
    expect(buildScript).toMatch(/<key>application-identifier<\/key>/);
    expect(buildScript).toMatch(/<key>keychain-access-groups<\/key>/);
    expect(buildScript).toMatch(
      /OTHER_LDFLAGS=\$\(inherited\) -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __entitlements/,
    );
    expect(buildScript).not.toMatch(/run\('codesign'/);
    expect(buildScript).toMatch(/sectname __entitlements/);
  });

  // The ATS opt-in is written into the GENERATED ios/ tree. In app.config.ts it
  // would ride into `eas build` and ship a store binary that allows local HTTP.
  it('confines the local-networking ATS opt-in to the generated ios tree', () => {
    expect(buildScript).toMatch(/NSAllowsLocalNetworking/);
    expect(appConfig).not.toMatch(/NSAllowsLocalNetworking|NSAllowsArbitraryLoads/);
  });

  it('only honours the E2E GoogleService-Info override in an armed build', () => {
    expect(appConfig).toMatch(
      /USE_FIREBASE_EMULATOR'\]\s*===\s*'1'\s*&&\s*process\.env\['E2E_GOOGLE_SERVICE_INFO_FILE'\]/,
    );
  });
});

describe('iOS runner', () => {
  // A cold Simulator boot pins the runner's three cores for minutes. Overlapping
  // the suite's start timed Maestro's driver out ~40 minutes into a run;
  // overlapping the build halved its speed and ran the job into its timeout.
  // So it gets its own step, strictly between the two, and waits to finish.
  it('boots the Simulator to completion between the build and the suite', () => {
    const build = workflow.indexOf('node scripts/build-ios-e2e-app.mjs');
    const boot = workflow.indexOf('run: node scripts/run-ios-e2e.mjs --boot-only');
    const suite = workflow.indexOf('run: pnpm test:e2e:ios');
    expect(build).toBeGreaterThan(-1);
    expect(boot).toBeGreaterThan(build);
    expect(suite).toBeGreaterThan(boot);
    // --boot-only returns only after `bootstatus -b`, i.e. a finished boot.
    expect(runner.indexOf("'bootstatus', device, '-b'")).toBeLessThan(
      runner.indexOf('if (bootOnly) process.exit(0)'),
    );
  });

  it('gives the iOS driver more startup room than the shared default', () => {
    const ms = /MAESTRO_DRIVER_STARTUP_TIMEOUT \|\| '(\d+)'/.exec(runner)?.[1];
    expect(Number(ms)).toBeGreaterThan(180000);
    expect(runner).toMatch(/runMaestroSuite\(\{[\s\S]*?env: IOS_MAESTRO_ENV,/);
  });

  // iOS `clearState` leaves the keychain — and so the Firebase session — behind.
  // Without a reset, one flow's half-onboarded user hijacked every later flow.
  it('resets the keychain before every flow', () => {
    expect(runner).toMatch(/'simctl', 'keychain', device, 'reset'/);
    expect(runner).toMatch(/beforeEachFlow: resetKeychain/);
    expect(read('scripts/lib/maestro-suite.mjs')).toMatch(/beforeEachFlow\(name\);/);
  });

  it('runs the shared suite loop with its own announced quarantine', () => {
    expect(runner).toMatch(/runMaestroSuite\(\{[\s\S]*quarantined: QUARANTINED/);
  });

  // iOS asks "Open in …?" once per Simulator for a custom-scheme link. The
  // runner answers it before the suite so the flows stay identical across
  // platforms — and refuses to run the suite if it could not.
  it('trusts the deep-link scheme once, before the suite, and fails closed', () => {
    expect(runner).toMatch(/trust-deep-links\.yaml/);
    expect(runner.indexOf('trust-deep-links.yaml')).toBeLessThan(runner.indexOf('runMaestroSuite({'));
    expect(runner).toMatch(/if \(trusted !== 0\)[\s\S]{0,200}process\.exit\(1\)/);
  });

  // Setup is not a journey: inside flows/ it would be ordered and counted with
  // the suite (and run on Android, where there is no such prompt).
  it('keeps the trust flow outside flows/', () => {
    expect(readdirSync(resolve(repoRoot, nativeDir, 'flows'))).not.toContain('trust-deep-links.yaml');
    expect(read(`${nativeDir}/ios/trust-deep-links.yaml`)).toContain('appId: com.cultuvilla.app.dev');
  });
});

describe('shared flows run on both platforms', () => {
  const files = [
    ...readdirSync(resolve(repoRoot, nativeDir, 'flows')).map((f) => `flows/${f}`),
    ...readdirSync(resolve(repoRoot, nativeDir, 'subflows')).map((f) => `subflows/${f}`),
  ].filter((f) => f.endsWith('.yaml'));

  // iOS has no BACK key. An unguarded `pressKey: back` would fail every iOS
  // flow that reaches it, so each one must sit under `platform: Android`.
  it('only presses BACK under an Android platform guard', () => {
    for (const file of files) {
      const lines = read(`${nativeDir}/${file}`).split('\n');
      lines.forEach((line, i) => {
        if (!/^\s*-\s*pressKey:\s*back\b/i.test(line)) return;
        const preceding = lines.slice(Math.max(0, i - 8), i).join('\n');
        expect(preceding, `${file}:${String(i + 1)} presses BACK without a platform guard`).toMatch(
          /platform:\s*Android/,
        );
      });
    }
  });

  // iOS labels a tab "Explora, tab, 1 of 3", and Maestro matches the WHOLE
  // string: an exact tab-label selector passes on Android and never matches on
  // iOS. The first iOS run died on exactly this, with the tab on screen.
  it('matches tab labels with room for the iOS accessibility suffix', () => {
    const tabs = /(visible|tapOn):\s*'(Explora|Pueblo|Perfil)'\s*$/m;
    for (const file of [...files, 'ios/trust-deep-links.yaml']) {
      expect(read(`${nativeDir}/${file}`), `${file} matches a tab label exactly`).not.toMatch(tabs);
    }
  });

  // Maestro's iOS hideKeyboard failed on one form and opened the photo picker
  // on another. The subflows dismiss the keyboard by tapping blank margin.
  it('never uses hideKeyboard in a subflow either', () => {
    for (const file of files.filter((f) => f.startsWith('subflows/'))) {
      const body = read(`${nativeDir}/${file}`)
        .split('\n')
        .filter((l) => !l.trim().startsWith('#'))
        .join('\n');
      expect(body, file).not.toMatch(/hideKeyboard/);
    }
  });

  it('answers the location prompt on iOS as well as Android', () => {
    const subflow = read(`${nativeDir}/subflows/allow-location.yaml`);
    expect(subflow).toMatch(/allow while using app/);
    expect(subflow).toMatch(/while using the app/);
  });
});

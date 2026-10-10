import { beforeAll, describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
  // Merging to develop never waits on the macOS suite (decided 2026-10-10,
  // user): it runs on the release paths and by hand, exactly like Android.
  it('runs only on the beta/main release paths and by dispatch, like Android', () => {
    const triggers = workflow.slice(workflow.indexOf('on:'), workflow.indexOf('permissions:'));
    expect(triggers).toMatch(/pull_request:\s*\n\s*branches:\s*\[beta, main\]/);
    expect(triggers).toMatch(/push:\s*\n\s*branches:\s*\[beta, main\]/);
    expect(triggers).toMatch(/workflow_dispatch:/);
    expect(triggers).not.toMatch(/develop/);
  });

  // Run 8 timed out mid-suite and the upload, gated on !cancelled(), was
  // skipped: the failures it had already seen left no screenshot behind.
  it('uploads the Maestro artifacts even from a cancelled or timed-out job', () => {
    const step = workflow.slice(workflow.indexOf('- name: Upload Maestro artifacts'));
    expect(step).toMatch(/^\s*- name: Upload Maestro artifacts\s*\n\s*if: \$\{\{ always\(\) \}\}/);
  });

  // One build, shared: the build is the slowest step and identical for every
  // shard, so it must not run per machine.
  it('builds the app once and shards the suite across machines', () => {
    const build = workflow.slice(workflow.indexOf('  build:'), workflow.indexOf('  suite:'));
    const suite = workflow.slice(workflow.indexOf('  suite:'));
    expect(build).toContain('node scripts/build-ios-e2e-app.mjs');
    expect(build).toContain('name: ios-e2e-app');
    expect(suite).not.toContain('build-ios-e2e-app');
    expect(suite).toMatch(/needs: build/);
    expect(suite).toMatch(/fail-fast: false/);
    const shards = /shard: \[([\d, ]+)\]/.exec(suite)?.[1].split(',').map(Number) ?? [];
    expect(shards.length).toBeGreaterThan(1);
    expect(suite).toContain(`E2E_SHARD: \${{ matrix.shard }}/${String(shards.length)}`);
    expect(suite).toContain('name: ios-e2e-app');
  });

  // The 30 s default let a slow worker boot fail the app's callables outright.
  it('gives the Functions emulator room to boot a worker on a loaded runner', () => {
    const suite = workflow.slice(workflow.indexOf('  suite:'));
    expect(Number(/FUNCTIONS_DISCOVERY_TIMEOUT: '(\d+)'/.exec(suite)?.[1])).toBeGreaterThan(30);
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

// The iOS build re-points the native SDK's project by rewriting two keys of the
// committed dev plist. A regex rewrite that silently matched nothing would
// build an app on `villa-events` that reads an empty database and cannot sign
// anyone in — so a missing key must throw, not pass through.
describe('setPlistString', () => {
  const plist = read('apps/mobile/google-services/dev/GoogleService-Info.plist');
  let setPlistString: (plist: string, key: string, value: string) => string;

  beforeAll(async () => {
    ({ setPlistString } = (await import(
      pathToFileURL(resolve(repoRoot, 'scripts/lib/e2e-build-env.mjs')).href
    )) as { setPlistString: typeof setPlistString });
  });

  it('replaces only the named key', () => {
    const out = setPlistString(plist, 'PROJECT_ID', 'cultuvilla-test');
    expect(out).toMatch(/<key>PROJECT_ID<\/key>\s*<string>cultuvilla-test<\/string>/);
    expect(out).toContain('<key>BUNDLE_ID</key>');
    expect(out.replace('cultuvilla-test', '')).toBe(plist.replace(/villa-events(?=<\/string>)/, ''));
  });

  it('throws on a key the plist does not have', () => {
    expect(() => setPlistString(plist, 'NO_SUCH_KEY', 'x')).toThrow(/NO_SUCH_KEY/);
  });
});

// On CI nothing is booted and nothing is named, so this pick decides the
// device every run.
describe('pickSimulator', () => {
  interface Device {
    udid: string;
    name: string;
    runtime: string;
  }
  let pickSimulator: (devices: Device[]) => Device | undefined;
  let compareRuntimesNewestFirst: (a: string, b: string) => number;
  const rt = (v: string) => `com.apple.CoreSimulator.SimRuntime.iOS-${v}`;

  beforeAll(async () => {
    ({ pickSimulator, compareRuntimesNewestFirst } = (await import(
      pathToFileURL(resolve(repoRoot, 'scripts/lib/ios-simulator.mjs')).href
    )) as { pickSimulator: typeof pickSimulator; compareRuntimesNewestFirst: typeof compareRuntimesNewestFirst });
  });

  it('ranks runtimes numerically — iOS 26 outranks iOS 9, which a string sort gets wrong', () => {
    expect(compareRuntimesNewestFirst(rt('26-0'), rt('9-3'))).toBeLessThan(0);
    expect(compareRuntimesNewestFirst(rt('26-5'), rt('26-10'))).toBeGreaterThan(0);
    expect(compareRuntimesNewestFirst(rt('26'), rt('26-0'))).toBe(0);
  });

  it('picks an iPhone from the newest runtime, by name, whatever the listing order', () => {
    const devices: Device[] = [
      { udid: 'a', name: 'iPhone 17 Pro', runtime: rt('9-3') },
      { udid: 'b', name: 'iPad Pro', runtime: rt('26-5') },
      { udid: 'c', name: 'iPhone 17', runtime: rt('26-5') },
      { udid: 'd', name: 'iPhone 9', runtime: rt('26-5') },
      { udid: 'e', name: 'Apple Watch', runtime: 'com.apple.CoreSimulator.SimRuntime.watchOS-12-0' },
    ];
    expect(pickSimulator(devices)?.udid).toBe('d');
    expect(pickSimulator([...devices].reverse())?.udid).toBe('d');
  });

  it('returns nothing when there is no iPhone at all', () => {
    expect(pickSimulator([{ udid: 'x', name: 'iPad Air', runtime: rt('26-5') }])).toBeUndefined();
    expect(read('scripts/run-ios-e2e.mjs')).toMatch(/if \(!iphone\) \{[\s\S]{0,200}process\.exit\(1\)/);
  });
});

// Same stance as Android's quarantine (androidE2e.test.ts): a hole in the gate
// is allowed, a quiet, vague or unbounded one is not.
describe('iOS quarantine', () => {
  const block = runner.slice(runner.indexOf('const QUARANTINED = new Map(['));
  const quarantined = [...block.slice(0, block.indexOf(']);')).matchAll(/^\s{4}'([\w.-]+\.yaml)',$/gm)].map(
    ([, name]) => name,
  );

  // Two: 45 needs airplane mode, which Maestro cannot toggle on iOS at all,
  // and 55's news tab never finished loading for a villager on the Simulator.
  // A third needs this bound raised on purpose, in review.
  it('holds out at most two flows', () => {
    expect(quarantined.length).toBeLessThanOrEqual(2);
  });

  // 50 left the quarantine once its rewrite passed on iOS; a quiet return
  // would drop onboarding from the iOS gate again.
  it('runs onboarding (50) on iOS', () => {
    expect(quarantined).not.toContain('50-onboarding-complete-profile.yaml');
  });

  it('names only flows that exist', () => {
    const onDisk = readdirSync(resolve(repoRoot, nativeDir, 'flows'));
    for (const name of quarantined) expect(onDisk).toContain(name);
  });

  it('gives each held-out flow a reason', () => {
    for (const name of quarantined) {
      const at = runner.indexOf(`'${name}',`);
      const reason = runner.slice(at + name.length, at + name.length + 600);
      expect(reason.length, `no reason recorded for ${name}`).toBeGreaterThan(80);
    }
  });

  it('goes through the shared loop, which announces it and fails on a stale entry', () => {
    const lib = read('scripts/lib/maestro-suite.mjs');
    expect(lib).toMatch(/QUARANTINED, NOT RUN/);
    expect(lib).toMatch(/quarantine names a flow that does not exist/);
  });
});

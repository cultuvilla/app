import { beforeAll, describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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

  // Maestro's "App crashed" names no cause; the Simulator writes the app's
  // crash report on the host, and only it has the stack.
  it("uploads the app's crash reports with the Maestro artifacts", () => {
    const step = workflow.slice(workflow.indexOf('- name: Upload Maestro artifacts'));
    const paths = step.slice(0, step.indexOf('retention-days'));
    expect(paths).toContain('~/Library/Logs/DiagnosticReports/Dev*');
    expect(paths).toContain('~/Library/Logs/DiagnosticReports/JetsamEvent*');
  });

  it("records why the Simulator ended an app process, even from a failed job", () => {
    const step = workflow.slice(workflow.indexOf("- name: Collect the Simulator's termination reasons"));
    expect(step).toMatch(/^- name: Collect the Simulator's termination reasons\s*\n\s*if: \$\{\{ always\(\) \}\}/);
    expect(step.slice(0, step.indexOf('- name: Upload Maestro artifacts'))).toContain('report/sim-terminations.log');
    expect(workflow.indexOf("Collect the Simulator's termination reasons")).toBeLessThan(
      workflow.indexOf('- name: Upload Maestro artifacts'),
    );
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

// Maestro's unfiltered per-flow Simulator log cost the 3-core runner most of a
// core while the Firestore SDK's streams timed out. The shim narrows exactly
// that one call and must never break any other: a future Maestro that changes
// the call gets its full log back, not a broken stream.
describe('iOS xcrun shim', () => {
  const shim = resolve(repoRoot, 'scripts/lib/ios-xcrun-shim/xcrun');
  // `realXcrun` stands in for /usr/bin/xcrun and prints what it was given.
  const call = (args: string[], predicate?: string, realXcrun = 'echo') =>
    spawnSync('bash', [shim, ...args], {
      encoding: 'utf8',
      env: {
        PATH: process.env['PATH'],
        IOS_E2E_REAL_XCRUN: realXcrun,
        ...(predicate ? { IOS_E2E_SIM_LOG_PREDICATE: predicate } : {}),
      },
    });
  const maestroStream = ['simctl', 'spawn', 'UDID', 'log', 'stream', '--style', 'syslog'];

  it('is executable, so Maestro can run it from PATH', () => {
    expect(statSync(shim).mode & 0o111).not.toBe(0);
  });

  it("narrows Maestro's unfiltered log stream by the predicate, and says so", () => {
    const res = call(maestroStream, 'process == "Dev"');
    expect(res.status).toBe(0);
    const [banner, invoked] = res.stdout.trim().split('\n');
    expect(banner).toBe('[ios-e2e] filtered by scripts/lib/ios-xcrun-shim: process == "Dev"');
    expect(invoked).toBe([...maestroStream, '--predicate', 'process == "Dev"'].join(' '));
  });

  it('fails open: any other call, or no predicate, runs the real xcrun unchanged', () => {
    const others = [
      ['simctl', 'list', 'devices', '--json'],
      [...maestroStream, '--level', 'debug'],
      ['simctl', 'spawn', 'UDID', 'log', 'stream', '--style', 'compact'],
      ['simctl', 'spawn', 'UDID', 'log', 'stream', '--style', 'syslog', '--predicate', 'x'],
    ];
    for (const args of others) {
      // printf '%s\n' prints one argument per line, so quoting survives.
      const res = call(['%s\n', ...args], 'p == 1', 'printf');
      expect(res.stdout, args.join(' ')).toBe(args.map((a) => `${a}\n`).join(''));
    }
    expect(call(maestroStream).stdout.trim()).toBe(maestroStream.join(' '));
  });

  it('is armed by the runner with the app executable before Maestro first runs, and leaves apsd running', () => {
    expect(runner).toMatch(/IOS_MAESTRO_ENV\.PATH = `\$\{SHIM_DIR\}/);
    expect(runner).toMatch(/process == "\$\{executable\}" OR messageType == fault/);
    expect(runner.indexOf('armSimLogFilter(app')).toBeLessThan(runner.indexOf("'ios', 'trust-deep-links.yaml'"));
    // Flow 92 grants notifications, and the app then asks apsd for a push token.
    expect(runner).not.toMatch(/STOPPED_SIM_DAEMONS = .*apsd/);
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

  // Three: 45 needs airplane mode, which Maestro cannot toggle on iOS at all;
  // 55's news tab never finished loading for a villager on the Simulator; and
  // 83's poster needs a photo, and iOS photo uploads did not land on the shared
  // runners (#560). A fourth needs this bound raised on purpose, in review.
  it('holds out at most three flows', () => {
    expect(quarantined.length).toBeLessThanOrEqual(3);
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

// The stock Firestore emulator allows one client ping per 5 minutes; the SDKs
// ping every 30 s, which production accepts. It answered with GOAWAY
// too_many_pings, and on the Simulator a write then stalled ~90 s ("ping
// timeout"), failing flows 13–15. The lane gives the emulator production's
// policy and fails loudly whenever that stops being true.
// docs/decisions/ios-e2e-emulator-keepalive.md
describe('Firestore emulator keepalive', () => {
  const wrapper = read('scripts/run-tests-with-emulators.mjs');
  const policySource = read('scripts/emulator-keepalive/io/grpc/internal/KeepAliveEnforcer.java');

  it('runs the iOS suite with the emulator on production keepalive', () => {
    const step = workflow.slice(workflow.indexOf('- name: Seed + run the Maestro suite'));
    expect(step.slice(0, step.indexOf('run: pnpm test:e2e:ios'))).toMatch(/EMULATOR_KEEPALIVE: production/);
  });

  it('accepts the SDKs’ 30 s keepalive, with or without a call open', async () => {
    const policy = (await import(pathToFileURL(resolve(repoRoot, 'scripts/lib/emulator-keepalive.mjs')).href)) as {
      KEEPALIVE_PERMIT_MS: number;
      KEEPALIVE_POLICY_LINE: string;
    };
    expect(policy.KEEPALIVE_PERMIT_MS).toBeLessThan(30_000);
    expect(policy.KEEPALIVE_POLICY_LINE).toContain(`${String(policy.KEEPALIVE_PERMIT_MS)} ms, without calls: true`);
    const lib = read('scripts/lib/emulator-keepalive.mjs');
    expect(lib).toContain('-Xbootclasspath/a:');
    expect(lib).toContain('-Dcultuvilla.emulator.permitKeepAliveTimeMs=');
    expect(lib).toContain("'-Dcultuvilla.emulator.permitKeepAliveWithoutCalls=true'");
  });

  it('replaces grpc-java’s class under its own name and API, changing only the limits', () => {
    expect(policySource).toMatch(/^package io\.grpc\.internal;/m);
    expect(policySource).toMatch(/public final class KeepAliveEnforcer/);
    for (const member of [
      'public KeepAliveEnforcer(boolean permitWithoutCalls, long minTime, TimeUnit unit)',
      'public boolean pingAcceptable()',
      'public void resetCounters()',
      'public void onTransportActive()',
      'public void onTransportIdle()',
    ]) {
      expect(policySource).toContain(member);
    }
    expect(policySource).toContain('"cultuvilla.emulator.permitKeepAliveTimeMs"');
    expect(policySource).toContain('"cultuvilla.emulator.permitKeepAliveWithoutCalls"');
    expect(policySource).toContain('[emulator-keepalive] client pings permitted every ');
    // The boot class loader cannot see the jar's Guava.
    expect(policySource.match(/^import .*$/gm)).toEqual(['import java.util.concurrent.TimeUnit;']);
  });

  it('passes the policy to the emulator JVM only, and checks it before any command runs', () => {
    expect(wrapper).toMatch(/env: emulatorJavaOptions \? \{ \.\.\.emulatorEnv, JAVA_TOOL_OPTIONS: emulatorJavaOptions \}/);
    expect(wrapper).not.toMatch(/emulatorEnv = \{[^}]*JAVA_TOOL_OPTIONS/);
    const checks = wrapper.indexOf('if (KEEPALIVE) {\n  const host');
    expect(checks).toBeGreaterThan(-1);
    expect(checks).toBeLessThan(wrapper.indexOf('for (const { label, cmd, args } of commands)'));
    const block = wrapper.slice(checks, wrapper.indexOf('for (const { label, cmd, args } of commands)'));
    expect(block).toContain('keepaliveApiMismatch()');
    expect(block).toContain('probeKeepalive({ host })');
    expect(block).toContain('KEEPALIVE_POLICY_LINE');
    expect(block).toMatch(/shutdown\(1\)/);
  });

  it('fails the shard when the SDK still logs a ping timeout or too_many_pings', () => {
    const guard = runner.slice(runner.indexOf('function keepaliveErrors'));
    expect(guard).toContain("l.includes('ping timeout')");
    expect(guard).toContain("l.includes('too_many_pings')");
    expect(guard).toMatch(/if \(pingTimeouts \+ tooManyPings === 0\) return;[\s\S]*process\.exitCode = 1;/);
  });

  describe('probe', () => {
    type Probe = (opts: { host: string; gapMs?: number }) => Promise<{ ok: boolean; reason?: string }>;
    let probeKeepalive: Probe;
    beforeAll(async () => {
      ({ probeKeepalive } = (await import(
        pathToFileURL(resolve(repoRoot, 'scripts/check-emulator-keepalive.mjs')).href
      )) as { probeKeepalive: Probe });
    });

    // A plain HTTP/2 server acks pings; `strikeOut` makes it answer the third
    // the way the stock emulator does.
    async function withServer(strikeOut: boolean, fn: (host: string) => Promise<void>) {
      const http2 = await import('node:http2');
      const server = http2.createServer();
      const sessions: { destroy: () => void }[] = [];
      server.on('session', (session) => {
        sessions.push(session);
        let pings = 0;
        session.on('ping', () => {
          pings += 1;
          if (strikeOut && pings === 3) session.goaway(11, 0, Buffer.from('too_many_pings'));
        });
      });
      await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      try {
        await fn(`127.0.0.1:${String(port)}`);
      } finally {
        for (const session of sessions) session.destroy();
        await new Promise((done) => server.close(done));
      }
    }

    it('passes when every ping is acked', async () => {
      await withServer(false, async (host) => {
        expect(await probeKeepalive({ host, gapMs: 20 })).toEqual({ ok: true });
      });
    });

    it('fails on the stock emulator’s GOAWAY too_many_pings', async () => {
      await withServer(true, async (host) => {
        const result = await probeKeepalive({ host, gapMs: 20 });
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('too_many_pings');
      });
    });
  });
});

// A retry that runs on the failed attempt's data can only pass by accident: the
// flow 13 retry in ios-e2e 44764961074 opened the cuota on the part payment its
// first attempt had recorded. So every retry starts from the emulator data the
// first attempt started from.
describe('a retry starts from its first attempt’s data', () => {
  const lib = read('scripts/lib/maestro-suite.mjs');
  const loop = lib.slice(lib.indexOf('for (const name of flows)'), lib.indexOf('if (status !== 0) failed.push(name)'));

  it('snapshots before the first attempt and restores before every retry', () => {
    expect(loop).toMatch(/if \(attempt > 1\) await restoreAttemptStart\(label, emulators, start\);/);
    expect(loop).toMatch(/if \(emulators && attempt === 1\) start = await takeSnapshot\(emulators\);/);
    // The snapshot is the state the flow starts from: after the leftover reset,
    // and taken once, so a retry never snapshots its predecessor's mess.
    expect(loop.indexOf('deleteLeftoverDocs')).toBeLessThan(loop.indexOf('takeSnapshot'));
    expect(loop.indexOf('restoreAttemptStart')).toBeLessThan(loop.indexOf('takeSnapshot'));
  });

  it('does not retry when there are no emulators to restore', () => {
    expect(loop).toMatch(/attempt <= 1 \+ \(emulators \? retries : 0\)/);
    expect(lib).toMatch(/no emulators to restore between attempts, so a failed flow is not retried/);
  });

  it('gives the test processes the hub, which pauses triggers during a restore', () => {
    expect(read('scripts/run-tests-with-emulators.mjs')).toMatch(
      /emulatorHostEnv\(PORTS_BY_SERVICE, emulatorHubPort\(emulatorConfig\.config\)\)/,
    );
  });

  describe('emulator-snapshot against fake emulators', () => {
    interface Snapshot {
      documents: { name: string; fields: Record<string, unknown> }[];
      accounts: Record<string, unknown>[];
    }
    type Targets = { firestore: string; auth: string; hub: string; project: string };
    type Call = { method: string; url: string; body: string };
    let snap: {
      emulatorTargets: (env: Record<string, string | undefined>) => Targets | null;
      takeSnapshot: (t: Targets) => Promise<Snapshot>;
      restoreSnapshot: (t: Targets, s: Snapshot) => Promise<void>;
    };
    beforeAll(async () => {
      snap = (await import(pathToFileURL(resolve(repoRoot, 'scripts/lib/emulator-snapshot.mjs')).href)) as typeof snap;
    });

    const docName = (i: number) => `projects/p/databases/(default)/documents/c/d${String(i)}`;

    const CLEAR = '/emulator/v1/projects/p/databases/(default)/documents';
    const CANCELLED = JSON.stringify({ error: { code: 499, message: 'call already cancelled', status: 'CANCELLED' } });

    /**
     * How the fake answers the database clear: `ok` clears, `cancelled-cleared`
     * clears but answers 499 (as the real emulator did with listen streams
     * open), `cancelled-kept` answers 499 and keeps every document.
     */
    type ClearMode = 'ok' | 'cancelled-cleared' | 'cancelled-kept';

    // One HTTP server stands in for all three emulators and records each call.
    async function withFake(
      fn: (t: Targets, calls: Call[]) => Promise<void>,
      failOn?: string,
      clear: ClearMode[] = ['ok'],
    ) {
      const http = await import('node:http');
      const calls: Call[] = [];
      let docs = [1, 2, 3].map((i) => ({ name: docName(i), fields: { n: { integerValue: String(i) } } }));
      let clears = 0;
      const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c: Buffer) => (body += c.toString()));
        req.on('end', () => {
          const url = req.url ?? '';
          calls.push({ method: req.method ?? '', url, body });
          if (failOn && url.includes(failOn)) {
            res.writeHead(500).end('boom');
            return;
          }
          if (req.method === 'DELETE' && url === CLEAR) {
            const mode = clear[Math.min(clears++, clear.length - 1)];
            if (mode !== 'cancelled-kept') docs = [];
            if (mode === 'ok') res.writeHead(200).end('{}');
            else res.writeHead(499, { 'Content-Type': 'application/json' }).end(CANCELLED);
            return;
          }
          let out: unknown = {};
          if (url.endsWith(':runQuery')) out = [{ readTime: 'x' }, ...docs.map((document) => ({ document }))];
          if (url.includes('accounts:batchGet')) out = { users: [{ localId: 'u1', passwordHash: 'fakeHash:salt=s:password=p' }] };
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(out));
        });
      });
      await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
      const address = server.address();
      const host = `127.0.0.1:${String(typeof address === 'object' && address ? address.port : 0)}`;
      try {
        await fn({ firestore: host, auth: host, hub: host, project: 'p' }, calls);
      } finally {
        await new Promise((done) => server.close(done));
      }
    }

    it('needs all three emulators, and the hub, to be named', () => {
      const env = { FIRESTORE_EMULATOR_HOST: 'h:1', FIREBASE_AUTH_EMULATOR_HOST: 'h:2', GCLOUD_PROJECT: 'p' };
      expect(snap.emulatorTargets(env)).toBeNull();
      expect(snap.emulatorTargets({ ...env, FIREBASE_EMULATOR_HUB: 'h:3' })).toEqual({
        firestore: 'h:1',
        auth: 'h:2',
        hub: 'h:3',
        project: 'p',
      });
    });

    it('reads every document with one kindless query and every account with batchGet', async () => {
      await withFake(async (t, calls) => {
        const s = await snap.takeSnapshot(t);
        expect(s.documents.map((d) => d.name.split('/').pop())).toEqual(['d1', 'd2', 'd3']);
        expect(s.accounts).toHaveLength(1);
        const query = calls.find((c) => c.url.endsWith(':runQuery'));
        expect(JSON.parse(query?.body ?? '{}')).toEqual({ structuredQuery: { from: [{ allDescendants: true }] } });
      });
    });

    it('restores with triggers paused: clear, write back, then accounts', async () => {
      await withFake(async (t, calls) => {
        const documents = Array.from({ length: 1201 }, (_, i) => ({ name: docName(i), fields: {} }));
        await snap.restoreSnapshot(t, { documents, accounts: [{ localId: 'u1' }] });
        expect(calls.map((c) => `${c.method} ${c.url.replace(/\?.*/, '')}`)).toEqual([
          'PUT /functions/disableBackgroundTriggers',
          'DELETE /emulator/v1/projects/p/databases/(default)/documents',
          'POST /v1/projects/p/databases/(default)/documents:runQuery',
          'POST /v1/projects/p/databases/(default)/documents:batchWrite',
          'POST /v1/projects/p/databases/(default)/documents:batchWrite',
          'POST /v1/projects/p/databases/(default)/documents:batchWrite',
          'DELETE /emulator/v1/projects/p/accounts',
          'POST /identitytoolkit.googleapis.com/v1/projects/p/accounts:batchCreate',
          'PUT /functions/enableBackgroundTriggers',
        ]);
        const sizes = calls
          .filter((c) => c.url.endsWith(':batchWrite'))
          .map((c) => (JSON.parse(c.body) as { writes: unknown[] }).writes.length);
        expect(sizes).toEqual([500, 500, 201]);
      });
    });

    it('turns triggers back on even when the restore fails', async () => {
      await withFake(async (t, calls) => {
        await expect(snap.restoreSnapshot(t, { documents: [], accounts: [] })).rejects.toThrow(/HTTP 500/);
        expect(calls.at(-1)?.url).toBe('/functions/enableBackgroundTriggers');
      }, 'databases/(default)/documents');
    });

    const clearCalls = (calls: Call[]) => calls.filter((c) => c.method === 'DELETE' && c.url === CLEAR).length;

    it('goes on when the clear answers 499 but the database is empty', async () => {
      await withFake(
        async (t, calls) => {
          await snap.restoreSnapshot(t, { documents: [], accounts: [] });
          expect(clearCalls(calls)).toBe(1);
        },
        undefined,
        ['cancelled-cleared'],
      );
    });

    it('clears again while documents are left, and stops once it is empty', async () => {
      await withFake(
        async (t, calls) => {
          await snap.restoreSnapshot(t, { documents: [], accounts: [] });
          expect(clearCalls(calls)).toBe(2);
        },
        undefined,
        ['cancelled-kept', 'ok'],
      );
    });

    it('fails loudly, triggers back on, when the database never empties', async () => {
      await withFake(
        async (t, calls) => {
          await expect(snap.restoreSnapshot(t, { documents: [], accounts: [] })).rejects.toThrow(
            /still holds 3 documents after clearing/,
          );
          expect(clearCalls(calls)).toBe(3);
          expect(calls.some((c) => c.url.includes('batchWrite'))).toBe(false);
          expect(calls.at(-1)?.url).toBe('/functions/enableBackgroundTriggers');
        },
        undefined,
        ['cancelled-kept'],
      );
    });
  });
});

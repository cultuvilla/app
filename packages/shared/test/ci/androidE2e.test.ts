import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// The native Android E2E job is the ONLY thing in CI that runs the real app on a
// real device. Everything it proves — native boot, the deep-link intent path,
// AsyncStorage auth persistence, the native Firebase SDK, RN modals and the soft
// keyboard, and `Alert.alert` (a NO-OP under react-native-web, so the Playwright
// suite has never once executed it) — is invisible to every other job.
//
// It is also the job that made the E2E auth bypass reachable from a native
// bundle for the first time, which is why half of this file is about hygiene
// rather than coverage. Invariant tests in the spirit of storeRelease.test.ts:
// they fail the build if the arrangement is quietly undone.

const repoRoot = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(repoRoot, p), 'utf8');

const workflow = read('.github/workflows/android-e2e.yml');
const appConfig = read('apps/mobile/app.config.ts');
const apkScript = read('scripts/build-android-e2e-apk.mjs');
const runner = read('scripts/run-android-e2e.mjs');
const rootPkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
const flowsDir = resolve(repoRoot, 'apps/mobile/e2e/native/flows');

describe('android-e2e workflow gating', () => {
  // Release paths only: a Gradle build plus an AVD boot is far too slow for
  // day-to-day develop PRs, and beta is the release candidate — the last point
  // where a native-only regression can be caught before it is a store binary.
  it('gates PRs and pushes on the beta/main release paths only', () => {
    const triggers = workflow.slice(workflow.indexOf('on:'), workflow.indexOf('permissions:'));
    expect(triggers).toMatch(/pull_request:\s*\n\s*branches:\s*\[beta, main\]/);
    expect(triggers).toMatch(/push:\s*\n\s*branches:\s*\[beta, main\]/);
    // Only the comment may mention develop; no `branches:` list may.
    expect(triggers).not.toMatch(/branches:.*develop/);
  });

  // A nightly on develop (the default branch, which is what `schedule:` runs)
  // catches a native regression the morning after it merged, not at promotion.
  it('runs nightly on develop', () => {
    const triggers = workflow.slice(workflow.indexOf('on:'), workflow.indexOf('permissions:'));
    expect(triggers).toMatch(/schedule:\s*\n\s*- cron: '\d+ \d+ \* \* \*'/);
  });

  // A manual dispatch on develop shares the nightly's ref; under a plain
  // per-ref group with cancel-in-progress it would kill the day's only run.
  it('never lets another run cancel the nightly', () => {
    const concurrency = workflow.slice(workflow.indexOf('concurrency:'), workflow.indexOf('jobs:'));
    expect(concurrency).toMatch(/group:.*github\.event_name == 'schedule' && 'nightly'/);
    expect(concurrency).toMatch(/cancel-in-progress:[\s\S]*github\.event_name != 'schedule'/);
  });

  // Without the udev rule the AVD falls back to software emulation and the suite
  // times out instead of failing with a usable message.
  it('enables KVM before booting the AVD', () => {
    expect(workflow).toMatch(/99-kvm4all\.rules/);
    expect(workflow.indexOf('99-kvm4all.rules')).toBeLessThan(
      workflow.indexOf('android-emulator-runner'),
    );
  });

  // `udevadm trigger` queues the event and returns; the mode change lands
  // asynchronously. Sampling `/dev/kvm` once therefore races it, and losing that
  // race kills the job in seconds on a runner that would have been ready a
  // moment later — a 25-minute release lane failing for nothing. The gate must
  // POLL, so that a red here means "this runner truly cannot accelerate an AVD"
  // rather than "we asked too early".
  it('waits for /dev/kvm rather than sampling it once', () => {
    const step = workflow.slice(
      workflow.indexOf('- name: Enable KVM'),
      workflow.indexOf('- name: Setup pnpm'),
    );
    // A retry loop around the writability check, not a bare `test -w`.
    expect(step).toMatch(/for\s+attempt\s+in/);
    expect(step).toMatch(/\[ -w \/dev\/kvm \]/);
    expect(step).toMatch(/sleep 1/);
    // Still a real gate: it must be able to fail.
    expect(step).toMatch(/exit 1/);
  });

  // One emulator boot for the whole suite: the AVD action's `script:` runs the
  // very command a developer runs locally, so a green CI run and a green local
  // run mean the same thing.
  it('pins the Maestro version instead of installing whatever is latest', () => {
    const step = workflow.slice(workflow.indexOf('- name: Install Maestro'));
    const install = step.slice(0, step.indexOf('- name:', 1));
    expect(install).toMatch(/MAESTRO_VERSION:\s*['"]?\d+\.\d+\.\d+/);
  });

  it('fails the install step when the installed Maestro is not the pinned one', () => {
    const step = workflow.slice(workflow.indexOf('- name: Install Maestro'));
    const install = step.slice(0, step.indexOf('- name:', 1));
    expect(install).toMatch(/maestro"? --version/);
    expect(install).toMatch(/!= "\$MAESTRO_VERSION"/);
  });

  it('drives the suite through the same entrypoint a developer uses', () => {
    expect(workflow).toContain('script: pnpm test:e2e:android');
    expect(rootPkg.scripts['test:e2e:android']).toContain('run-tests-with-emulators.mjs');
    expect(rootPkg.scripts['test:e2e:android']).toContain('pnpm seed:e2e');
    expect(rootPkg.scripts['test:e2e:android']).toContain('run-android-e2e.mjs');
  });
});

describe('E2E auth-bypass hygiene', () => {
  // THE load-bearing one. `Platform.OS === 'web'` used to make it structurally
  // impossible for the fixture-login to exist in a store binary. The native
  // driver removed that accident, so app.config.ts is now the deliberate wall —
  // and it holds on EVERY build path, EAS included, because every path evaluates
  // app.config.ts. Deleting it silently re-opens the hole.
  it('refuses to build a beta/prod bundle with the bypass armed', () => {
    expect(appConfig).toMatch(
      /USE_FIREBASE_EMULATOR'\]\s*===\s*'1'\s*&&\s*env\s*!==\s*'dev'[\s\S]{0,400}?throw new Error/,
    );
  });

  // The APK the suite installs must be a `dev` bundle pointed at the emulator.
  // Setting the flag for prebuild but not for the Gradle bundle task (or the
  // reverse) yields an APK that looks correct and talks to real Firebase.
  it('builds the E2E APK as dev + emulator-armed, for both build phases', () => {
    expect(apkScript).toMatch(/APP_ENV:\s*'dev'/);
    expect(apkScript).toMatch(/USE_FIREBASE_EMULATOR:\s*'1'/);
    expect(apkScript).toMatch(/EXPO_PUBLIC_EMULATOR_HOST/);
    // One env object, used for prebuild AND gradle — not two.
    expect(apkScript.match(/const buildEnv = \{/g)).toHaveLength(1);
    expect(apkScript).toMatch(/spawnSync\(cmd, args, \{ cwd, env: buildEnv/);
  });

  // The AVD's alias for the host loopback. `127.0.0.1` inside an emulator is the
  // device itself, so a default-host build finds no emulator, silently falls
  // through to real Firebase, and the fail-closed guard is the only thing left.
  it('bakes the AVD host alias, not loopback', () => {
    expect(apkScript).toMatch(/'10\.0\.2\.2'/);
  });

  // Cleartext is re-enabled by writing into the GENERATED, gitignored android/
  // tree. If it ever moves into app.config.ts or a committed manifest it would
  // ride into `eas build` and ship a store binary that accepts plain HTTP.
  it('confines the cleartext-HTTP opt-in to the generated android tree', () => {
    expect(apkScript).toMatch(/usesCleartextTraffic/);
    expect(appConfig).not.toMatch(/usesCleartextTraffic/);
  });
});

describe('quarantine', () => {
  // A quarantine is a hole in the gate. These tests do not object to the hole —
  // sometimes it is the right call — they object to it being quiet, vague, or
  // permanent-by-neglect, which is how a suite ends up green and worthless.
  const quarantined = [...runner.matchAll(/^\s{4}'([\w.-]+\.yaml)',$/gm)].map((m) => m[1]);

  it('holds out at most one flow', () => {
    expect(quarantined.length).toBeLessThanOrEqual(1);
  });

  it('names only flows that exist', () => {
    const onDisk = readdirSync(flowsDir).filter((f) => f.endsWith('.yaml'));
    for (const name of quarantined) expect(onDisk).toContain(name);
  });

  // The runner also checks this at runtime and exits non-zero; this catches it
  // in the unit suite, where it is 200ms instead of a 40-minute AVD boot.
  it('fails the run rather than skipping a quarantine entry that no longer matches a file', () => {
    expect(runner).toMatch(/quarantine names a flow that does not exist/);
  });

  it('announces every held-out flow instead of shrinking the suite quietly', () => {
    expect(runner).toMatch(/QUARANTINED, NOT RUN/);
    // ...and says so again in the summary line, which is the part a passing run
    // actually prints.
    expect(runner).toMatch(/quarantined and NOT run/);
  });

  it('gives each held-out flow a reason', () => {
    for (const name of quarantined) {
      const at = runner.indexOf(`'${name}',`);
      // The reason string follows the key inside the same Map entry.
      const reason = runner.slice(at + name.length, at + name.length + 600);
      expect(reason.length, `no reason recorded for ${name}`).toBeGreaterThan(80);
    }
  });

  it('still lets --flow run a quarantined flow explicitly', () => {
    expect(runner).toMatch(/flow \? \[flow\]/);
  });
});

describe('gradle build headroom', () => {
  // The first real run of this job died here, and reported the wrong thing.
  // `:expo-updates:kspReleaseKotlin` exhausted the 512m metaspace that Expo's
  // generated gradle.properties grants, the daemon then spun emitting
  // `OutOfMemoryError: Metaspace` from its RMI threads instead of exiting, and
  // the job burned the remaining 45 minutes to its `timeout-minutes` and
  // surfaced as "cancelled" — a starved-runner symptom, not an OOM one.
  it('raises the metaspace ceiling above Expo template default', () => {
    expect(apkScript).toMatch(/org\.gradle\.jvmargs=\$\{JVM_ARGS\}/);
    const jvmArgs = /const JVM_ARGS = '([^']+)'/.exec(apkScript)?.[1] ?? '';
    const metaspace = /MaxMetaspaceSize=(\d+)m/.exec(jvmArgs)?.[1];
    expect(metaspace, `no MaxMetaspaceSize in "${jvmArgs}"`).toBeDefined();
    expect(Number(metaspace)).toBeGreaterThan(512);
  });

  // `expo prebuild --clean` rewrites gradle.properties from the template on
  // every run, so the ceiling has to be re-applied by the script rather than
  // committed once. If the patch ever silently matches nothing, the build is
  // back on 512m with no signal — so it must be a hard failure.
  it('fails loudly if the property it patches is gone', () => {
    expect(apkScript).toMatch(/no org\.gradle\.jvmargs line/);
    expect(apkScript).toMatch(/process\.exit\(1\)/);
  });

  // Without this, a fatal Gradle error costs 45 minutes of runner time and
  // reports as a timeout instead of as itself.
  it('builds with --no-daemon so a fatal build dies instead of hanging', () => {
    expect(apkScript).toMatch(/'--no-daemon'/);
  });
});

describe('native flow suite', () => {
  const flows = readdirSync(flowsDir).filter((f) => f.endsWith('.yaml'));

  it('runs against the dev package, the only one allowed to arm the bypass', () => {
    for (const flow of flows) {
      expect(read(`apps/mobile/e2e/native/flows/${flow}`)).toContain(
        'appId: com.cultuvilla.app.dev',
      );
    }
  });

  // Maestro orders flows by filename and the suite depends on it: 22 unregisters
  // what 20 registered. A flow added without a numeric prefix would sort
  // unpredictably against the rest and break that pairing.
  it('keeps every flow numerically ordered', () => {
    for (const flow of flows) expect(flow).toMatch(/^\d{2}-/);
    expect(flows.length).toBeGreaterThanOrEqual(15);
  });

  // The substrate's whole point (docs/decisions/e2e-testing-substrate.md): the
  // stable assertion is Firestore emulator state, not the view hierarchy. A
  // suite that only ever asserted on screen text would be the fragile half only.
  // `hideKeyboard` is a BACK press on Android. `inputText` on an AVD with a
  // hardware keyboard never raises a soft keyboard, so the BACK walks out of the
  // screen and the next step fails against the launcher — a failure that names
  // the wrong thing entirely. It cost an afternoon once; it does not get to a
  // second time.
  it('never uses hideKeyboard', () => {
    for (const flow of flows) {
      const body = read(`apps/mobile/e2e/native/flows/${flow}`)
        .split('\n')
        .filter((l) => !l.trim().startsWith('#'))
        .join('\n');
      expect(body).not.toMatch(/hideKeyboard/);
    }
  });

  // Maestro 2.4's `retry:` reports the whole flow as FAILED because of a failed
  // attempt, even when a later attempt succeeds and every command reads
  // COMPLETED. `runFlow: when:` is the primitive that actually absorbs a
  // transient — a skipped conditional records nothing.
  it('absorbs transients with runFlow-when, never with retry', () => {
    for (const file of [...flows.map((f) => `flows/${f}`), 'subflows/login.yaml', 'subflows/login-fresh.yaml']) {
      const body = read(`apps/mobile/e2e/native/${file}`)
        .split('\n')
        .filter((l) => !l.trim().startsWith('#'))
        .join('\n');
      expect(body).not.toMatch(/^\s*-\s*retry:/m);
    }
  });

  // expo-dev-client is a plain dependency, so its launcher activity ships even
  // in this release APK and claims a schemeless `cultuvilla://` — the app never
  // starts and the failure points somewhere else entirely.
  it('never opens the bare scheme', () => {
    for (const file of [...flows.map((f) => `flows/${f}`), 'subflows/login.yaml', 'subflows/login-fresh.yaml']) {
      expect(read(`apps/mobile/e2e/native/${file}`)).not.toMatch(
        /openLink:\s*'?cultuvilla:\/\/'?\s*$/m,
      );
    }
  });

  it('asserts on backend state, not only on the screen', () => {
    const withBackendAssertions = flows.filter((f) =>
      read(`apps/mobile/e2e/native/flows/${f}`).includes('runScript'),
    );
    expect(withBackendAssertions.length).toBeGreaterThanOrEqual(4);
  });
});

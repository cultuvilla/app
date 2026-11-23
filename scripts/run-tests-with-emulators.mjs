#!/usr/bin/env node
/**
 * Starts the Firebase emulator suite in the background, waits for ports,
 * runs one or more test commands SEQUENTIALLY under that single emulator,
 * then shuts the emulators down.
 *
 * Usage (single command, backwards-compatible):
 *   node scripts/run-tests-with-emulators.mjs pnpm --filter @cultuvilla/shared test:rules
 *
 * Usage (multi-command):
 *   node scripts/run-tests-with-emulators.mjs \
 *     --label shared    pnpm --filter @cultuvilla/shared test:all \
 *     --label functions pnpm --prefix functions run test:all
 *
 * Env:
 *   TEST_PROJECT_ID     Project id passed to the emulator (default: cultuvilla-test)
 *   ONLY                Comma list passed to `firebase emulators:start --only`
 *                       (default: auth,firestore,functions,storage)
 *   WAIT_TIMEOUT_MS     Per-port wait timeout (default: 180000)
 *   EMULATOR_BIND_HOST  Bind the emulators to this host instead of loopback
 *                       (WSL2 + a Windows-hosted AVD needs 0.0.0.0; see below)
 *   EMULATOR_JAVA_TOOL_OPTIONS
 *                       JVM flags for the emulators alone, passed to them as
 *                       JAVA_TOOL_OPTIONS. Not set as JAVA_TOOL_OPTIONS on the
 *                       whole run, because the commands under test (Maestro)
 *                       are JVMs too. Used by ios-e2e.yml.
 *   EMULATOR_KEEPALIVE  "production" gives the Firestore emulator production's
 *                       gRPC keepalive policy (scripts/lib/emulator-keepalive.mjs)
 *                       and, once it is up, proves it took: a ping probe and the
 *                       policy's line in firestore-debug.log, either failing the
 *                       run. Used by ios-e2e.yml; see
 *                       docs/decisions/ios-e2e-emulator-keepalive.md.
 *   EMULATOR_CANCELLED_LISTEN
 *                       "production" runs the Firestore emulator from a launcher
 *                       jar whose gRPC server lets a write through when a gone
 *                       listener could not be told its target was removed
 *                       (scripts/lib/emulator-grpc.mjs), and, once it is up,
 *                       proves it with scripts/check-emulator-cancelled-listen.mjs.
 *                       A launcher that cannot be built or a failed probe fails
 *                       the run. Used by ios-e2e.yml; same decision record.
 *   VITEST_RETRY_COUNT  Defaulted to "1" in the child env if not set by caller.
 *                       Each vitest config reads it and passes to `test.retry`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  emulatorHostEnv,
  emulatorHubPort,
  emulatorPorts,
  ensureEmulatorSecrets,
  resolveEmulatorConfig,
} from './lib/emulator-config.mjs';
import {
  KEEPALIVE_POLICY_LINE,
  emulatorKeepaliveJavaOptions,
  firestoreEmulatorJar,
  keepaliveApiMismatch,
} from './lib/emulator-keepalive.mjs';
import { probeKeepalive } from './check-emulator-keepalive.mjs';
import { cancelledListenJar } from './lib/emulator-grpc.mjs';
import { probeCancelledListen } from './check-emulator-cancelled-listen.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const TEST_PROJECT_ID = process.env.TEST_PROJECT_ID || 'cultuvilla-test';
const ONLY = process.env.ONLY || 'auth,firestore,functions,storage';
const WAIT_TIMEOUT_MS = Number(process.env.WAIT_TIMEOUT_MS || 180_000);
const WAIT_INTERVAL_MS = 500;

const emulatorConfig = resolveEmulatorConfig(ROOT);
const PORTS_BY_SERVICE = emulatorPorts(emulatorConfig.config);
const portsToWaitFor = ONLY.split(',').map((s) => PORTS_BY_SERVICE[s.trim()]).filter(Boolean);

const rawArgs = process.argv.slice(2);
if (rawArgs.length === 0) {
  console.error('Usage: run-tests-with-emulators.mjs [--label NAME CMD ARGS...]... | <cmd args...>');
  process.exit(2);
}

/** @type {{label: string, cmd: string, args: string[]}[]} */
const commands = [];
if (rawArgs[0] === '--label') {
  for (let i = 0; i < rawArgs.length; ) {
    if (rawArgs[i] !== '--label') {
      console.error(`expected --label at position ${i}, got "${rawArgs[i]}"`);
      process.exit(2);
    }
    const label = rawArgs[i + 1];
    if (!label) { console.error('--label requires a name'); process.exit(2); }
    let j = i + 2;
    while (j < rawArgs.length && rawArgs[j] !== '--label') j++;
    const segment = rawArgs.slice(i + 2, j);
    if (segment.length === 0) { console.error(`--label ${label} requires a command`); process.exit(2); }
    commands.push({ label, cmd: segment[0], args: segment.slice(1) });
    i = j;
  }
} else {
  commands.push({ label: rawArgs[0], cmd: rawArgs[0], args: rawArgs.slice(1) });
}

const java = spawnSync('java', ['-version'], { stdio: 'pipe' });
if (java.status !== 0) {
  console.error('[emulators] java not found on PATH. The Firestore emulator requires JDK 21+.');
  process.exit(1);
}

const fnsLib = path.join(ROOT, 'functions', 'lib', 'index.js');
const fnsSrc = path.join(ROOT, 'functions', 'src', 'index.ts');
function libIsStale() {
  if (!existsSync(fnsLib)) return true;
  if (!existsSync(fnsSrc)) return false;
  return statSync(fnsSrc).mtimeMs > statSync(fnsLib).mtimeMs;
}
if (libIsStale()) {
  console.log('[functions] lib/ missing or stale; building before emulator start');
  const build = spawnSync('pnpm', ['functions:build'], { cwd: ROOT, stdio: 'inherit' });
  if (build.status !== 0) {
    console.error('[functions] build failed (exit ' + build.status + ')');
    process.exit(build.status ?? 1);
  }
}

const emulatorEnv = {
  ...process.env,
  ...emulatorHostEnv(PORTS_BY_SERVICE, emulatorHubPort(emulatorConfig.config)),
  GCLOUD_PROJECT: TEST_PROJECT_ID,
  TEST_PROJECT_ID,
  VITEST_RETRY_COUNT: process.env.VITEST_RETRY_COUNT ?? '1',
};

/**
 * EMULATOR_BIND_HOST — bind the emulators to something other than loopback.
 *
 * Needed by exactly one caller: the native Android suite run from WSL2, where
 * the AVD lives on the Windows host. The device reaches the host loopback at
 * `10.0.2.2`, but that resolves to the WINDOWS loopback, and a WSL process
 * bound to 127.0.0.1 is invisible there — a 0.0.0.0 bind is reachable. On a
 * Linux runner (and in CI) the AVD and the emulators share one loopback, so
 * this stays unset and nothing is exposed beyond the machine.
 *
 * The firebase CLI has no --host flag, so the only lever is the config file:
 * write a patched copy to a temp path and point `--config` at it.
 */
const BIND_HOST = process.env.EMULATOR_BIND_HOST;
let configArgs = emulatorConfig.slotted ? ['--config', emulatorConfig.file] : [];
if (emulatorConfig.slotted) {
  console.log(`[emulators] agent worktree: slot ports from ${emulatorConfig.file} (firestore ${PORTS_BY_SERVICE.firestore})`);
}
if (BIND_HOST) {
  const base = structuredClone(emulatorConfig.config);
  for (const service of Object.keys(base.emulators ?? {})) {
    if (typeof base.emulators[service] === 'object' && base.emulators[service] !== null) {
      base.emulators[service].host = BIND_HOST;
    }
  }
  // Inside ROOT so every relative path in the config (rules, functions source)
  // still resolves against the repo. A FIXED name, not per-pid: the emulators
  // bind fixed ports per checkout, so two runs in one checkout can't coexist anyway — and a
  // pid-suffixed name just accumulates litter every time a run is killed hard
  // enough to skip the exit hook.
  const generated = path.join(ROOT, 'firebase.emulator-bind.json');
  writeFileSync(generated, JSON.stringify(base, null, 2));
  process.on('exit', () => { try { rmSync(generated); } catch { /* best effort */ } });
  configArgs = ['--config', path.basename(generated)];
  console.log(`[emulators] binding to ${BIND_HOST} via ${path.basename(generated)}`);
}

// Placeholder secrets so the Functions emulator never asks Secret Manager —
// see ensureEmulatorSecrets. Only the run that wrote the file removes it.
if (ONLY.split(',').map((s) => s.trim()).includes('functions')) {
  const secretsFile = ensureEmulatorSecrets(path.join(ROOT, 'functions'));
  if (secretsFile) {
    process.on('exit', () => { try { rmSync(secretsFile); } catch { /* best effort */ } });
  }
}

const KEEPALIVE = process.env.EMULATOR_KEEPALIVE;
if (KEEPALIVE && KEEPALIVE !== 'production') {
  console.error(`[emulators] EMULATOR_KEEPALIVE must be "production" or unset, got "${KEEPALIVE}"`);
  process.exit(2);
}
const CANCELLED_LISTEN = process.env.EMULATOR_CANCELLED_LISTEN;
if (CANCELLED_LISTEN && CANCELLED_LISTEN !== 'production') {
  console.error(`[emulators] EMULATOR_CANCELLED_LISTEN must be "production" or unset, got "${CANCELLED_LISTEN}"`);
  process.exit(2);
}
let firestoreJar;
if (CANCELLED_LISTEN) {
  try {
    // firebase-tools downloads the stock jar at start-up, too late for the
    // launcher that points at it; its own setup command fetches it now.
    if (!existsSync(firestoreEmulatorJar())) {
      const setup = spawnSync('firebase', ['setup:emulators:firestore'], { cwd: ROOT, stdio: 'inherit' });
      if (setup.status !== 0) throw new Error('firebase setup:emulators:firestore failed');
    }
    firestoreJar = cancelledListenJar();
  } catch (err) {
    console.error(
      `[emulators] cannot build the Firestore emulator launcher, and the stock jar fails writes after a cancelled listener: ${err.message}\n` +
        'See docs/decisions/ios-e2e-emulator-keepalive.md.',
    );
    process.exit(1);
  }
  console.log(`[emulators] Firestore emulator from ${path.relative(ROOT, firestoreJar)}`);
}
const emulatorJavaOptions = [process.env.EMULATOR_JAVA_TOOL_OPTIONS, KEEPALIVE && emulatorKeepaliveJavaOptions()]
  .filter(Boolean)
  .join(' ');

// The emulator JVM writes its stderr here; the keepalive check reads it, so a
// line left by an earlier run must not count.
const FIRESTORE_LOG = path.join(ROOT, 'firestore-debug.log');
if (KEEPALIVE) rmSync(FIRESTORE_LOG, { force: true });

console.log(`[emulators] starting (project=${TEST_PROJECT_ID}, only=${ONLY})`);
const emu = spawn(
  'firebase',
  ['emulators:start', '--project', TEST_PROJECT_ID, '--only', ONLY, ...configArgs],
  {
    cwd: ROOT,
    env: {
      ...emulatorEnv,
      ...(emulatorJavaOptions ? { JAVA_TOOL_OPTIONS: emulatorJavaOptions } : {}),
      ...(firestoreJar ? { FIRESTORE_EMULATOR_BINARY_PATH: firestoreJar } : {}),
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  },
);

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (!emu.killed) emu.kill('SIGINT');
  setTimeout(() => process.exit(code ?? 0), 1500);
}
process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

emu.once('exit', (code) => {
  if (!shuttingDown) {
    console.error(`[emulators] exited unexpectedly (code=${code})`);
    process.exit(code ?? 1);
  }
});

function waitForPort(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tryOnce = () => {
      if (Date.now() > deadline) {
        reject(new Error(`Port ${port} did not open within ${timeoutMs}ms`));
        return;
      }
      const sock = new net.Socket();
      sock.setTimeout(2000);
      sock.once('connect', () => { sock.destroy(); resolve(); });
      sock.once('error', () => { sock.destroy(); setTimeout(tryOnce, WAIT_INTERVAL_MS); });
      sock.once('timeout', () => { sock.destroy(); setTimeout(tryOnce, WAIT_INTERVAL_MS); });
      sock.connect(port, '127.0.0.1');
    };
    tryOnce();
  });
}

try {
  await Promise.all(portsToWaitFor.map((p) => waitForPort(p, WAIT_TIMEOUT_MS)));
  console.log(`[emulators] ready on ports ${portsToWaitFor.join(', ')}`);
  // Socket-accept does not imply the emulator's HTTP layer is ready.
  // `@firebase/rules-unit-testing`'s `loadFirestoreRules` does a fetch()
  // and intermittently sees ECONNRESET if it races the firestore process
  // before its REST handlers register. A short post-ready settle absorbs
  // it without changing semantics.
  const POST_READY_DELAY_MS = Number(process.env.POST_READY_DELAY_MS ?? 3000);
  if (POST_READY_DELAY_MS > 0) {
    await new Promise((r) => setTimeout(r, POST_READY_DELAY_MS));
  }
} catch (err) {
  console.error('[emulators] failed to start:', err.message);
  shutdown(1);
  process.exit(1);
}

// Three checks, each catching what the others cannot: the jar's own class
// still has the API our copy replaces (a firebase-tools bump), the emulator
// really accepts the pings (the probe), and our policy, not some future jar's
// default, is what accepted them (the log line, printed when the first
// connection loads the class, so read after the probe).
if (KEEPALIVE) {
  const host = `127.0.0.1:${PORTS_BY_SERVICE.firestore}`;
  let failure;
  try {
    failure = keepaliveApiMismatch();
  } catch (err) {
    failure = err.message;
  }
  if (!failure) {
    const probe = await probeKeepalive({ host }).catch((err) => ({ ok: false, reason: err.message }));
    const log = existsSync(FIRESTORE_LOG) ? readFileSync(FIRESTORE_LOG, 'utf8') : '';
    if (!probe.ok) failure = probe.reason;
    else if (!log.includes(KEEPALIVE_POLICY_LINE)) failure = `no "${KEEPALIVE_POLICY_LINE}" line in firestore-debug.log`;
  }
  if (failure) {
    console.error(
      `[emulators] the Firestore emulator is not on production's keepalive policy: ${failure}\n` +
        'See docs/decisions/ios-e2e-emulator-keepalive.md.',
    );
    shutdown(1);
    await new Promise(() => {});
  }
  console.log(`[emulators] Firestore emulator on production's keepalive policy (${host} acked every ping)`);
}

if (CANCELLED_LISTEN) {
  const host = `127.0.0.1:${PORTS_BY_SERVICE.firestore}`;
  const probe = await probeCancelledListen({
    host,
    project: TEST_PROJECT_ID,
    hub: emulatorEnv.FIREBASE_EMULATOR_HUB,
  }).catch((err) => ({ ok: false, reason: err.message }));
  if (!probe.ok) {
    console.error(
      `[emulators] the Firestore emulator still fails a write after a cancelled listener: ${probe.reason}\n` +
        'See docs/decisions/ios-e2e-emulator-keepalive.md.',
    );
    shutdown(1);
    await new Promise(() => {});
  }
  console.log(`[emulators] Firestore emulator lets a write through after a cancelled listener (${host})`);
}

let firstFailureCode = 0;
for (const { label, cmd, args } of commands) {
  console.log(`\n[tests] ${label}: ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { cwd: ROOT, env: emulatorEnv, stdio: 'inherit' });
  let code;
  if (result.error) {
    console.error(`[tests] ${label}: failed to spawn: ${result.error.message}`);
    code = 1;
  } else {
    code = result.status ?? (result.signal ? 1 : 0);
  }
  if (code !== 0 && firstFailureCode === 0) firstFailureCode = code;
}

shutdown(firstFailureCode);

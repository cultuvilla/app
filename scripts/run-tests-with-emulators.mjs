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
 *   VITEST_RETRY_COUNT  Defaulted to "1" in the child env if not set by caller.
 *                       Each vitest config reads it and passes to `test.retry`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emulatorHostEnv, emulatorPorts, resolveEmulatorConfig } from './lib/emulator-config.mjs';

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
  ...emulatorHostEnv(PORTS_BY_SERVICE),
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

console.log(`[emulators] starting (project=${TEST_PROJECT_ID}, only=${ONLY})`);
const emu = spawn(
  'firebase',
  ['emulators:start', '--project', TEST_PROJECT_ID, '--only', ONLY, ...configArgs],
  { cwd: ROOT, env: emulatorEnv, stdio: ['ignore', 'inherit', 'inherit'] },
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

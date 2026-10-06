/**
 * Which Firebase config the emulator harness starts from, and the ports in it.
 *
 * In an agent worktree, `scripts/agent-env.sh` writes `firebase.agent.json` with
 * every emulator moved into that worktree's slot. Starting from `firebase.json`
 * there would bind the default ports and evict — or quietly talk to — another
 * worktree's emulators, which surfaces as "the tests failed", never as "port in
 * use". The file, not an environment variable, carries the slot: agent shells do
 * not keep exported variables from one command to the next.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const AGENT_CONFIG = 'firebase.agent.json';
export const DEFAULT_CONFIG = 'firebase.json';

const SERVICES = ['auth', 'firestore', 'functions', 'storage'];

/** @returns {{ file: string, slotted: boolean, config: any }} */
export function resolveEmulatorConfig(root) {
  const slotted = existsSync(path.join(root, AGENT_CONFIG));
  const file = slotted ? AGENT_CONFIG : DEFAULT_CONFIG;
  return { file, slotted, config: JSON.parse(readFileSync(path.join(root, file), 'utf8')) };
}

/** Port per emulated service, read from the config; a missing one is an error, not a default. */
export function emulatorPorts(config) {
  return Object.fromEntries(
    SERVICES.map((service) => {
      const port = config?.emulators?.[service]?.port;
      if (!Number.isInteger(port)) {
        throw new Error(`[emulators] no port for "${service}" in the emulator config`);
      }
      return [service, port];
    })
  );
}

/** The env the test processes need to dial these emulators. */
export function emulatorHostEnv(ports) {
  return {
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${ports.firestore}`,
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${ports.auth}`,
    FIREBASE_STORAGE_EMULATOR_HOST: `127.0.0.1:${ports.storage}`,
    FIREBASE_FUNCTIONS_EMULATOR_HOST: `127.0.0.1:${ports.functions}`,
  };
}

/**
 * Placeholder values for every secret the functions declare, for the Functions
 * emulator only.
 *
 * Without them the emulator asks Google Cloud Secret Manager for each secret a
 * function declares, on every invocation, and with no `firebase login` (CI, any
 * fresh machine) every attempt logs "Failed to authenticate, have you run
 * firebase login?" at error severity. A `.secret.local` beside the functions
 * source short-circuits the lookup. The emulator treats an empty value as
 * missing, hence a non-empty placeholder; nothing in the emulator may reach a
 * real service with it (event mail is skipped there, APNs rejects the shape).
 */
export const SECRET_LOCAL = '.secret.local';
export const EMULATOR_SECRET_PLACEHOLDER = 'emulator-placeholder';

/** Names passed to `defineSecret('…')` anywhere under the functions source. */
export function declaredSecrets(functionsSrcDir) {
  const names = new Set();
  for (const entry of readdirSync(functionsSrcDir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const file = path.join(entry.parentPath, entry.name);
    if (file.includes(`${path.sep}__tests__${path.sep}`)) continue;
    for (const m of readFileSync(file, 'utf8').matchAll(/defineSecret\(\s*['"]([A-Z0-9_]+)['"]/g)) {
      names.add(m[1]);
    }
  }
  return [...names].sort();
}

/**
 * Writes `<functionsDir>/.secret.local` with a placeholder per declared secret,
 * unless one already exists — a developer's own overrides always win.
 * @returns {string | null} the path written, for the caller to remove; null if untouched.
 */
export function ensureEmulatorSecrets(functionsDir) {
  const file = path.join(functionsDir, SECRET_LOCAL);
  if (existsSync(file)) return null;
  const names = declaredSecrets(path.join(functionsDir, 'src'));
  const body = [
    '# Written by scripts/run-tests-with-emulators.mjs for the Functions emulator;',
    '# removed when the run ends. Placeholders only: see scripts/lib/emulator-config.mjs.',
    ...names.map((name) => `${name}=${EMULATOR_SECRET_PLACEHOLDER}`),
    '',
  ].join('\n');
  writeFileSync(file, body);
  return file;
}

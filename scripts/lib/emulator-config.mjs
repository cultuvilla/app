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
import { existsSync, readFileSync } from 'node:fs';
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

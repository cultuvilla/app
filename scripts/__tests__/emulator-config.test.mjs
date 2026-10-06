// The failure this guards: two agent worktrees running emulator suites at once.
// If the harness ignored the worktree's slot config, both would bind 8080/9099/…
// and one would evict or talk to the other's emulators — reported as failing
// tests, never as a port clash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { emulatorHostEnv, emulatorPorts, resolveEmulatorConfig } from '../lib/emulator-config.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function checkout(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emulator-config-'));
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, name), JSON.stringify(body));
  }
  return root;
}

const config = (base) => ({
  emulators: {
    auth: { port: base + 99 },
    firestore: { port: base + 80 },
    functions: { port: base + 1 },
    storage: { port: base + 19 },
  },
});

test('the main checkout uses firebase.json and its real ports', () => {
  const { file, slotted, config: cfg } = resolveEmulatorConfig(REPO_ROOT);
  // The worktree running this test may itself hold a slot config.
  if (slotted) return;
  assert.equal(file, 'firebase.json');
  assert.deepEqual(emulatorPorts(cfg), { auth: 9099, firestore: 8080, functions: 5001, storage: 9199 });
});

test('a worktree with a slot config uses it instead of firebase.json', () => {
  const root = checkout({ 'firebase.json': config(8000), 'firebase.agent.json': config(20100) });
  try {
    const resolved = resolveEmulatorConfig(root);
    assert.equal(resolved.file, 'firebase.agent.json');
    assert.equal(resolved.slotted, true);
    assert.deepEqual(emulatorPorts(resolved.config), { auth: 20199, firestore: 20180, functions: 20101, storage: 20119 });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the test processes are pointed at the same ports the emulators bind', () => {
  assert.deepEqual(emulatorHostEnv({ auth: 20199, firestore: 20180, functions: 20101, storage: 20119 }), {
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:20180',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:20199',
    FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:20119',
    FIREBASE_FUNCTIONS_EMULATOR_HOST: '127.0.0.1:20101',
  });
});

test('a config missing an emulator port is an error, not a silent default', () => {
  // A default here would be 8080 — exactly the shared port the slot exists to avoid.
  assert.throws(() => emulatorPorts({ emulators: { auth: { port: 1 } } }), /no port for "firestore"/);
});

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

import {
  declaredSecrets,
  emulatorHostEnv,
  emulatorPorts,
  ensureEmulatorSecrets,
  resolveEmulatorConfig,
} from '../lib/emulator-config.mjs';

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

// Without a .secret.local the Functions emulator asks Secret Manager for every
// declared secret on each invocation and logs "Failed to authenticate, have you
// run firebase login?" wherever there is no login — every CI run.
test('every secret the functions declare gets an emulator placeholder', () => {
  const declared = declaredSecrets(path.join(REPO_ROOT, 'functions', 'src'));
  assert.ok(declared.includes('RESEND_API_KEY'));
  assert.ok(declared.includes('APNS_AUTH_KEY'));

  const fnsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emulator-secrets-'));
  try {
    fs.mkdirSync(path.join(fnsDir, 'src', 'auth'), { recursive: true });
    fs.mkdirSync(path.join(fnsDir, 'src', '__tests__'), { recursive: true });
    fs.writeFileSync(path.join(fnsDir, 'src', 'auth', 'secret.ts'), "export const A = defineSecret('A_KEY');\n");
    fs.writeFileSync(path.join(fnsDir, 'src', '__tests__', 'x.ts'), "defineSecret('TEST_ONLY');\n");

    const written = ensureEmulatorSecrets(fnsDir);
    assert.equal(written, path.join(fnsDir, '.secret.local'));
    const body = fs.readFileSync(written, 'utf8');
    // Non-empty: the emulator treats an empty value as missing and asks anyway.
    assert.match(body, /^A_KEY=\S+$/m);
    assert.doesNotMatch(body, /TEST_ONLY/);
  } finally {
    fs.rmSync(fnsDir, { recursive: true, force: true });
  }
});

test("a developer's own .secret.local is never overwritten", () => {
  const fnsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emulator-secrets-'));
  try {
    fs.mkdirSync(path.join(fnsDir, 'src'));
    fs.writeFileSync(path.join(fnsDir, '.secret.local'), 'RESEND_API_KEY=re_real\n');
    assert.equal(ensureEmulatorSecrets(fnsDir), null);
    assert.equal(fs.readFileSync(path.join(fnsDir, '.secret.local'), 'utf8'), 'RESEND_API_KEY=re_real\n');
  } finally {
    fs.rmSync(fnsDir, { recursive: true, force: true });
  }
});

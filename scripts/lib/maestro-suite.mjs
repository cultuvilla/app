/**
 * The platform-neutral half of the native E2E runners
 * (scripts/run-android-e2e.mjs, scripts/run-ios-e2e.mjs): one Maestro suite,
 * run flow by flow, with an announced quarantine.
 *
 * Each runner owns its device — proving one is attached, installing the build —
 * and its quarantine, since a flow can fail on one platform's transport and
 * pass on the other's. Everything after that is identical, and lives here so the
 * two gates cannot drift into meaning different things by "green".
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SUITE_DIR = path.join(ROOT, 'apps', 'mobile', 'e2e', 'native');
const FLOWS_DIR = path.join(SUITE_DIR, 'flows');

export const MAESTRO = process.env.MAESTRO_BIN || 'maestro';

// Maestro installs a driver on the device and connects to it. Its default
// startup budget is tight enough that a cold or loaded device — a CI runner's
// software-rendered AVD, a first-boot Simulator, or a Windows-hosted AVD reached
// across a WSL2 adb bridge — loses the race and dies with an opaque driver
// timeout that reads like a broken flow. Give it room unless the caller has
// already said otherwise.
export const MAESTRO_ENV = {
  ...process.env,
  MAESTRO_DRIVER_STARTUP_TIMEOUT: process.env.MAESTRO_DRIVER_STARTUP_TIMEOUT || '180000',
};

// Backend state a flow creates and must undo, and that nothing else heals: the
// seed never writes these docs, so re-seeding leaves them. A flow undoes its
// own in `onFlowComplete`, but that never runs when the Maestro process dies.
// A leftover update wall (95) would block the whole app; a leftover block (41)
// would hide the admin's comments from the attendee. Platform-neutral: these
// live in the emulator, not on the device.
const LEFTOVER_DOCS = ['config/appVersion', 'users/e2e-user/blockedUsers/e2e-admin'];

async function deleteLeftoverDocs(label) {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) return;
  const project = process.env.E2E_FIREBASE_PROJECT || process.env.GCLOUD_PROJECT || 'cultuvilla-test';
  for (const doc of LEFTOVER_DOCS) {
    const url = `http://${host}/v1/projects/${project}/databases/(default)/documents/${doc}`;
    const res = await fetch(url, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
    if (!res.ok) {
      console.error(`[${label}] could not reset ${doc}: HTTP ${res.status}; stopping the run.`);
      process.exit(1);
    }
  }
}

export function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

export function run(label, cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
  if (res.error) {
    console.error(`[${label}] failed to spawn ${cmd}: ${res.error.message}`);
    process.exit(1);
  }
  return res.status ?? 1;
}

/**
 * Run the flows IN FILENAME ORDER, one `maestro test` per flow, and exit.
 *
 * Maestro's workspace mode does not guarantee the order it discovers flows in,
 * and this suite depends on it: 22 unregisters what 20 registered. A reshuffle
 * would turn a healthy suite red for reasons that have nothing to do with the
 * app. Driving the order here also gives one JUnit report per flow, so a CI
 * failure names the flow instead of the workspace.
 *
 * A failing flow does NOT stop the run: the rest of the suite is still worth
 * knowing about, and a cascade (22 failing because 20 did) is itself the
 * diagnosis.
 *
 * `quarantined` maps a flow file to the reason it is held OUT of the gate. A
 * quarantine is a coverage cut, so it is announced on every run and named in the
 * summary: a suite that silently shrank reads as "everything passed", which is
 * worse than a red lane. A selection still runs a quarantined flow explicitly,
 * so chasing one needs no edit.
 *
 * `flow` optionally narrows the run to some flows — see `selectFlows`.
 * `beforeEachFlow` runs before every flow: platform-specific state that
 * Maestro's `clearState` does not reach. Leftover backend docs are reset for
 * every platform here.
 */
export async function runMaestroSuite({
  label,
  device,
  quarantined,
  flow,
  reportDir,
  env = MAESTRO_ENV,
  beforeEachFlow = () => {},
}) {
  mkdirSync(reportDir, { recursive: true });
  const discovered = readdirSync(FLOWS_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .sort();

  // An entry that no longer matches a file is a stale quarantine — fail rather
  // than let it rot into a line nobody can act on.
  for (const name of quarantined.keys()) {
    if (!discovered.includes(name)) {
      console.error(`[${label}] quarantine names a flow that does not exist: ${name}`);
      process.exit(1);
    }
  }

  const selection = flow ? selectFlows(discovered, flow) : null;
  if (selection?.unknown.length) {
    console.error(`[${label}] no flow matches: ${selection.unknown.join(', ')}`);
    console.error(`[${label}] available: ${discovered.join(', ')}`);
    process.exit(1);
  }
  const skipped = selection ? [] : discovered.filter((f) => quarantined.has(f));
  const flows = selection ? selection.flows : discovered.filter((f) => !quarantined.has(f));
  if (selection) console.log(`[${label}] running a selection: ${flows.join(', ')}`);

  for (const name of skipped) {
    console.warn(`\n[${label}] !! QUARANTINED, NOT RUN: ${name}`);
    console.warn(`[${label}]    ${quarantined.get(name)}`);
  }

  const failed = [];
  for (const name of flows) {
    console.log(`\n[${label}] ─── ${name} ───`);
    await beforeEachFlow(name);
    await deleteLeftoverDocs(label);
    const status = run(
      label,
      MAESTRO,
      [
        '--device',
        device,
        'test',
        path.join(FLOWS_DIR, name),
        '--format',
        'junit',
        '--output',
        path.join(reportDir, `${name.replace(/\.yaml$/, '')}.xml`),
      ],
      { env },
    );
    if (status !== 0) failed.push(name);
  }

  const quarantineNote = skipped.length
    ? ` (${skipped.length} quarantined and NOT run: ${skipped.join(', ')})`
    : '';

  if (failed.length > 0) {
    console.error(`\n[${label}] ${failed.length}/${flows.length} flow(s) failed:`);
    for (const name of failed) console.error(`  - ${name}`);
    if (quarantineNote) console.error(`[${label}]${quarantineNote}`);
    process.exit(1);
  }
  console.log(`\n[${label}] all ${flows.length} flow(s) passed${quarantineNote}`);
  process.exit(0);
}

/**
 * Resolve a comma-separated selection (`20,22` / `20-register-to-event` /
 * `20-register-to-event.yaml`) against the discovered flow files. Returned in
 * FILENAME order whatever order it was typed in, since the suite's pairs depend
 * on it (22 unregisters what 20 registered — select both to run 22). A token
 * that matches nothing is reported rather than dropped: a typo that quietly ran
 * zero flows would read as a pass.
 */
export function selectFlows(discovered, selection) {
  const tokens = selection
    .split(',')
    .map((t) => t.trim().replace(/\.yaml$/, ''))
    .filter(Boolean);
  const picked = new Set();
  const unknown = [];
  for (const token of tokens) {
    const matches = discovered.filter(
      (f) => f === `${token}.yaml` || (/^\d+$/.test(token) && f.startsWith(`${token}-`)),
    );
    if (matches.length === 0) unknown.push(token);
    for (const m of matches) picked.add(m);
  }
  return { flows: discovered.filter((f) => picked.has(f)), unknown };
}

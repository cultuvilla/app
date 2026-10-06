#!/usr/bin/env node
/**
 * seed-app-version-config.mjs
 *
 * Write the `config/appVersion` doc (the force-update gate) in one environment.
 * Clients read it on launch and block/nudge via `resolveVersionGate`.
 *
 * USAGE
 *   node scripts/seed-app-version-config.mjs [--env=dev|beta|prod] \
 *        [--latest=0.18.0] [--min=0.0.0] [--dry-run] [--confirm]
 *
 *   --env      target environment (default: dev).
 *   --latest   latest version, for BOTH platforms. Omit it to PRESERVE what is
 *              stored: in prod the announce poller (scripts/release-announce.mjs)
 *              writes each platform's `latest` the moment its store serves the
 *              release, so a value given here is an out-of-band correction.
 *   --min      minSupported. Omit to PRESERVE whatever is stored (see
 *              lib/app-version-config.mjs); only an explicit value moves the wall.
 *   --dry-run  print the diff and write nothing.
 *   --confirm  REQUIRED for beta/prod.
 *
 * No credentials of your own? Use Actions → "Set App Version"
 * (.github/workflows/set-app-version.yml), which authenticates via WIF.
 * Otherwise credentials resolve through initAdminForEnv; for beta/prod unset
 * GOOGLE_APPLICATION_CREDENTIALS so a dev key can't hijack the target project.
 */

import admin from 'firebase-admin';
import { initAdminForEnv, ENVS } from './lib/env-credentials.mjs';
import { currentAppVersion } from './lib/app-version.mjs';
import { resolveAppVersionConfig } from './lib/app-version-config.mjs';

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    out[key] = value ?? true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const envArg = typeof args.env === 'string' ? args.env : 'dev';
const dryRun = args['dry-run'] === true;

if (!ENVS[envArg]) {
  console.error(`Unknown --env "${envArg}". Use one of: ${Object.keys(ENVS).join(', ')}.`);
  process.exit(1);
}

// Beta/prod are shared environments — require explicit acknowledgement, unless
// this is a read-only preview.
if ((envArg === 'beta' || envArg === 'prod') && args.confirm !== true && !dryRun) {
  console.error(
    `Refusing to write ${envArg} (${ENVS[envArg].project}) without --confirm. ` +
      `Beta/prod are off-limits without explicit intent (see AGENTS.md).`,
  );
  process.exit(1);
}

const { env, projectId } = initAdminForEnv(envArg);
const db = admin.firestore();
const ref = db.collection('config').doc('appVersion');

function report(stored, resolved, appVersion) {
  const { payload, minSource, latestSources, unreleased } = resolved;
  console.log(`config/appVersion in ${env} (${projectId})`);
  console.log(`  stored: ${stored ? JSON.stringify(stored) : '(absent)'}`);
  console.log(`  app.config.ts    ${appVersion} (deployed here; announced only once a store serves it)`);
  for (const platform of ['ios', 'android']) {
    console.log(`  ${platform.padEnd(7)} latest -> ${payload[platform].latest} (${latestSources[platform]})`);
  }
  console.log(`  minSupported  -> ${payload.ios.minSupported} (${minSource})`);
  if (unreleased.length) {
    console.log(
      `\n  NOTE: ${appVersion} is deployed but not announced on ${unreleased.join('/')} yet.` +
        `\n  The announce poller moves it once that store serves it (docs/decisions/announce-when-live-poller.md).`,
    );
  }
}

async function main() {
  const appVersion = currentAppVersion();
  const request = {
    latest: typeof args.latest === 'string' ? args.latest : undefined,
    minSupported: typeof args.min === 'string' ? args.min : undefined,
    appVersion,
  };

  if (dryRun) {
    const snap = await ref.get();
    const stored = snap.exists ? snap.data() : null;
    report(stored, resolveAppVersionConfig({ ...request, stored }), appVersion);
    console.log('\nDRY RUN — nothing written. Re-run without --dry-run to apply.');
    return;
  }

  // A transaction, because the announce poller writes this doc too: a plain
  // read-then-set here could put back the `latest` it moved a moment earlier.
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = snap.exists ? snap.data() : null;
    const resolved = resolveAppVersionConfig({ ...request, stored });
    report(stored, resolved, appVersion);
    tx.set(ref, resolved.payload, { merge: false });
  });
  console.log(`\nWrote config/appVersion: ${JSON.stringify((await ref.get()).data())}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

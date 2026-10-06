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
 *   --latest   latest version, for BOTH platforms. Omit it: each platform then
 *              gets the version its own store actually serves, declared in
 *              `packages/shared/src/config/appStores.ts` (`APP_STORE_VERSIONS`). It is
 *              deliberately NOT the app.config.ts version — that is what a
 *              promotion deploys to the backend and the web, while a store
 *              binary moves only by an explicit `mobile-release` dispatch, so
 *              announcing it promises a download that does not exist yet.
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
import { resolveAppVersionConfig, PUBLISHED_VERSION } from './lib/app-version-config.mjs';

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

async function main() {
  const snap = await ref.get();
  const stored = snap.exists ? snap.data() : null;

  const appVersion = currentAppVersion();
  const { payload, minSource, latestSource, unreleased } = resolveAppVersionConfig({
    latest: typeof args.latest === 'string' ? args.latest : undefined,
    minSupported: typeof args.min === 'string' ? args.min : undefined,
    stored,
    appVersion,
  });

  console.log(`config/appVersion in ${env} (${projectId})`);
  console.log(`  stored: ${stored ? JSON.stringify(stored) : '(absent)'}`);
  console.log(`  app.config.ts    ${appVersion} (deployed here; not announced)`);
  for (const platform of ['ios', 'android']) {
    const declared = PUBLISHED_VERSION[platform] || '(nothing published)';
    console.log(
      `  ${platform.padEnd(7)} latest -> ${payload[platform].latest} (${latestSource}; store serves ${declared})`,
    );
  }
  console.log(`  minSupported  -> ${payload.ios.minSupported} (${minSource})`);
  if (unreleased.length) {
    console.log(
      `\n  NOTE: ${appVersion} is deployed but not in the ${unreleased.join('/')} store yet, so it is not` +
        `\n  announced. Ship it with \`mobile-release\`, then update APP_STORE_VERSIONS and re-run.`,
    );
  }

  if (dryRun) {
    console.log('\nDRY RUN — nothing written. Re-run without --dry-run to apply.');
    return;
  }

  await ref.set(payload, { merge: false });
  console.log(`\nWrote config/appVersion: ${JSON.stringify((await ref.get()).data())}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

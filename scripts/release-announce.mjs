#!/usr/bin/env node
/**
 * Announce a production release only once the stores serve it — and hold a
 * breaking backend until then. See docs/decisions/announce-when-live-poller.md.
 *
 *   plan    --env=prod                 deploy-firebase.yml, before rules/functions:
 *                                      hold the backend? (read-only; emits
 *                                      hold_backend / in_flight)
 *   record  --env=prod --hold=<bool>   deploy-firebase.yml, after hosting: write
 *                                      _admin/announce/pending/prod
 *   record-android --env=prod --version=X.Y.Z --version-code=N
 *                                      production-release.yml, after the Play build
 *   poll    --env=prod [--dry-run]     announce-when-live.yml, every 30 min:
 *                                      ask the stores, move `latest`, raise the
 *                                      wall, emit deploy_sha for a held backend
 *   finish  --env=prod --sha=<sha>     deploy-firebase.yml, at the end of a
 *                                      SUCCESSFUL held-backend deploy: finish the
 *                                      release (never on mere dispatch)
 *
 * Writes go to the env's Firestore through initAdminForEnv (WIF in CI). Only
 * prod has a pending release; every command is a no-op elsewhere. The logic
 * lives in lib/announce-cli.mjs; this file only binds it to the real world.
 */

import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import { initAdminForEnv } from './lib/env-credentials.mjs';
import { currentAppVersion } from './lib/app-version.mjs';
import { breakingSinceLastRelease } from './lib/breaking-rollup.mjs';
import { playTargetFrom } from './lib/announce.mjs';
import { runCli } from './lib/announce-cli.mjs';
import { makePlayClient } from './lib/play.mjs';
import { makeAscRequest } from './lib/appstore.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const output = (key, value) => {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value ?? ''}\n`);
};

function makeCtx(env) {
  initAdminForEnv(env);
  return {
    db: admin.firestore(),
    output,
    summary: (line) => {
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
    },
    log: (m) => console.log(`[announce] ${m}`),
    warn: (m) => console.log(`::warning::[announce] ${m}`),
    appVersion: () => currentAppVersion(),
    rollup: (version) => breakingSinceLastRelease({ version, cwd: ROOT }),
    headSha: () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    playTarget: () => playTargetFrom(JSON.parse(readFileSync(path.join(ROOT, 'apps/mobile/eas.json'), 'utf8'))),
    makePlay: () => makePlayClient(),
    makeAsc: () => makeAscRequest(),
    ascAppId: process.env.ASC_APP_ID,
    commitMessage: process.env.COMMIT_MESSAGE ?? '',
  };
}

runCli(process.argv.slice(2), { makeCtx, output })
  .then(({ skipped, env }) => {
    if (skipped) console.log(`[announce] --env=${env || '(none)'}: only prod announces when live; nothing to do.`);
  })
  .catch((err) => {
    console.error(`::error::[announce] ${err.message}`);
    process.exit(1);
  });

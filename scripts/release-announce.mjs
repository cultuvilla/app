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
 * prod has a pending release; every command is a no-op elsewhere.
 */

import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import { initAdminForEnv } from './lib/env-credentials.mjs';
import { currentAppVersion } from './lib/app-version.mjs';
import { breakingSinceLastRelease } from './lib/breaking-rollup.mjs';
import {
  ageInDays,
  decideBackendHold,
  DEPLOY_RETRY_HOURS,
  parseHoldFlag,
  pendingDocPath,
  playTargetFrom,
  STALE_DAYS,
} from './lib/announce.mjs';
import {
  applyTick,
  checkStores,
  CONFIG_DOC,
  finishHeldDeploy,
  recordAndroidBuild,
  recordRelease,
} from './lib/announce-store.mjs';
import { makePlayClient } from './lib/play.mjs';
import { makeAscRequest } from './lib/appstore.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = { _: [] };
  for (const arg of argv) {
    if (!arg.startsWith('--')) out._.push(arg);
    else {
      const [key, ...rest] = arg.slice(2).split('=');
      out[key] = rest.length ? rest.join('=') : true;
    }
  }
  return out;
}

const output = (key, value) => {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value ?? ''}\n`);
};
const summary = (line) => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
};
const log = (m) => console.log(`[announce] ${m}`);
const warn = (m) => console.log(`::warning::[announce] ${m}`);

function playTarget() {
  return playTargetFrom(JSON.parse(readFileSync(path.join(ROOT, 'apps/mobile/eas.json'), 'utf8')));
}

async function readDoc(db, p) {
  const snap = await db.doc(p).get();
  return snap.exists ? snap.data() : null;
}

async function decide(db, env) {
  const version = currentAppVersion();
  const rollup = breakingSinceLastRelease({ version, cwd: ROOT });
  const decision = decideBackendHold({
    env,
    version,
    config: await readDoc(db, CONFIG_DOC),
    rollup,
    pending: await readDoc(db, pendingDocPath(env)),
    commitMessage: process.env.COMMIT_MESSAGE ?? '',
  });
  return { version, rollup, decision };
}

async function cmdPlan(db, env) {
  const { version, rollup, decision } = await decide(db, env);
  log(`v${version}: ${rollup.base ?? '(no previous tag)'}..HEAD, ${rollup.commits ?? 0} commits, breaking=${decision.breaking}`);
  for (const r of decision.reasons) log(`  Breaking-Client: ${r}`);
  log(`backend: ${decision.hold ? 'HELD' : 'deploys now'} — ${decision.why}`);
  if (decision.breaking && !decision.hold && !decision.inFlight) {
    warn(`breaking changes deploy with nothing in flight: no wall will be raised for them. Set minSupported by hand ("Set App Version") if installed clients break.`);
  }
  output('hold_backend', decision.hold ? 'true' : 'false');
  output('in_flight', decision.inFlight ? 'true' : 'false');
  summary(`- Backend (functions + rules): **${decision.hold ? 'held until both stores serve ' + version : 'deployed'}** — ${decision.why}`);
}

async function cmdRecord(db, env, args) {
  const { version, decision } = await decide(db, env);
  // The plan step decided what this deploy did; record that, not a re-decision.
  const hold = parseHoldFlag(args.hold);
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const result = await recordRelease(db, { env, version, sha, decision: { ...decision, hold } });
  if (result.outcome === 'not-in-flight') log(`v${version} is already what both stores serve — nothing to announce.`);
  else log(`${result.outcome} ${pendingDocPath(env)}: ${JSON.stringify(result.doc)}`);
}

async function cmdRecordAndroid(db, env, args) {
  if (!args.version || !args['version-code']) throw new Error('record-android needs --version and --version-code');
  const result = await recordAndroidBuild(db, { env, version: args.version, versionCode: args['version-code'] });
  if (result.outcome === 'recorded') log(`v${args.version} Android versionCode ${args['version-code']} recorded.`);
  else warn(`versionCode not recorded (${result.outcome}); the poller falls back to matching the Play release by name.`);
}

async function cmdPoll(db, env, args) {
  const pending = await readDoc(db, pendingDocPath(env));
  if (!pending) {
    log('nothing pending.');
    return;
  }
  const age = ageInDays(pending);
  log(`pending v${pending.version} (recorded ${age.toFixed(1)} days ago, breaking=${pending.breaking}, holdBackend=${pending.holdBackend})`);
  if (age > STALE_DAYS) {
    warn(`v${pending.version} is still not live in both stores after ${Math.floor(age)} days — check App Review and the Play Console.${pending.holdBackend ? ' Its backend is held until then.' : ''}`);
  }

  const { packageName, track } = playTarget();
  const { live, detail } = await checkStores({
    pending,
    makePlay: () => makePlayClient(),
    makeAsc: () => makeAscRequest(),
    ascAppId: process.env.ASC_APP_ID,
    packageName,
    track,
    warn,
  });
  log(`android: ${detail.android} | ios: ${detail.ios}`);

  const result = await applyTick(db, {
    env,
    version: pending.version,
    live,
    iosBuildNumber: detail.iosBuildNumber,
    androidCompletedSeenAt: detail.androidCompletedSeenAt,
    dryRun: args['dry-run'] === true,
  });
  if (result.outcome === 'gone' || result.outcome === 'superseded') {
    log(`pending release changed during the check (${result.outcome}) — wrote nothing; the next tick checks the new one.`);
    return;
  }
  const { plan, payload } = result;
  if (payload) log(`${result.outcome === 'dry-run' ? 'would write' : 'wrote'} ${CONFIG_DOC}: ${JSON.stringify(payload)}`);
  if (plan.newlyLive.length) summary(`- Announced v${pending.version} on **${plan.newlyLive.join(' + ')}**`);
  if (plan.config?.minSupported) summary(`- Wall: minSupported → **${plan.config.minSupported}** (${(pending.reasons ?? []).join('; ')})`);
  if (plan.waitingOn.length) log(`still waiting on: ${plan.waitingOn.join(', ')}`);
  if (plan.awaitingDeploy) log(`held backend dispatched at ${pending.deployRequestedAt}; waiting for that deploy to succeed.`);
  if (plan.deploySha && result.outcome !== 'dry-run') {
    if (plan.retry) {
      warn(`the held backend dispatched at ${pending.deployRequestedAt} has not deployed within ${DEPLOY_RETRY_HOURS}h — check that Deploy prod run; dispatching again.`);
    } else log(`both stores live — dispatching the held backend at ${plan.deploySha}.`);
    output('deploy_sha', plan.deploySha);
  }
  if (plan.clear) log(`v${pending.version} is live everywhere — pending cleared.`);
}

async function cmdFinish(db, env, args) {
  if (!args.sha) throw new Error('finish needs --sha');
  const result = await finishHeldDeploy(db, { env, sha: args.sha });
  if (result.outcome === 'done') log('held backend deployed — release finished, pending cleared.');
  else if (result.outcome === 'released-early') log('held backend deployed before both stores serve the release — the announce still waits for them.');
  else log(`no held release at ${args.sha} (${result.outcome}) — nothing to finish.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  const env = typeof args.env === 'string' ? args.env : '';
  if (env !== 'prod') {
    log(`--env=${env || '(none)'}: only prod announces when live; nothing to do.`);
    output('hold_backend', 'false');
    return;
  }
  initAdminForEnv(env);
  const db = admin.firestore();
  const commands = {
    plan: () => cmdPlan(db, env),
    record: () => cmdRecord(db, env, args),
    'record-android': () => cmdRecordAndroid(db, env, args),
    poll: () => cmdPoll(db, env, args),
    finish: () => cmdFinish(db, env, args),
  };
  if (!commands[command]) throw new Error(`unknown command "${command}" — one of ${Object.keys(commands).join(', ')}`);
  await commands[command]();
}

main().catch((err) => {
  console.error(`::error::[announce] ${err.message}`);
  process.exit(1);
});

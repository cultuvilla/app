/**
 * The commands behind scripts/release-announce.mjs, against an injected
 * context so tests drive them end to end — including the step outputs the
 * workflows branch on (`hold_backend`, `deploy_sha`), whose loss would fail
 * silently: a held backend never dispatched, or a breaking one never held.
 *
 * ctx = {
 *   db,                         Firestore (or a fake)
 *   output(key, value),         $GITHUB_OUTPUT
 *   summary(line), log(m), warn(m),
 *   appVersion(),               app.config.ts version
 *   rollup(version),            breakingSinceLastRelease
 *   headSha(),                  the checked-out commit
 *   playTarget(),               { packageName, track } from eas.json
 *   makePlay(), makeAsc(), ascAppId,
 *   commitMessage,
 * }
 */

import {
  ageInDays,
  decideBackendHold,
  DEPLOY_RETRY_HOURS,
  parseHoldFlag,
  pendingDocPath,
  STALE_DAYS,
} from './announce.mjs';
import {
  applyTick,
  checkStores,
  CONFIG_DOC,
  finishHeldDeploy,
  recordAndroidBuild,
  recordRelease,
} from './announce-store.mjs';

export function parseArgs(argv) {
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

/**
 * A boolean flag, given bare (`--dry-run`) or with a value. Strict: on a path
 * that writes prod and dispatches a prod deploy, an unrecognized value must not
 * quietly read as "no" — `--dry-run=yes` would otherwise mean "apply".
 */
export function parseBoolFlag(value, name) {
  if (value === undefined || value === false || value === 'false') return false;
  if (value === true || value === 'true') return true;
  throw new Error(`--${name} takes no value, "true" or "false"; got ${JSON.stringify(value)}`);
}

async function readDoc(db, p) {
  const snap = await db.doc(p).get();
  return snap.exists ? snap.data() : null;
}

async function decide(ctx, env) {
  const version = ctx.appVersion();
  const rollup = ctx.rollup(version, env);
  const decision = decideBackendHold({
    env,
    version,
    config: await readDoc(ctx.db, CONFIG_DOC),
    rollup,
    pending: await readDoc(ctx.db, pendingDocPath(env)),
    commitMessage: ctx.commitMessage ?? '',
  });
  return { version, rollup, decision };
}

async function cmdPlan(ctx, env) {
  const { version, rollup, decision } = await decide(ctx, env);
  ctx.log(`v${version}: ${rollup.base ?? '(no previous tag)'}..HEAD, ${rollup.commits ?? 0} commits, breaking=${decision.breaking}`);
  for (const r of decision.reasons) ctx.log(`  Breaking-Client: ${r}`);
  ctx.log(`backend: ${decision.hold ? 'HELD' : 'deploys now'} — ${decision.why}`);
  if (decision.breaking && !decision.hold && !decision.inFlight) {
    ctx.warn('breaking changes deploy with nothing in flight: no wall will be raised for them. Set minSupported by hand ("Set App Version") if installed clients break.');
  }
  ctx.output('hold_backend', decision.hold ? 'true' : 'false');
  ctx.output('in_flight', decision.inFlight ? 'true' : 'false');
  ctx.summary(`- Backend (functions + rules): **${decision.hold ? `held until both stores serve ${version}` : 'deployed'}** — ${decision.why}`);
}

async function cmdRecord(ctx, env, args) {
  const { version, decision } = await decide(ctx, env);
  // The plan step decided what this deploy did; record that, not a re-decision
  // (the pending doc or config may have changed in between).
  // Beta has no plan step, so nothing to hand over: it never holds.
  const hold = env === 'prod' ? parseHoldFlag(args.hold) : false;
  const result = await recordRelease(ctx.db, { env, version, sha: ctx.headSha(), decision: { ...decision, hold } });
  if (result.outcome === 'not-in-flight') ctx.log(`v${version} is already what both stores serve — nothing to announce.`);
  else ctx.log(`${result.outcome} ${pendingDocPath(env)}: ${JSON.stringify(result.doc)}`);
}

async function cmdRecordAndroid(ctx, env, args) {
  if (!args.version || !args['version-code']) throw new Error('record-android needs --version and --version-code');
  const result = await recordAndroidBuild(ctx.db, { env, version: args.version, versionCode: args['version-code'] });
  if (result.outcome === 'recorded') ctx.log(`v${args.version} Android versionCode ${args['version-code']} recorded.`);
  else ctx.warn(`versionCode not recorded (${result.outcome}); the poller falls back to matching the Play release by name.`);
}

async function cmdPoll(ctx, env, args) {
  const dryRun = parseBoolFlag(args['dry-run'], 'dry-run');
  const pending = await readDoc(ctx.db, pendingDocPath(env));
  if (!pending) {
    ctx.log('nothing pending.');
    return;
  }
  const age = ageInDays(pending, ctx.now ?? Date.now());
  ctx.log(`pending v${pending.version} (recorded ${age.toFixed(1)} days ago, breaking=${pending.breaking}, holdBackend=${pending.holdBackend})`);
  if (age > STALE_DAYS) {
    ctx.warn(`v${pending.version} is still not live in both stores after ${Math.floor(age)} days — check App Review and the Play Console.${pending.holdBackend ? ' Its backend is held until then.' : ''}`);
  }

  const { packageName, track } = ctx.playTarget();
  const { live, approved, awaitingPublish, detail } = await checkStores({
    pending,
    makePlay: ctx.makePlay,
    makeAsc: ctx.makeAsc,
    ascAppId: ctx.ascAppId,
    packageName,
    track,
    warn: ctx.warn,
  });
  ctx.log(`android: ${detail.android} | ios: ${detail.ios}`);
  if (detail.androidRejected) {
    ctx.summary(`- :x: **Google Play rejected v${pending.version}** (NOT_APPROVED) — Android is not announced until a release is published. Fix it in the Play Console.`);
  }

  const result = await applyTick(ctx.db, {
    env,
    version: pending.version,
    live,
    approved,
    awaitingPublish,
    iosBuildNumber: detail.iosBuildNumber,
    dryRun,
    ...(ctx.now ? { now: ctx.now } : {}),
  });
  if (result.outcome === 'gone' || result.outcome === 'superseded') {
    ctx.log(`pending release changed during the check (${result.outcome}) — wrote nothing; the next tick checks the new one.`);
    return;
  }
  const { plan, payload } = result;
  if (payload) ctx.log(`${dryRun ? 'would write' : 'wrote'} ${CONFIG_DOC}: ${JSON.stringify(payload)}`);
  if (plan.newlyLive.length) ctx.summary(`- Announced v${pending.version} on **${plan.newlyLive.join(' + ')}**`);
  if (plan.config?.minSupported) ctx.summary(`- Wall: minSupported → **${plan.config.minSupported}** (${(pending.reasons ?? []).join('; ')})`);
  if (plan.waitingOn.length) ctx.log(`still waiting on: ${plan.waitingOn.join(', ')}`);
  if (plan.awaitingDeploy) ctx.log(`held backend dispatched at ${pending.deployRequestedAt}; waiting for that deploy to succeed.`);
  if (plan.deploySha && !dryRun) {
    if (plan.retry) {
      ctx.warn(`the held backend dispatched at ${pending.deployRequestedAt} has not deployed within ${DEPLOY_RETRY_HOURS}h — check that Deploy prod run; dispatching again.`);
    } else ctx.log(`both stores live — dispatching the held backend at ${plan.deploySha}.`);
    ctx.output('deploy_sha', plan.deploySha);
  }
  if (plan.clear) ctx.log(`v${pending.version} is live everywhere — pending cleared.`);

  if (dryRun) return;
  // Step outputs announce-when-live.yml turns into a GitHub issue for the user.
  ctx.output('version', pending.version);
  if (plan.ready) {
    ctx.log(`both stores approved v${pending.version} — waiting for \`pnpm release:publish\` and Publish in the Play Console.`);
    ctx.summary(`- :rocket: **v${pending.version} is approved in both stores** — release it: \`pnpm release:publish\` + Publish in the Play Console`);
    ctx.output('ready', 'true');
  }
  if (plan.publishedEarly.length) {
    const p = plan.publishedEarly.join(' + ');
    ctx.warn(`breaking v${pending.version} went live on ${p} before the other store approved it — its users run against the held (old) backend. Was Play managed publishing off?`);
    ctx.output('published_early', p);
  }
  if (plan.stuckUnpublished) {
    ctx.warn(`Play approved v${pending.version} but it is not published: managed publishing is still on. Press Publish in the Play Console and turn managed publishing off.`);
  }
  if (plan.clear && pending.breaking) ctx.output('done', 'true');
}

/**
 * Before `pnpm release:publish` ships a held backend: is there one, and have
 * both stores approved its version? Emits `version` and `backend_sha`. Refuses
 * otherwise, unless `--force` (for a store that cannot be asked).
 */
async function cmdReady(ctx, env, args) {
  const force = parseBoolFlag(args.force, 'force');
  const pending = await readDoc(ctx.db, pendingDocPath(env));
  if (!pending) throw new Error('nothing pending — there is no release to publish.');
  if (!pending.holdBackend) throw new Error(`v${pending.version}'s backend is not held — nothing to release by hand.`);
  const { packageName, track } = ctx.playTarget();
  const { approved, detail } = await checkStores({
    pending,
    makePlay: ctx.makePlay,
    makeAsc: ctx.makeAsc,
    ascAppId: ctx.ascAppId,
    packageName,
    track,
    warn: ctx.warn,
  });
  ctx.log(`v${pending.version} — android: ${detail.android} | ios: ${detail.ios}`);
  const missing = ['ios', 'android'].filter((p) => !approved[p]);
  if (missing.length && !force) {
    throw new Error(`v${pending.version} is not approved on ${missing.join(' + ')} yet — wait for it (or pass --force).`);
  }
  if (missing.length) ctx.warn(`--force: releasing v${pending.version} although ${missing.join(' + ')} has not approved it.`);
  ctx.output('version', pending.version);
  ctx.output('backend_sha', pending.backendSha ?? pending.releaseSha);
}

async function cmdFinish(ctx, env, args) {
  if (!args.sha) throw new Error('finish needs --sha');
  const result = await finishHeldDeploy(ctx.db, { env, sha: args.sha });
  if (result.outcome === 'done') ctx.log('held backend deployed — release finished, pending cleared.');
  else if (result.outcome === 'released-early') ctx.log('held backend deployed before both stores serve the release — the announce still waits for them.');
  else ctx.log(`no held release at ${args.sha} (${result.outcome}) — nothing to finish.`);
}

/** The subcommands the workflows invoke. */
export const COMMANDS = {
  plan: (ctx, env) => cmdPlan(ctx, env),
  record: (ctx, env, args) => cmdRecord(ctx, env, args),
  'record-android': (ctx, env, args) => cmdRecordAndroid(ctx, env, args),
  poll: (ctx, env, args) => cmdPoll(ctx, env, args),
  ready: (ctx, env, args) => cmdReady(ctx, env, args),
  finish: (ctx, env, args) => cmdFinish(ctx, env, args),
};

/**
 * Run one invocation. `makeCtx` is called only for prod, and for beta's
 * record and poll, so another env never touches credentials; a skipped call
 * still answers `hold_backend=false` for a caller that branches on it.
 */
/** Beta announces and walls too, but never holds: only these run there. */
const BETA_COMMANDS = new Set(['record', 'poll']);

export async function runCli(argv, { makeCtx, output }) {
  const args = parseArgs(argv);
  const command = args._[0];
  if (!COMMANDS[command]) throw new Error(`unknown command "${command}" — one of ${Object.keys(COMMANDS).join(', ')}`);
  const env = typeof args.env === 'string' ? args.env : '';
  if (env !== 'prod' && !(env === 'beta' && BETA_COMMANDS.has(command))) {
    output('hold_backend', 'false');
    return { skipped: true, env };
  }
  await COMMANDS[command](await makeCtx(env), env, args);
  return { skipped: false, env };
}

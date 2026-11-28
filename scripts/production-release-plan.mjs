#!/usr/bin/env node
/**
 * What a push to main ships, and whether the prod backend it ships against is
 * live — the two judgements production-release.yml makes.
 *
 *   node scripts/production-release-plan.mjs plan           # job `plan`
 *   node scripts/production-release-plan.mjs wait-backend   # job `backend`
 *
 * The workflow passes the facts in through `env:` and the CLI gathers the rest
 * with git and `gh`; `decideProductionRelease` and `readDeployState` judge them,
 * so every branch is unit-tested (scripts/__tests__/production-release-plan.test.mjs)
 * instead of living in shell that only ran on a real release.
 *
 * The jobs run no `pnpm install`: import only Node built-ins and scripts/lib/.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { extractReleaseNotes } from './lib/changelog-notes.mjs';

/**
 * Paths that cannot change the JS bundle. mobile-ota.yml's `paths-ignore` on
 * beta is the same list (otaUpdates.test.ts holds the two equal), so both
 * channels agree on what is "bundle code".
 */
export const OTA_IGNORED_PATHS = ['docs/**', '**/*.md', '.github/**'];
const OTA_IGNORED = /^(docs\/|\.github\/)|\.md$/;

/** True when a changed path can change the bundle (i.e. matches no OTA_IGNORED_PATHS glob). */
export function isBundlePath(path) {
  return !OTA_IGNORED.test(path);
}

/** Deploy prod's backend jobs: the reusable deploy-firebase.yml called as `deploy`. */
export const DEPLOY_WORKFLOW = 'Deploy prod';
export const DEPLOY_JOB_PREFIX = 'deploy / ';
/** deploy-firebase.yml skips this step, in a green job, when it holds the backend. */
export const FUNCTIONS_STEP = 'Deploy Cloud Functions';

const SKIP_DEPLOY_REASON = '[skip-deploy]: the prod backend for this commit was not deployed';

/**
 * The previous main tip. `before` is all zeros on a branch creation; then (or
 * when it is not a commit here) the first parent, which for a promotion merge is
 * main — returned as null, for the caller to resolve.
 */
export function chooseBase(before, isCommit) {
  if (before && !/^0+$/.test(before) && isCommit(before)) return before;
  return null;
}

/**
 * @param {object} input
 * @param {string} input.version         apps/mobile/package.json at HEAD
 * @param {string} input.previous        the same at the previous main tip
 * @param {string} input.base            that tip's sha
 * @param {string} input.configVersion   app.config.ts's `version` (what the iOS submit picks by)
 * @param {boolean} input.hasNotes       CHANGELOG.md has a usable `## v<version>` section
 * @param {string} input.commitMessage   the head commit's message
 * @param {Record<string,string|undefined>} input.vars  STORE_RELEASE_PAUSED, PROD_OTA_PAUSED, PLAY_SUBMIT_PAUSED
 * @param {string[]} input.changedFiles  `git diff --name-only <base> HEAD`
 */
export function decideProductionRelease({
  version,
  previous,
  base,
  configVersion,
  hasNotes,
  commitMessage = '',
  vars = {},
  changedFiles = [],
}) {
  const skipDeploy = commitMessage.includes('[skip-deploy]');

  let store = false;
  let reason;
  if (skipDeploy) {
    reason = SKIP_DEPLOY_REASON;
  } else if (version === previous) {
    reason = `version unchanged (${version})`;
  } else if (commitMessage.includes('[skip-store]')) {
    reason = '[skip-store] in the commit message';
  } else if (vars.STORE_RELEASE_PAUSED === 'true') {
    reason = 'STORE_RELEASE_PAUSED=true';
  } else {
    store = true;
    reason = `${previous} -> ${version}`;
  }

  // Preconditions the store jobs would otherwise discover only after a release
  // started — and a fix commit does not bump the version, so the release would
  // never re-run. Checked only when binaries would ship, so a kill-switch still
  // lands a fix on main cleanly. The first one failing ships nothing.
  if (store) {
    // package.json decides here; appstore-release.mjs picks the iOS build by
    // app.config.ts. Disagreeing, the stores would get different versions.
    if (configVersion !== version) {
      return {
        errors: [
          `apps/mobile/app.config.ts says ${configVersion} but package.json says ${version} — nothing ships. Make them agree (pnpm release:cut writes both).`,
        ],
      };
    }
    // The iOS submit takes its "What's New" from this section and throws without it.
    if (!hasNotes) {
      return { errors: [`CHANGELOG.md has no usable '## v${version}' section — nothing ships.`] };
    }
  }

  // The Play freeze stops Android only — iOS still ships, as on beta. That
  // splits the stores for this version, and since store switches are one-shot
  // per version (a later push does not re-try them), say so loudly on the run
  // that did it rather than skip a job in silence.
  const warnings = [];
  let android = store;
  let androidReason = reason;
  if (store && vars.PLAY_SUBMIT_PAUSED === 'true') {
    android = false;
    androidReason = `PLAY_SUBMIT_PAUSED=true — iOS ships ${version} alone`;
    warnings.push(
      `PLAY_SUBMIT_PAUSED=true: iOS ships ${version} and Android does not. Once Play is unfrozen, re-run this workflow run or dispatch mobile-release (platform android, track production).`,
    );
  }

  let ota = false;
  let otaReason;
  if (skipDeploy) {
    otaReason = SKIP_DEPLOY_REASON;
  } else if (!changedFiles.some((f) => f !== '' && isBundlePath(f))) {
    otaReason = 'only docs/.github changes';
  } else if (commitMessage.includes('[skip-ota]')) {
    otaReason = '[skip-ota] in the commit message';
  } else if (vars.PROD_OTA_PAUSED === 'true') {
    otaReason = 'PROD_OTA_PAUSED=true';
  } else {
    ota = true;
    otaReason = `bundle sources changed since ${String(base).slice(0, 7)}`;
  }

  return { errors: [], warnings, store, reason, android, androidReason, ota, otaReason };
}

/** The newest Deploy prod run in a `GET /actions/runs` response, or null. */
export function latestDeployRun(runsResponse) {
  const runs = (runsResponse?.workflow_runs ?? []).filter((r) => r.name === DEPLOY_WORKFLOW);
  if (runs.length === 0) return null;
  return runs.reduce((a, b) => (b.id >= a.id ? b : a));
}

/** The backend jobs of a `GET /runs/{id}/jobs` response, each with whether it held the backend. */
export function backendJobs(jobsResponse) {
  return (jobsResponse?.jobs ?? [])
    .filter((j) => typeof j.name === 'string' && j.name.startsWith(DEPLOY_JOB_PREFIX))
    .map((j) => ({
      name: j.name,
      status: j.status,
      conclusion: j.conclusion,
      held: (j.steps ?? []).some((s) => s.name === FUNCTIONS_STEP && s.conclusion === 'skipped'),
    }));
}

/**
 * One tick of the backend wait. `run` is `latestDeployRun`'s result (null: not
 * there yet, or the API call failed); `jobs` is `backendJobs`'s (null: the
 * jobs call failed). A failed call is no information, not a verdict — it waits.
 *
 * Only `success` counts: a skipped backend job is not a deployed one
 * ([skip-deploy] is handled by the plan, so reaching it here is a failure). A
 * skipped functions STEP inside a green job is the held backend.
 *
 * @returns {{state: 'waiting'|'green'|'failed'|'no-backend', held?: boolean}}
 */
export function readDeployState(run, jobs) {
  if (!run?.id || !jobs) return { state: 'waiting' };
  if (jobs.length === 0) return { state: run.status === 'completed' ? 'no-backend' : 'waiting' };
  if (!jobs.every((j) => j.status === 'completed')) return { state: 'waiting' };
  if (!jobs.every((j) => j.conclusion === 'success')) return { state: 'failed' };
  return { state: 'green', held: jobs.some((j) => j.held) };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function versionAt(rev) {
  return String(JSON.parse(git('show', `${rev}:apps/mobile/package.json`)).version);
}

function output(line) {
  appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`);
}

function runPlan() {
  const base =
    chooseBase(process.env.BEFORE ?? '', (sha) => {
      try {
        execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    }) ?? git('rev-parse', 'HEAD^1').trim();
  const version = versionAt('HEAD');
  const previous = versionAt(base);

  const configVersion = [
    ...readFileSync('apps/mobile/app.config.ts', 'utf8').matchAll(/^ {2}version: '([^']+)',$/gm),
  ]
    .map((m) => m[1])
    .join('\n');
  let notesError = null;
  try {
    extractReleaseNotes(readFileSync('CHANGELOG.md', 'utf8'), version);
  } catch (err) {
    notesError = err;
  }
  const changedFiles = git('diff', '--name-only', base, 'HEAD').split('\n');

  const decision = decideProductionRelease({
    version,
    previous,
    base,
    configVersion,
    hasNotes: notesError === null,
    commitMessage: process.env.COMMIT_MESSAGE ?? '',
    vars: {
      STORE_RELEASE_PAUSED: process.env.STORE_RELEASE_PAUSED,
      PROD_OTA_PAUSED: process.env.PROD_OTA_PAUSED,
      PLAY_SUBMIT_PAUSED: process.env.PLAY_SUBMIT_PAUSED,
    },
    changedFiles,
  });
  if (decision.errors.length > 0) {
    if (notesError && decision.errors[0].startsWith('CHANGELOG.md')) console.error(notesError.message);
    for (const e of decision.errors) console.log(`::error::${e}`);
    return 1;
  }

  const { store, reason, android, androidReason, ota, otaReason } = decision;
  output(`store=${store}`);
  for (const w of decision.warnings) console.log(`::warning::${w}`);
  output(`android=${android}`);
  output(`ota=${ota}`);
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    [
      '### Production release plan',
      `- Store binaries: **${store}** — ${reason}`,
      // A plan, not an outcome: the Play freeze is read again when the android
      // job starts, and `play-freeze` reports it if that skips it.
      `- Android (planned): **${android}** — ${androidReason}`,
      `- Production OTA: **${ota}** — ${otaReason}`,
      '',
    ].join('\n'),
  );
  console.log(`store=${store} (${reason}); android=${android} (${androidReason}); ota=${ota} (${otaReason})`);
  return 0;
}

function ghApi(path) {
  try {
    return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  } catch {
    return null;
  }
}

const ATTEMPTS = 120;
const INTERVAL_MS = 30_000;

async function runWaitBackend() {
  const { REPO, GITHUB_SHA } = process.env;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const run = latestDeployRun(
      ghApi(`repos/${REPO}/actions/runs?head_sha=${GITHUB_SHA}&event=push&branch=main&per_page=100`),
    );
    const jobsResponse = run?.id ? ghApi(`repos/${REPO}/actions/runs/${run.id}/jobs?per_page=100`) : null;
    const jobs = jobsResponse ? backendJobs(jobsResponse) : null;
    if (jobs) console.log(JSON.stringify(jobs, null, 2));

    const { state, held } = readDeployState(run, jobs);
    if (state === 'no-backend') {
      console.log(`::error::Deploy prod (run ${run.id}) finished without a backend deploy job — nothing ships.`);
      return 1;
    }
    if (state === 'failed') {
      console.log(`::error::The prod backend deploy failed (run ${run.id}) — nothing ships. Fix it and re-run this workflow.`);
      return 1;
    }
    if (state === 'green') {
      output(`held=${held}`);
      if (held) {
        console.log(
          `::notice::Prod deploy is green with the backend HELD (breaking release, run ${run.id}): the stores ship, the production OTA does not. The backend ships when both stores serve this version.`,
        );
      } else {
        console.log(`Prod backend deploy is green (run ${run.id}).`);
      }
      return 0;
    }
    await sleep(INTERVAL_MS);
  }
  console.log(`::error::Timed out waiting for Deploy prod on ${GITHUB_SHA}.`);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const command = process.argv[2];
  if (command === 'plan') process.exitCode = runPlan();
  else if (command === 'wait-backend') process.exitCode = await runWaitBackend();
  else {
    console.error('usage: production-release-plan.mjs plan | wait-backend');
    process.exitCode = 2;
  }
}

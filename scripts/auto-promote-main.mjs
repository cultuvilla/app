#!/usr/bin/env node
/**
 * Decide whether promote-to-main.yml may merge the open `beta → main` PR.
 *
 *   node scripts/auto-promote-main.mjs <input.json>   # prints the decision as JSON
 *
 * The workflow gathers the facts with `gh` and this script judges them, so the
 * judgement is unit-tested (scripts/__tests__/auto-promote-main.test.mjs).
 * Input shape: see `decideAutoMerge`.
 *
 * Merging is opt-in (repo variable AUTO_MERGE_TO_MAIN=true, the user's call)
 * and needs RELEASE_PR_TOKEN: a merge made with GITHUB_TOKEN triggers no push
 * workflows, so Deploy prod and Production release would never run.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const HOLD_LABEL = 'hold';
export const DEFAULT_SOAK_HOURS = 2;
const SKIP_TOKENS = ['[skip-deploy]', '[skip-store]', '[skip-ota]'];
const VERSION_TITLE = /^\d+\.\d+\.\d+$/;
const HOUR_MS = 60 * 60 * 1000;
const MERGE_READY_STATES = ['CLEAN', 'HAS_HOOKS'];

export function soakHours(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return DEFAULT_SOAK_HOURS;
  const hours = Number(raw);
  return Number.isFinite(hours) && hours >= 0 ? hours : DEFAULT_SOAK_HOURS;
}

/** Latest run (highest id) of a workflow name, or undefined. */
function latestRun(runs, name) {
  return runs.filter((r) => r.name === name).sort((a, b) => b.id - a.id)[0];
}

function runState(run) {
  if (!run) return 'missing';
  if (run.status !== 'completed') return 'running';
  if (run.conclusion === 'success') return 'success';
  // A [skip-deploy] push concludes `skipped`: not a failure, but not deployed either.
  return run.conclusion === 'skipped' ? 'skipped' : `failed (${run.conclusion})`;
}

/** Latest check per name across check runs and commit statuses → 'pass' | 'pending' | 'fail'. */
export function checkState(checks, name) {
  const matching = checks.filter((c) => c.name === name).sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  const latest = matching[0];
  if (!latest) return 'missing';
  if (latest.status && latest.status !== 'completed') return 'pending';
  const outcome = latest.conclusion ?? latest.state;
  if (outcome === 'success' || outcome === 'skipped' || outcome === 'neutral') return 'pass';
  if (outcome === 'pending' || outcome === null || outcome === undefined) return 'pending';
  return 'fail';
}

/**
 * @param {object} input
 * @param {{number:number,title:string,headRefName:string,baseRefName:string,headRefOid:string,
 *   isCrossRepository:boolean,isDraft:boolean,labels:{name:string}[],mergeable:string,
 *   mergeStateStatus:string}|null} input.pr
 * @param {string} input.headVersion        apps/mobile/package.json version at the head SHA
 * @param {string} input.betaHead           SHA of beta's tip
 * @param {object[]} input.runs             push runs on beta for betaHead: {id,name,status,conclusion,updated_at}
 * @param {string[]} input.requiredChecks   main's required status-check contexts (branch protection + rulesets)
 * @param {object[]} input.checks           check runs {id,name,status,conclusion} + statuses {name,state} on the head SHA
 * @param {string} input.now                ISO time
 * @param {string|number} [input.soakHours] AUTO_PROMOTE_SOAK_HOURS
 * @param {boolean} input.enabled           AUTO_MERGE_TO_MAIN == 'true'
 * @param {boolean} input.hasToken          RELEASE_PR_TOKEN is set
 * @returns {{action:'none'|'wait'|'report'|'merge', pr?:number, sha?:string, blockers:string[], notes:string[]}}
 */
export function decideAutoMerge(input) {
  const { pr } = input;
  if (!pr) return { action: 'none', blockers: [], notes: ['No open beta → main PR.'] };

  const blockers = [];
  const notes = [];

  if (pr.baseRefName !== 'main' || pr.headRefName !== 'beta' || pr.isCrossRepository) {
    blockers.push('not the beta → main PR of this repository');
  }
  if (!VERSION_TITLE.test(pr.title)) {
    blockers.push(`title "${pr.title}" is not a bare X.Y.Z version (not the auto-opened release PR)`);
  } else if (pr.title !== input.headVersion) {
    // open-pr refreshes title and body on every beta push; a stale title means
    // that refresh failed and the PR still describes the previous release.
    blockers.push(`title "${pr.title}" is not the head's version ${input.headVersion} (the PR was not refreshed)`);
  }
  if (SKIP_TOKENS.some((t) => pr.title.includes(t))) {
    blockers.push('title carries a [skip-…] token, which would land in the merge commit');
  }
  if (pr.isDraft) blockers.push('PR is a draft');
  if ((pr.labels ?? []).some((l) => l.name.toLowerCase() === HOLD_LABEL)) {
    blockers.push(`PR has the \`${HOLD_LABEL}\` label`);
  }
  if (pr.headRefOid !== input.betaHead) {
    blockers.push(`PR head ${pr.headRefOid.slice(0, 7)} is not beta's tip ${String(input.betaHead).slice(0, 7)}`);
  }
  if (pr.mergeable !== 'MERGEABLE') blockers.push(`PR is not mergeable (${pr.mergeable})`);
  // MERGEABLE only means conflict-free; BLOCKED / BEHIND / UNSTABLE mean branch
  // protection would refuse the merge, or a check failed and deserves a human.
  if (!MERGE_READY_STATES.includes(pr.mergeStateStatus)) {
    blockers.push(`PR merge state is ${pr.mergeStateStatus}, not CLEAN`);
  }

  const runs = input.runs ?? [];
  const deploy = latestRun(runs, 'Deploy beta');
  const deployState = runState(deploy);
  if (deployState !== 'success') blockers.push(`Deploy beta: ${deployState}`);

  // beta-build-and-submit skips docs-only pushes (paths-ignore): absent is fine.
  const build = latestRun(runs, 'beta-build-and-submit');
  if (build && runState(build) !== 'success') blockers.push(`beta-build-and-submit: ${runState(build)}`);

  const e2eState = runState(latestRun(runs, 'android-e2e'));
  if (e2eState !== 'success') blockers.push(`android-e2e on beta: ${e2eState}`);

  // An empty list means the protection could not be read, not that nothing is
  // required: merging blind would skip the CI gate.
  if ((input.requiredChecks ?? []).length === 0) {
    blockers.push("no required status checks found for main (neither branch protection nor a ruleset): merging would skip CI");
  }
  for (const name of input.requiredChecks ?? []) {
    const state = checkState(input.checks ?? [], name);
    if (state !== 'pass') blockers.push(`required check "${name}": ${state}`);
  }

  // The soak is tester time, so it starts when the later of the backend deploy
  // and the beta binaries finished. A re-run restarts it, which errs safe.
  const hours = soakHours(input.soakHours);
  if (deployState === 'success') {
    const finished = [deploy, build].filter((r) => runState(r) === 'success').map((r) => Date.parse(r.updated_at));
    const soakEnds = Math.max(...finished) + hours * HOUR_MS;
    const now = Date.parse(input.now);
    if (now < soakEnds) {
      blockers.push(`soaking on beta until ${new Date(soakEnds).toISOString()} (${hours}h after the beta deploy and builds)`);
    }
  }

  const base = { pr: pr.number, sha: pr.headRefOid, blockers, notes };
  if (blockers.length > 0) return { action: 'wait', ...base };

  if (!input.enabled) {
    notes.push('Would merge, but AUTO_MERGE_TO_MAIN is not "true" — merging to main is the user\'s switch.');
  }
  if (!input.hasToken) {
    notes.push('Would merge, but RELEASE_PR_TOKEN is not set: a GITHUB_TOKEN merge runs no Deploy prod, so it never merges with one.');
  }
  return { action: notes.length > 0 ? 'report' : 'merge', ...base };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  process.stdout.write(`${JSON.stringify(decideAutoMerge(input))}\n`);
}

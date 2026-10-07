import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Announce-when-live (docs/decisions/announce-when-live-poller.md): a production
// release reaches installed apps only once the stores serve it, and a breaking
// one holds its backend until then. Each piece lives in a different workflow,
// and the failure modes are quiet — a hold nobody releases, a wall raised over
// an unreleased build, an OTA against a held backend, a store job waiting
// forever on a deploy that will not come. These pin the wiring. Parsed as text
// (no YAML dep), in the same spirit as backfillGate.test.ts.

const repoRoot = resolve(__dirname, '../../../..');
const read = (rel: string) => readFileSync(resolve(repoRoot, rel), 'utf-8');
const deploy = read('.github/workflows/deploy-firebase.yml');
const deployProd = read('.github/workflows/deploy-prod.yml');
const release = read('.github/workflows/production-release.yml');
const poller = read('.github/workflows/announce-when-live.yml');
const publish = read('.github/workflows/release-publish.yml');

function step(workflow: string, needle: string): string {
  const blocks = workflow.split(/^ {6}- (?:name|uses):/m);
  const match = blocks.find((b) => b.includes(needle));
  if (!match) throw new Error(`No workflow step contains "${needle}"`);
  return match;
}

function job(workflow: string, name: string): string {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  expect(start, `job ${name} missing`).toBeGreaterThan(-1);
  const next = workflow.slice(start + 1).search(/\n {2}[\w-]+:\n/);
  return next === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
}

describe('the prod deploy holds a breaking backend', () => {
  it('plans the release on prod only, and not on the run that ships a held backend', () => {
    const plan = step(deploy, 'release-announce.mjs plan');
    expect(plan).toContain('id: release');
    expect(plan).toMatch(/if: \$\{\{ inputs\.firebase_alias == 'prod' && !inputs\.held_backend \}\}/);
    // `[auto-deploy]` is read from the merge commit.
    expect(plan).toContain('COMMIT_MESSAGE: ${{ github.event.head_commit.message }}');
  });

  // A held release's data must not move either: the backfills (and the gates
  // that read their result) run with the rest when a person releases it.
  it('plans before the backfills, after authenticating, and before any deploy', () => {
    const plan = deploy.indexOf('release-announce.mjs plan');
    expect(plan).toBeGreaterThan(deploy.indexOf('google-github-actions/auth'));
    expect(plan).toBeLessThan(deploy.indexOf('backfills-cli.mjs auto-apply'));
    expect(plan).toBeLessThan(deploy.search(/^\s*run: firebase deploy/m));
  });

  // Hosting is held with the functions it rewrites to: shipped alone on 1.7.1
  // it pointed at a readSite prod did not have, and cultuvilla.es 404'd.
  it('holds backfills, gates, rules, functions and hosting — only indexes ship', () => {
    const held = "steps.release.outputs.hold_backend != 'true'";
    for (const needle of [
      'backfills-cli.mjs auto-apply',
      'check-dev-conformance.mjs',
      'backfills-cli.mjs verify',
      'run: firebase deploy --only firestore:rules,storage',
      'run: firebase deploy --only functions',
      'node scripts/build-web-static.mjs',
      'run: firebase deploy --only hosting',
    ]) {
      expect(step(deploy, needle), needle).toContain(held);
    }
    expect(step(deploy, 'run: firebase deploy --only firestore:indexes')).not.toContain('hold_backend');
    expect(step(deploy, 'smoke-read-site.mjs')).not.toContain('hold_backend');
  });

  // Rollup reads `<previous tag>..HEAD`; a shallow clone has neither.
  it('fetches full history and tags on prod', () => {
    expect(step(deploy, 'actions/checkout')).toContain("fetch-depth: ${{ inputs.firebase_alias == 'prod' && '0' || '1' }}");
    expect(step(deploy, 'actions/checkout')).toContain('ref: ${{ inputs.ref }}');
  });

  it('records the release after hosting, with the hold the plan decided', () => {
    const record = step(deploy, 'release-announce.mjs record');
    expect(record).toContain('--hold=${{ steps.release.outputs.hold_backend }}');
    expect(record).toMatch(/if: \$\{\{ inputs\.firebase_alias == 'prod' && !inputs\.held_backend \}\}/);
    expect(deploy.indexOf('release-announce.mjs record')).toBeGreaterThan(deploy.indexOf('firebase deploy --only hosting'));
  });
});

describe('deploy-prod ships a held backend on dispatch', () => {
  it('accepts a backend_sha dispatch and deploys that commit as a held backend', () => {
    expect(deployProd).toContain('workflow_dispatch:');
    expect(deployProd).toContain('backend_sha:');
    const d = job(deployProd, 'deploy');
    expect(d).toContain("ref: ${{ inputs.backend_sha || '' }}");
    expect(d).toContain("held_backend: ${{ github.event_name == 'workflow_dispatch' }}");
  });

  // A dispatch may run from a newer main whose package.json names another version.
  it('tags only on push', () => {
    expect(job(deployProd, 'tag')).toContain("if: ${{ github.event_name == 'push' }}");
  });
});

describe('production-release does not deadlock on a held backend', () => {
  // The held backend waits for these very binaries; if the stores waited for
  // the backend, neither would ever move.
  it('treats a held deploy as green and reports it', () => {
    const backend = job(release, 'backend');
    expect(backend).toContain('held: ${{ steps.wait.outputs.held }}');
    expect(backend).toContain('select(.name == "Deploy Cloud Functions")');
    expect(backend).toContain('any(. == "skipped")');
    expect(backend).toContain('echo "held=${held}" >> "$GITHUB_OUTPUT"');
  });

  // The step name is the contract between the two workflows.
  it('reads the step deploy-firebase.yml actually names', () => {
    expect(deploy).toMatch(/^ {6}- name: Deploy Cloud Functions$/m);
  });

  it('still ships the store binaries, but no OTA, while the backend is held', () => {
    expect(job(release, 'ota')).toContain("needs.backend.outputs.held != 'true'");
    // iOS still ships held; `held` only picks its release type.
    expect(job(release, 'ios')).toMatch(/if: \$\{\{ needs\.plan\.outputs\.store == 'true' \}\}/);
    expect(job(release, 'android')).not.toContain('outputs.held');
  });

  it('hands the Android versionCode to the poller, best effort', () => {
    expect(job(release, 'android')).toContain('version_code: ${{ steps.built.outputs.version_code }}');
    expect(job(release, 'android')).toContain('eas build:version:get --platform android --profile production');
    const record = job(release, 'record-android-build');
    expect(record).toContain('needs: android');
    expect(record).toContain('environment: production');
    expect(record).toContain('release-announce.mjs record-android --env=prod');
  });
});

describe('the announce poller', () => {
  it('exists', () => {
    expect(existsSync(resolve(repoRoot, '.github/workflows/announce-when-live.yml'))).toBe(true);
  });

  it('runs every 30 minutes and on dispatch', () => {
    expect(poller).toMatch(/- cron: ["']\*\/30 \* \* \* \*["']/);
    expect(poller).toContain('workflow_dispatch:');
  });

  // Schedules run on the default branch (develop); the production environment
  // admits only main. A poll scheduled directly would never get credentials.
  it('polls only on main, kicked from the schedule', () => {
    expect(job(poller, 'kick')).toContain("if: ${{ github.event_name == 'schedule' }}");
    expect(job(poller, 'kick')).toContain('gh workflow run announce-when-live.yml --repo "${REPO}" --ref main');
    const poll = job(poller, 'poll');
    expect(poll).toContain("github.ref == 'refs/heads/main'");
    expect(poll).toContain('environment: production');
    expect(poll).toContain('workload_identity_provider: ${{ vars.GCP_WIF_PROVIDER }}');
    expect(poll).not.toMatch(/credentials_json:/);
  });

  it('exits before installing anything when nothing is pending', () => {
    const poll = job(poller, 'poll');
    const check = poll.indexOf('_admin/announce/pending/prod');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(poll.indexOf('pnpm install'));
    expect(step(poller, 'pnpm install')).toContain("steps.pending.outputs.pending == 'true'");
  });

  // checkout's clean deletes the credentials file the first auth wrote into the
  // workspace, so the poll needs its own auth after checkout.
  it('authenticates again after checkout, before the poll', () => {
    const poll = job(poller, 'poll');
    const checkout = poll.indexOf('actions/checkout');
    const reauth = poll.indexOf('google-github-actions/auth', checkout);
    expect(checkout).toBeGreaterThan(-1);
    expect(reauth).toBeGreaterThan(checkout);
    expect(reauth).toBeLessThan(poll.indexOf('release-announce.mjs poll'));
  });

  it('asks both stores with their credentials', () => {
    const poll = step(poller, 'release-announce.mjs poll');
    for (const name of ['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', 'APPLE_ASC_API_KEY_P8', 'APPLE_ASC_KEY_ID', 'APPLE_ASC_ISSUER_ID', 'ASC_APP_ID']) {
      expect(poll).toContain(name);
    }
  });

  // The wall is written inside the poll step; the backend follows it.
  it('dispatches the held backend after the poll, on main, pinned to its commit', () => {
    const dispatch = step(poller, 'gh workflow run deploy-prod.yml');
    expect(dispatch).toContain("if: ${{ steps.poll.outputs.deploy_sha != '' }}");
    expect(dispatch).toContain('--ref main -f backend_sha="${SHA}"');
    expect(poller.indexOf('release-announce.mjs poll')).toBeLessThan(poller.indexOf('gh workflow run deploy-prod.yml'));
  });

  // `gh workflow run` only means the dispatch was accepted. Clearing the
  // pending doc there would forget a held backend whose deploy then failed.
  it('never finishes a release on dispatch — the deploy does, on success', () => {
    expect(poller).not.toContain('release-announce.mjs finish');
    const finish = step(deploy, 'release-announce.mjs finish');
    expect(finish).toContain("if: ${{ inputs.firebase_alias == 'prod' && inputs.held_backend }}");
    expect(deploy.indexOf('release-announce.mjs finish')).toBeGreaterThan(deploy.indexOf('run: firebase deploy --only hosting'));
    expect(deploy.indexOf('release-announce.mjs finish')).toBeGreaterThan(deploy.indexOf('run: firebase deploy --only functions'));
  });
});

describe('a dispatched ref must already be on main', () => {
  // actions/checkout fetches any commit the remote has; the environment's
  // branch rule guards only the workflow ref.
  it('refuses a ref that is not an ancestor of main, before anything runs', () => {
    const guard = step(deploy, 'git merge-base --is-ancestor');
    expect(guard).toContain("if: ${{ inputs.ref != '' }}");
    expect(guard).toContain('git fetch --no-tags origin main');
    expect(guard).toMatch(/exit 1/);
    const guardPos = deploy.indexOf('git merge-base --is-ancestor');
    expect(guardPos).toBeLessThan(deploy.indexOf('pnpm install --frozen-lockfile'));
    expect(guardPos).toBeLessThan(deploy.search(/^\s*run: firebase deploy/m));
  });
});

describe('a breaking release is released by a person', () => {
  // A MANUAL App Store release waits after approval instead of going on sale alone.
  it('submits iOS with a manual release when the backend is held', () => {
    const ios = job(release, 'ios');
    expect(ios).toContain("RELEASE_TYPE: ${{ needs.backend.outputs.held == 'true' && 'MANUAL' || 'AFTER_APPROVAL' }}");
    expect(ios).toContain('--release-type="${RELEASE_TYPE}"');
  });

  it('opens an issue when both stores approved, and closes it when done', () => {
    const poll = job(poller, 'poll');
    expect(poll).toContain('issues: write');
    expect(step(poller, 'Tell the user the release is ready')).toContain("if: ${{ steps.poll.outputs.ready == 'true' }}");
    expect(step(poller, 'Tell the user the release is ready')).toContain('pnpm release:publish');
    expect(step(poller, 'went live on one store early')).toContain("if: ${{ steps.poll.outputs.published_early != '' }}");
    expect(step(poller, 'Close the release issue')).toContain("if: ${{ steps.poll.outputs.done == 'true' }}");
    expect(step(poller, 'Close the release issue')).toMatch(/managed publishing off/);
  });

  it('release:publish checks approvals, deploys the held backend, then releases iOS', () => {
    expect(publish).toContain('workflow_dispatch:');
    const ready = job(publish, 'ready');
    expect(ready).toContain("if: ${{ github.ref == 'refs/heads/main' }}");
    expect(ready).toContain('environment: production');
    expect(ready).toContain('release-announce.mjs ready --env=prod');
    const d = job(publish, 'deploy');
    expect(d).toContain('uses: ./.github/workflows/deploy-firebase.yml');
    expect(d).toContain('ref: ${{ needs.ready.outputs.backend_sha }}');
    expect(d).toContain('held_backend: true');
    const ios = job(publish, 'ios');
    expect(ios).toContain('needs: [ready, deploy]');
    expect(ios).toContain('appstore-release.mjs release --version="${VERSION}" --apply');
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['release:publish']).toContain('gh workflow run release-publish.yml --ref main');
  });
});

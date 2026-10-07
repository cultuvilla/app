import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Code deploys automatically when it reaches an environment; the data migration
// it depends on does NOT. Before this gate, "has the backfill run on beta?" was
// a `**Migration:**` line in CHANGELOG.md that a human had to notice during a
// promotion — a convention with no enforcement. The deploy workflow now fails
// when a `pre-deploy` backfill has no completion marker for the target env, and
// run-backfill.yml is the credentialed endpoint that clears it.
//
// These invariant tests fail the build if that wiring is removed, un-guarded,
// or reordered after a deploy step. Parsed as text (no YAML dep), in the same
// spirit as conformanceGate.test.ts. See AGENTS.md "Backfills".
//
// Also covers set-app-version.yml, the sibling credential-free endpoint for
// `config/appVersion`: same WIF mechanism, same dry-run-by-default posture, and
// the same reason for existing — a release step that needs Firestore
// credentials nobody holds locally.

const repoRoot = resolve(__dirname, '../../../..');
const read = (rel: string) => readFileSync(resolve(repoRoot, rel), 'utf-8');
const deployWorkflow = read('.github/workflows/deploy-firebase.yml');
const runWorkflow = read('.github/workflows/run-backfill.yml');
const ciWorkflow = read('.github/workflows/ci.yml');
const appVersionWorkflow = read('.github/workflows/set-app-version.yml');

/** Split a workflow's steps into per-step blocks so `if:`/`run:` attribute correctly. */
function stepBlockContaining(workflow: string, needle: string): string {
  const blocks = workflow.split(/^ {6}- name:/m);
  const match = blocks.find((b) => b.includes(needle));
  if (!match) throw new Error(`No workflow step contains "${needle}"`);
  return match;
}

describe('deploy backfill gate invariant', () => {
  it('verifies backfills as a step in the deploy pipeline, against the target env', () => {
    const gate = stepBlockContaining(deployWorkflow, 'backfills-cli.mjs verify');
    expect(gate).toContain('--env ${{ inputs.firebase_alias }}');
  });

  it('is guarded to beta/prod (skips dev)', () => {
    // Matches the conformance gate: dev data churns constantly and its WIF SA
    // may lack Firestore read.
    const gate = stepBlockContaining(deployWorkflow, 'backfills-cli.mjs verify');
    expect(gate).toMatch(/if:.*inputs\.firebase_alias != 'dev'/);
  });

  it('runs before any firebase deploy, so a missing migration blocks the whole deploy', () => {
    const gatePos = deployWorkflow.indexOf('backfills-cli.mjs verify');
    const firstDeployPos = deployWorkflow.search(/^\s*run: firebase deploy/m);
    expect(gatePos, 'backfill gate step not found').toBeGreaterThanOrEqual(0);
    expect(firstDeployPos, '`firebase deploy` step not found').toBeGreaterThanOrEqual(0);
    expect(gatePos).toBeLessThan(firstDeployPos);
  });

  it('auto-applies opted-in backfills before verifying, so they can satisfy the gate', () => {
    const autoPos = deployWorkflow.indexOf('backfills-cli.mjs auto-apply');
    const verifyPos = deployWorkflow.indexOf('backfills-cli.mjs verify');
    expect(autoPos, 'auto-apply step not found').toBeGreaterThanOrEqual(0);
    expect(autoPos).toBeLessThan(verifyPos);
  });

  it('auto-applies BEFORE the conformance gate, not just before the verify gate', () => {
    // The ordering bug this locks out: auto-apply used to sit between the two
    // gates, which made it unreachable. The conformance gate reads exactly the
    // docs auto-apply was about to fix, so it failed first and the deploy died
    // before the migration could run — the mechanism was inert for every
    // schema change it was built to absorb. A migration that can apply itself
    // has to do so before anything inspects the data.
    const autoPos = deployWorkflow.indexOf('backfills-cli.mjs auto-apply');
    const conformancePos = deployWorkflow.indexOf('check-dev-conformance.mjs');
    expect(autoPos, 'auto-apply step not found').toBeGreaterThanOrEqual(0);
    expect(conformancePos, 'conformance gate step not found').toBeGreaterThanOrEqual(0);
    expect(autoPos).toBeLessThan(conformancePos);
  });
});

describe('release tag invariant', () => {
  const prodWorkflow = read('.github/workflows/deploy-prod.yml');

  it('tags the release from the prod deploy, not by hand', () => {
    // v0.21.0 shipped untagged because the tag was a manual step and whoever
    // cut the release could not push tag refs. CI holds the credential.
    expect(prodWorkflow).toContain('git push origin "refs/tags/${tag}"');
  });

  it('tags only after the deploy job succeeds, so a tag names a shipped commit', () => {
    expect(prodWorkflow).toMatch(/tag:\s*\n\s*needs: deploy/);
  });

  it('is idempotent — an existing tag is left alone rather than failing the run', () => {
    // So re-running an older prod deploy backfills a missing tag.
    expect(prodWorkflow).toContain('git ls-remote --exit-code --tags origin');
  });

  it('reads the version from the mirrored package.json, never a hardcoded literal', () => {
    expect(prodWorkflow).toContain("require('./apps/mobile/package.json').version");
  });

  it('grants contents: write only to the tag job, leaving the deploy read-only', () => {
    // dev/beta call the same reusable deploy workflow; none of them should gain
    // push rights just because prod needs to write one ref.
    const tagJob = prodWorkflow.slice(prodWorkflow.indexOf('  tag:'));
    expect(tagJob).toContain('contents: write');
    expect(read('.github/workflows/deploy-firebase.yml')).not.toContain('contents: write');
  });
});

describe('run-backfill endpoint invariant', () => {
  it('is manually dispatchable with id, env and mode inputs', () => {
    expect(runWorkflow).toContain('workflow_dispatch');
    for (const input of ['      id:', '      env:', '      mode:']) {
      expect(runWorkflow).toContain(input);
    }
  });

  it('defaults to dry-run', () => {
    // The destructive mode must be opt-in; a mis-dispatch should write nothing.
    expect(runWorkflow).toMatch(/default: dry-run/);
  });

  it('only writes when mode is explicitly apply', () => {
    const applyStep = stepBlockContaining(runWorkflow, '--apply');
    expect(applyStep).toMatch(/if:\s*inputs\.mode == 'apply'/);
  });

  it('always dry-runs first, before any apply step', () => {
    const dryPos = runWorkflow.indexOf('run: node scripts/backfills-cli.mjs run --id="$ID" --env="$ENV" --confirm --verbose');
    const applyPos = runWorkflow.indexOf('--apply');
    expect(dryPos, 'unconditional dry-run step not found').toBeGreaterThanOrEqual(0);
    expect(dryPos).toBeLessThan(applyPos);
  });

  it('authenticates keylessly via Workload Identity Federation, never a stored SA key', () => {
    // beta/prod enforce iam.disableServiceAccountKeyCreation, so there is no
    // key to store; and a secrets-based picker can fall through to the wrong
    // environment's credential when one secret is unset.
    expect(runWorkflow).toContain('google-github-actions/auth@v2');
    expect(runWorkflow).toContain('workload_identity_provider: ${{ vars.GCP_WIF_PROVIDER }}');
    expect(runWorkflow).toContain('service_account: ${{ vars.GCP_SERVICE_ACCOUNT }}');
    expect(runWorkflow).not.toMatch(/credentials_json:|secrets\.FIREBASE_SA/);
  });

  it('requests the id-token permission WIF needs', () => {
    expect(runWorkflow).toMatch(/id-token: write/);
  });

  it('binds credentials to a GitHub Environment chosen by the target env input', () => {
    // The environment name — not a runtime pick between two secrets — is what
    // decides which project's credential the job holds.
    expect(runWorkflow).toMatch(/environment: \$\{\{ inputs\.env ==/);
  });

  it('serializes runs per environment and never cancels one mid-flight', () => {
    // A half-applied backfill leaves no marker and an unknown data state.
    expect(runWorkflow).toContain('group: backfill-${{ inputs.env }}');
    expect(runWorkflow).toContain('cancel-in-progress: false');
  });
});

describe('registry coverage lint invariant', () => {
  it('runs the warn-only coverage lint in CI', () => {
    expect(ciWorkflow).toContain('pnpm backfills:lint');
  });
});

describe('set-app-version endpoint invariant', () => {
  // config/appVersion is the force-update gate clients read on launch. It is
  // the one release step that is neither a code deploy nor a data migration, so
  // without this endpoint a release cannot be cut without local credentials.
  it('is manually dispatchable with env, latest, min_supported and mode inputs', () => {
    expect(appVersionWorkflow).toContain('workflow_dispatch');
    for (const input of ['      env:', '      latest:', '      min_supported:', '      mode:']) {
      expect(appVersionWorkflow).toContain(input);
    }
  });

  it('defaults to dry-run and only writes when mode is explicitly apply', () => {
    expect(appVersionWorkflow).toMatch(/default: dry-run/);
    const applyStep = appVersionWorkflow.split(/^ {6}- name:/m).find((b) => b.includes('--confirm'));
    expect(applyStep, 'apply step not found').toBeDefined();
    expect(applyStep).toMatch(/if:\s*inputs\.mode == 'apply'/);
  });

  it('always previews before writing', () => {
    const dryPos = appVersionWorkflow.indexOf('--dry-run');
    const applyPos = appVersionWorkflow.indexOf('--confirm');
    expect(dryPos).toBeGreaterThanOrEqual(0);
    expect(dryPos).toBeLessThan(applyPos);
  });

  it('authenticates keylessly via WIF, never a stored SA key', () => {
    expect(appVersionWorkflow).toContain('workload_identity_provider: ${{ vars.GCP_WIF_PROVIDER }}');
    expect(appVersionWorkflow).toContain('service_account: ${{ vars.GCP_SERVICE_ACCOUNT }}');
    expect(appVersionWorkflow).not.toMatch(/credentials_json:|secrets\.FIREBASE_SA/);
    expect(appVersionWorkflow).toMatch(/id-token: write/);
  });

  it('serializes runs per environment and never cancels one mid-flight', () => {
    expect(appVersionWorkflow).toContain('group: app-version-${{ inputs.env }}');
    expect(appVersionWorkflow).toContain('cancel-in-progress: false');
  });

  it('omits a blank input rather than passing an empty flag value', () => {
    // `--latest=` would be parsed as an explicit empty version. The ${VAR:+...}
    // form drops the flag entirely when the input is blank.
    expect(appVersionWorkflow).toContain('${LATEST:+--latest="$LATEST"}');
    expect(appVersionWorkflow).toContain('${MIN:+--min="$MIN"}');
  });
});

// `config/appVersion` drives the in-app update nudge and the force-update wall.
// The deploy keeps the doc well-formed on every env, but moves NEITHER value:
// `latest` is the announce poller's (it asks the stores), and the wall is the
// poller's or a deliberate "Set App Version" dispatch. A deploy announcing its
// own version is what nudged every iOS user on 1.2.2 towards a 1.3.0 no store
// had. See docs/decisions/announce-when-live-poller.md.
describe('config/appVersion refresh on deploy', () => {
  // Resolved lazily, per test: `stepBlockContaining` throws when the step is
  // gone, and at describe-body scope that aborts collection of the whole FILE —
  // reporting "no tests" and taking the other 25 invariants down with it,
  // instead of naming the one thing that broke.
  const step = () => stepBlockContaining(deployWorkflow, 'seed-app-version-config.mjs');

  it('refreshes the doc as part of every deploy', () => {
    expect(deployWorkflow).toContain('node scripts/seed-app-version-config.mjs');
    expect(step()).toContain('--env=${{ inputs.firebase_alias }}');
  });

  // THE load-bearing one. `minSupported` is the force-update wall: raising it
  // locks every older client out of the app. Omitting `--min` makes the script
  // preserve whatever is stored, so a routine merge cannot wall off the fleet.
  // Moving the wall stays a deliberate "Set App Version" dispatch.
  it('never passes --min, so a deploy cannot move the force-update wall', () => {
    expect(step()).not.toMatch(/--min[=\s]/);
  });

  // Omitting --latest PRESERVES the stored value. The deploy cannot know what a
  // store serves; the announce poller asks the store and moves it.
  it('never passes --latest, so a deploy cannot announce a version', () => {
    expect(step()).not.toMatch(/--latest[=\s]/);
  });

  it('runs only after the deploy steps, never before them', () => {
    const announce = deployWorkflow.indexOf('seed-app-version-config.mjs');
    for (const deployStep of [
      'firebase deploy --only firestore:rules',
      'firebase deploy --only functions',
      'firebase deploy --only hosting',
    ]) {
      expect(
        deployWorkflow.indexOf(deployStep),
        `announcement must follow "${deployStep}"`,
      ).toBeLessThan(announce);
    }
  });

  // The script refuses to write beta/prod without it, so a missing --confirm
  // would fail every promotion at the very last step.
  it('passes --confirm, which beta and prod require', () => {
    expect(step()).toContain('--confirm');
  });

  it('is not a dry run', () => {
    expect(step()).not.toContain('--dry-run');
  });
});

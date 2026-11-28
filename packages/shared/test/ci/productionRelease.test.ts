import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Merging `beta -> main` ships production with no second dispatch (decided by
// the user 2026-10-06; docs/decisions/production-auto-release.md). The human gate
// is that merge, so what follows it must be exactly what this file pins: the
// right package and track, only on a real version change, only after the prod
// backend is live, and always stoppable without disabling the workflow.

const repoRoot = resolve(__dirname, '../../../..');
const wf = readFileSync(resolve(repoRoot, '.github/workflows/production-release.yml'), 'utf8');
const script = readFileSync(resolve(repoRoot, 'scripts/production-release-plan.mjs'), 'utf8');
const deployProd = readFileSync(resolve(repoRoot, '.github/workflows/deploy-prod.yml'), 'utf8');
const appConfig = readFileSync(resolve(repoRoot, 'apps/mobile/app.config.ts'), 'utf8');
const mobilePackage = JSON.parse(
  readFileSync(resolve(repoRoot, 'apps/mobile/package.json'), 'utf8'),
) as { version: string };

function job(name: string): string {
  const start = wf.indexOf(`\n  ${name}:\n`);
  expect(start, `job ${name} missing`).toBeGreaterThan(-1);
  const next = wf.slice(start + 1).search(/\n {2}[\w-]+:\n/);
  return next === -1 ? wf.slice(start) : wf.slice(start, start + 1 + next);
}

describe('production-release workflow', () => {
  it('runs on push to main only', () => {
    const triggers = wf.slice(wf.indexOf('\non:'), wf.indexOf('\njobs:'));
    expect(triggers).toMatch(/push:\s*\n\s*branches:\s*\[main\]/);
    expect(triggers).not.toContain('pull_request');
    expect(triggers).not.toContain('beta');
  });

  // The Production environment's branch policy is about deploys; naming it here
  // would also make every secret lookup depend on it. The one exception writes
  // prod Firestore (the announce poller's Android versionCode), and WIF's
  // variables live on that environment.
  it('scopes no store or OTA job to a GitHub environment', () => {
    const scoped = [...wf.matchAll(/^\s*environment:\s*(\S+)/gm)];
    expect(scoped.map((m) => m[1])).toEqual(['production']);
    expect(job('record-android-build')).toContain('environment: production');
    for (const name of ['plan', 'backend', 'ota', 'android', 'ios']) {
      expect(job(name)).not.toMatch(/^\s*environment:/m);
    }
  });

  // The decisions themselves — version change, preconditions, every kill-switch,
  // the Play freeze, the OTA paths — are scripts/production-release-plan.mjs,
  // and its case table (scripts/__tests__/production-release-plan.test.mjs) is
  // what pins each branch. Here: that the workflow hands it the facts and
  // exposes what it decides.
  it('plans with the tested script, fed every fact and switch through env', () => {
    const plan = job('plan');
    expect(plan).toContain('fetch-depth: 0');
    expect(plan).toContain('run: node scripts/production-release-plan.mjs plan');
    expect(plan).toContain('BEFORE: ${{ github.event.before }}');
    expect(plan).toContain('COMMIT_MESSAGE: ${{ github.event.head_commit.message }}');
    for (const v of ['STORE_RELEASE_PAUSED', 'PROD_OTA_PAUSED', 'PLAY_SUBMIT_PAUSED']) {
      expect(plan).toContain(`${v}: \${{ vars.${v} }}`);
    }
    // A dropped output would skip that job on every release, silently.
    for (const out of ['store', 'android', 'ota']) {
      expect(plan).toContain(`${out}: \${{ steps.plan.outputs.${out} }}`);
    }
    // The jobs install nothing, so the script may import only Node built-ins
    // and scripts/lib/.
    const imports = [...script.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const from of imports) expect(from).toMatch(/^(node:|\.\/lib\/)/);
  });

  // The plan decides on package.json; the iOS submit picks its build by
  // app.config.ts. If they ever disagree, Android and iOS release different
  // versions — so the plan refuses, and this keeps the repo from getting there.
  it('reads the same version the iOS submit will use', () => {
    const configVersion = /^ {2}version: '([^']+)',$/m.exec(appConfig)?.[1];
    expect(configVersion).toBe(mobilePackage.version);
    expect(script).toContain("readFileSync('apps/mobile/app.config.ts'");
    expect(script).toContain('`${rev}:apps/mobile/package.json`');
  });

  it('waits for the backend with the tested script', () => {
    const backend = job('backend');
    expect(backend).toContain('uses: actions/checkout@v5');
    expect(backend).toContain('run: node scripts/production-release-plan.mjs wait-backend');
    expect(backend).toContain('GH_TOKEN: ${{ github.token }}');
    expect(backend.indexOf('actions/checkout')).toBeLessThan(backend.indexOf('wait-backend'));
  });

  it('honours the Play freeze again when the android job starts', () => {
    // The freeze is read again when the job starts, up to two hours after the
    // plan, so flipping it mid-run still holds Play.
    expect(job('android')).toContain(
      "if: ${{ needs.plan.outputs.android == 'true' && vars.PLAY_SUBMIT_PAUSED != 'true' }}",
    );
    // A freeze flipped mid-run skips Android after the plan promised it, so
    // `play-freeze` warns and corrects the summary on that run. It must survive
    // the skipped job it reports on (`!cancelled()`), and fire only when the
    // plan said Android ships and the job then did not run.
    const freeze = job('play-freeze');
    expect(freeze).toMatch(/needs:\s*\[plan, android\]/);
    expect(freeze).toContain(
      "if: ${{ !cancelled() && needs.plan.outputs.android == 'true' && needs.android.result == 'skipped' && vars.PLAY_SUBMIT_PAUSED == 'true' }}",
    );
    expect(freeze).toMatch(/::warning::PLAY_SUBMIT_PAUSED=true/);
    expect(freeze).toContain('- Android: **false**');
    expect(freeze).toContain('>> "$GITHUB_STEP_SUMMARY"');
    // A Play freeze must not freeze the App Store (the 2026-09-14 lesson): iOS
    // keys off `store`, never off the Play-aware `android` output.
    expect(job('ios')).not.toContain('PLAY_SUBMIT_PAUSED');
    expect(job('ios')).toContain("if: ${{ needs.plan.outputs.store == 'true' }}");
  });

  // An app talking to a callable the prod deploy has not shipped — or that a
  // conformance/backfill gate blocked — is broken, not early.
  it('ships nothing to users before the prod backend deploy is green', () => {
    for (const name of ['ota', 'ios']) {
      expect(job(name)).toMatch(/needs:\s*\[plan, backend\]/);
    }
  });

  // Play gets a 100% release only the Play Console can halt; the iOS submit is
  // what proves a processed TestFlight build of this version exists. Android
  // waits for it, so a failed iOS release never leaves the stores split.
  it('builds Android only after the iOS submit succeeded', () => {
    expect(job('android')).toMatch(/needs:\s*\[plan, backend, ios\]/);
  });

  // The wait keys off these names; renaming either one silently turns it
  // into a 60-minute timeout on every release.
  it('matches the names Deploy prod actually uses', () => {
    expect(deployProd).toMatch(/^name: Deploy prod$/m);
    expect(deployProd).toMatch(/\n {2}deploy:\n/);
    expect(script).toContain("export const DEPLOY_WORKFLOW = 'Deploy prod';");
    expect(script).toContain("export const DEPLOY_JOB_PREFIX = 'deploy / ';");
  });

  it('builds the production package and submits it to the Play production track', () => {
    const android = job('android');
    expect(android).toMatch(/eas build[\s\\]*--profile production[\s\\]*--platform android/);
    expect(android).toContain('--auto-submit-with-profile production');
    expect(android).not.toMatch(/--profile beta\b/);
    expect(android).toMatch(/if: always\(\)[\s\S]*rm -f apps\/mobile\/google-play-service-account\.json/);
  });

  // Play's "What's new" is the same CHANGELOG text the App Store gets, set on
  // the release EAS just submitted (matched by its versionCode). It runs after
  // the binary shipped, so it may not fail the job: that would skip
  // record-android-build, which the announce poller needs.
  it('sets the Play release notes after the submit, without failing the job', () => {
    const android = job('android');
    const notes = android.slice(android.indexOf('- name: Set the Play release notes'));
    expect(notes).toContain(
      'node scripts/push-play-release-notes.mjs --profile production --version-code="${VERSION_CODE}" --apply',
    );
    expect(notes).toMatch(/continue-on-error: true/);
    expect(notes).toContain('VERSION_CODE: ${{ steps.built.outputs.version_code }}');
    expect(notes).toContain('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: ${{ secrets.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON }}');
    expect(android.indexOf('Read the built versionCode')).toBeLessThan(android.indexOf('Set the Play release notes'));
  });

  // iOS production ships the binary testers ran: no rebuild, the newest
  // TestFlight build of the app.config version goes to App Review.
  it('submits the tested TestFlight build for App Store review without rebuilding', () => {
    const ios = job('ios');
    expect(ios).toContain('node scripts/appstore-release.mjs submit --apply');
    expect(ios).not.toContain('--build-number');
    expect(ios).not.toContain('eas build');
  });

  it('publishes the production OTA through mobile-ota.yml', () => {
    const ota = job('ota');
    expect(ota).toContain('uses: ./.github/workflows/mobile-ota.yml');
    expect(ota).toMatch(/channel: production/);
    // Only the one secret it needs, not every repo secret.
    expect(ota).toMatch(/secrets:\s*\n\s*EXPO_TOKEN: \$\{\{ secrets\.EXPO_TOKEN \}\}/);
    expect(ota).not.toContain('secrets: inherit');
  });
});

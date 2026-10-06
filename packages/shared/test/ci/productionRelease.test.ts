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
  // would also make every secret lookup depend on it.
  it('does not scope itself to a GitHub environment', () => {
    expect(wf).not.toMatch(/^\s*environment:/m);
  });

  // A re-deploy, or a hotfix merge without a bump, must never build a binary.
  it('ships binaries only when the app version changed since the previous main tip', () => {
    const plan = job('plan');
    expect(plan).toContain('fetch-depth: 0');
    expect(plan).toContain('github.event.before');
    expect(plan).toContain('apps/mobile/package.json');
    expect(plan).toMatch(/if \[ "\$\{version\}" = "\$\{previous\}" \]/);
  });

  // The plan decides on package.json; the iOS submit picks its build by
  // app.config.ts. If they ever disagree, Android and iOS release different
  // versions — so the workflow refuses, and this keeps the repo from getting there.
  it('reads the same version the iOS submit will use', () => {
    const configVersion = /^ {2}version: '([^']+)',$/m.exec(appConfig)?.[1];
    expect(configVersion).toBe(mobilePackage.version);
    expect(job('plan')).toContain('apps/mobile/app.config.ts');
    expect(job('plan')).toMatch(/if \[ "\$\{config_version\}" != "\$\{version\}" \]/);
  });

  // Everything the store jobs would otherwise find out only after a release
  // began is checked in `plan`: a fix commit does not bump the version, so a
  // half-shipped release would never re-run. Inside the store branch only, so a
  // kill-switch still lands a fix on main without a red run.
  it('checks store preconditions before anything ships, and only when binaries would', () => {
    const plan = job('plan');
    const gate = plan.indexOf('if [ "${store}" = "true" ]; then');
    expect(gate).toBeGreaterThan(-1);
    expect(plan.indexOf('config_version=')).toBeGreaterThan(gate);
    expect(plan.indexOf('extractReleaseNotes(')).toBeGreaterThan(gate);
    expect(plan).toContain('./scripts/lib/changelog-notes.mjs');
  });

  // [skip-deploy] means the prod backend for this commit was never deployed, so
  // no client may ship against it — and the backend wait would otherwise poll a
  // job that never runs.
  it('ships nothing on a [skip-deploy] merge, and never counts a skipped deploy as green', () => {
    expect(job('plan')).toContain('[skip-deploy]');
    const backend = job('backend');
    expect(backend).toContain('all(.conclusion == "success")');
    expect(backend).not.toContain('"skipped"');
  });

  it('honours every kill-switch', () => {
    const plan = job('plan');
    expect(plan).toContain('[skip-store]');
    expect(plan).toContain('[skip-ota]');
    expect(plan).toContain('vars.STORE_RELEASE_PAUSED');
    expect(plan).toContain('vars.PROD_OTA_PAUSED');
    // Each switch must sit in its own decision, or a swap would make
    // STORE_RELEASE_PAUSED stop OTAs and leave binaries shipping.
    const storeOut = plan.indexOf('echo "store=${store}"');
    const otaOut = plan.indexOf('echo "ota=${ota}"');
    const storeSwitch = plan.indexOf('"${STORE_RELEASE_PAUSED}" = "true"');
    const otaSwitch = plan.indexOf('"${PROD_OTA_PAUSED}" = "true"');
    expect(storeSwitch).toBeGreaterThan(-1);
    expect(storeSwitch).toBeLessThan(storeOut);
    expect(otaSwitch).toBeGreaterThan(storeOut);
    expect(otaSwitch).toBeLessThan(otaOut);
    expect(plan.indexOf('[skip-store]')).toBeLessThan(storeOut);
    expect(plan.indexOf('[skip-ota]')).toBeGreaterThan(storeOut);
    // The Play freeze is decided in `plan`, so a release iOS ships alone is
    // reported (summary + warning) on the run that split the stores.
    expect(plan).toContain('PLAY_SUBMIT_PAUSED: ${{ vars.PLAY_SUBMIT_PAUSED }}');
    // Android inherits every store decision ([skip-deploy], [skip-store],
    // STORE_RELEASE_PAUSED, an unchanged version) and only then the Play
    // freeze; a dropped output would skip Android on every release, silently.
    expect(plan).toContain('android: ${{ steps.plan.outputs.android }}');
    expect(plan).toMatch(/^\s*android="\$\{store\}"$/m);
    expect(plan).toContain('echo "android=${android}" >> "$GITHUB_OUTPUT"');
    expect(plan.indexOf('android="${store}"')).toBeGreaterThan(storeOut);
    expect(plan).toMatch(/::warning::PLAY_SUBMIT_PAUSED=true/);
    expect(plan).toContain('echo "- Android: **${android}**');
    // Warn only when binaries would ship at all, or every hotfix push cries wolf.
    expect(plan).toContain('if [ "${store}" = "true" ] && [ "${PLAY_SUBMIT_PAUSED}" = "true" ]; then');
    // …and the freeze is read again when the job starts, up to two hours later,
    // so flipping it mid-run still holds Play.
    expect(job('android')).toContain(
      "if: ${{ needs.plan.outputs.android == 'true' && vars.PLAY_SUBMIT_PAUSED != 'true' }}",
    );
    // A Play freeze must not freeze the App Store (the 2026-09-14 lesson): iOS
    // keys off `store`, never off the Play-aware `android` output.
    expect(job('ios')).not.toContain('PLAY_SUBMIT_PAUSED');
    expect(job('ios')).toContain("if: ${{ needs.plan.outputs.store == 'true' }}");
  });

  // An app talking to a callable the prod deploy has not shipped — or that a
  // conformance/backfill gate blocked — is broken, not early.
  it('ships nothing to users before the prod backend deploy is green', () => {
    const backend = job('backend');
    expect(backend).toContain('select(.name == "Deploy prod")');
    expect(backend).toContain('startswith("deploy / ")');
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

  // The wait above keys off these names; renaming either one silently turns it
  // into a 60-minute timeout on every release.
  it('matches the names Deploy prod actually uses', () => {
    expect(deployProd).toMatch(/^name: Deploy prod$/m);
    expect(deployProd).toMatch(/\n {2}deploy:\n/);
  });

  it('builds the production package and submits it to the Play production track', () => {
    const android = job('android');
    expect(android).toMatch(/eas build[\s\\]*--profile production[\s\\]*--platform android/);
    expect(android).toContain('--auto-submit-with-profile production');
    expect(android).not.toMatch(/--profile beta\b/);
    expect(android).toMatch(/if: always\(\)[\s\S]*rm -f apps\/mobile\/google-play-service-account\.json/);
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

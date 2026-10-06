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
    expect(job('android')).toContain("vars.PLAY_SUBMIT_PAUSED != 'true'");
    // A Play freeze must not freeze the App Store (the 2026-09-14 lesson).
    expect(job('ios')).not.toContain('PLAY_SUBMIT_PAUSED');
  });

  // An app talking to a callable the prod deploy has not shipped — or that a
  // conformance/backfill gate blocked — is broken, not early.
  it('ships nothing to users before the prod backend deploy is green', () => {
    const backend = job('backend');
    expect(backend).toContain('select(.name == "Deploy prod")');
    expect(backend).toContain('startswith("deploy / ")');
    for (const name of ['ota', 'android', 'ios']) {
      expect(job(name)).toMatch(/needs:\s*\[plan, backend\]/);
    }
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
    expect(ota).toContain('secrets: inherit');
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// OTA updates exist so a JS-only fix reaches apps that are ALREADY INSTALLED.
// The motivating incident: `DetailInfoCard`'s `h-full` broke every entity detail
// screen on native, the fix merged the same day, and it still could not reach a
// single user — the newest binary was four days old, there was no update
// channel, and `mobile-release` could not submit.
//
// Invariant tests in the spirit of storeRelease.test.ts / conformanceGate.test.ts:
// they fail the build if the arrangement is quietly undone.

const repoRoot = resolve(__dirname, '../../../..');
const appConfig = readFileSync(resolve(repoRoot, 'apps/mobile/app.config.ts'), 'utf8');
const workflowsDir = resolve(repoRoot, '.github/workflows');
const otaWorkflow = readFileSync(resolve(workflowsDir, 'mobile-ota.yml'), 'utf8');
const prodReleaseWorkflow = readFileSync(resolve(workflowsDir, 'production-release.yml'), 'utf8');
// Resolve from the app, where @expo/fingerprint and the config actually live.
const appRequire = createRequire(resolve(repoRoot, 'apps/mobile/package.json'));
const easJson = JSON.parse(
  readFileSync(resolve(repoRoot, 'apps/mobile/eas.json'), 'utf8'),
) as { build: Record<string, { channel?: string } | undefined> };

describe('OTA update wiring', () => {
  // THE load-bearing one. `appVersion` ties an update to the marketing version,
  // and AGENTS.md mandates a MINOR bump on every develop -> beta promotion — so
  // that policy would strand every update against the binaries already out
  // there, silently reproducing the exact problem OTA was added to solve.
  it('uses the fingerprint runtime-version policy, never appVersion', () => {
    expect(appConfig).toMatch(/runtimeVersion:\s*\{\s*policy:\s*'fingerprint'/);
    expect(appConfig).not.toMatch(/policy:\s*'appVersion'/);
    expect(appConfig).not.toMatch(/policy:\s*'sdkVersion'/);
  });

  it('declares an update URL for the EAS project', () => {
    expect(appConfig).toMatch(/updates:\s*\{[\s\S]*?url:\s*'https:\/\/u\.expo\.dev\//);
  });

  // A blocking check would hold the splash screen on a slow network; the update
  // is meant to land on the next launch instead.
  it('never blocks launch waiting for an update', () => {
    expect(appConfig).toMatch(/fallbackToCacheTimeout:\s*0/);
  });

  // Every build profile must name the channel it receives, or a binary silently
  // subscribes to nothing and OTA appears to work while reaching no one.
  it('maps every non-development build profile to a channel', () => {
    for (const profile of ['preview-dev', 'beta', 'production']) {
      expect(easJson.build[profile]?.channel, `${profile} has no channel`).toBeTruthy();
    }
  });

  // An update replaces the binary's app config, extra.firebaseConfig included.
  // Without --environment no EAS variable is loaded and the update ships an
  // empty Firebase config — every update up to 1.4.1 did exactly that.
  it('loads the EAS environment matching the channel it publishes to', () => {
    expect(otaWorkflow).toContain(
      "--environment \"${{ inputs.channel == 'production' && 'production' || 'preview' }}\"",
    );
  });

  it('loads the channel from inputs, so a workflow_call caller can choose it', () => {
    expect(otaWorkflow).toMatch(/workflow_call:\s*\n\s*inputs:\s*\n\s*channel:/);
    expect(otaWorkflow).not.toContain('github.event.inputs.channel');
  });

  it('publishes on its own push trigger for beta only', () => {
    expect(otaWorkflow).toMatch(/push:\s*\n\s*branches:\s*\[beta\]/);
    expect(otaWorkflow).not.toMatch(/branches:\s*\[[^\]]*main/);
  });

  // Production went automatic on 2026-10-06 (docs/decisions/production-auto-release.md):
  // a push to main publishes to `production` through this same workflow, after
  // the prod backend deploy is green.
  it('publishes to production on a push to main, after the backend deploy', () => {
    expect(prodReleaseWorkflow).toMatch(/on:\s*\n\s*push:\s*\n\s*branches:\s*\[main\]/);
    const ota = prodReleaseWorkflow.slice(prodReleaseWorkflow.indexOf('\n  ota:'));
    expect(ota).toMatch(/needs:\s*\[plan, backend\]/);
    expect(ota).toContain('uses: ./.github/workflows/mobile-ota.yml');
    expect(ota).toMatch(/with:\s*\n\s*channel: production/);
  });

  it('skips the production OTA when a push only touches docs or workflows', () => {
    expect(prodReleaseWorkflow).toContain("grep -Ev '^(docs/|\\.github/)|\\.md$'");
  });
});

// The fingerprint IS the runtime version: an update reaches a binary only when
// both hash identically. Two things used to make that impossible for any update
// published from a release commit (measured 2026-09-15): the default sourceSkips
// hash the marketing `version`, which every promotion bumps, and CI patched the
// fingerprinted eas.json before `eas build` uploaded the project.
describe('fingerprint survives a release', () => {
  const fingerprint = appRequire('@expo/fingerprint') as { SourceSkips: Record<string, number> };
  const config = appRequire('./fingerprint.config.js') as { sourceSkips: string[] };

  it('skips the app versions', () => {
    expect(config.sourceSkips).toContain('ExpoConfigVersions');
  });

  // Overriding sourceSkips replaces the library default rather than extending it.
  it('keeps the library default skip', () => {
    expect(config.sourceSkips).toContain('PackageJsonAndroidAndIosScriptsIfNotContainRun');
  });

  // @expo/fingerprint drops an unknown name without a word, which would put the
  // version back into the hash silently after a rename upstream.
  it('names only skips the installed @expo/fingerprint knows', () => {
    for (const name of config.sourceSkips) {
      expect(typeof fingerprint.SourceSkips[name], `unknown SourceSkips "${name}"`).toBe('number');
    }
  });

  // Every job that edits apps/mobile/eas.json must do it after its `eas build`
  // has uploaded the project, so the build hashes the committed file.
  const workflows = readdirSync(workflowsDir).filter((f) => f.endsWith('.yml'));
  it.each(workflows)('%s never edits eas.json before eas build', (file) => {
    const source = readFileSync(resolve(workflowsDir, file), 'utf8');
    const jobs = source.split(/\n {2}(?=[\w-]+:\s*\n)/);
    for (const job of jobs) {
      // Any mention of the file by its repo path is a write: steps run from the
      // repo root, and nothing else in a workflow has reason to name it.
      const write = job.indexOf('apps/mobile/eas.json');
      const build = job.indexOf('eas build');
      if (write === -1 || build === -1) continue;
      expect(build, `${file}: eas.json is touched before eas build`).toBeLessThan(write);
    }
  });
});

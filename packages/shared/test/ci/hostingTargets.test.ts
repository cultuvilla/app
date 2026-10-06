import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// This repo deploys one hosting target, `app` (the read site's static files, on all three
// envs). The dev project also hosts a second site, `cultuvilla-panel`, which the
// private cultuvilla/business repo deploys from its own firebase.json. Naming the
// target keeps the two repos from ever deploying over each other's site.
//
// Every deploy path must therefore name its target explicitly. This test fails
// the build if any of them regresses to a bare `--only hosting`.

const repoRoot = resolve(__dirname, '../../../..');
const read = (path: string): string => readFileSync(resolve(repoRoot, path), 'utf-8');

describe('hosting deploys name their target', () => {
  // Comment lines are stripped before matching: the workflow explains this very
  // rule in prose, and prose about a bare `--only hosting` must not trip the
  // check that forbids running one.
  const runnableLines = (yaml: string): string =>
    yaml
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');

  it('the reusable deploy workflow deploys hosting:app, never bare hosting', () => {
    const workflow = runnableLines(read('.github/workflows/deploy-firebase.yml'));
    expect(workflow).toContain('--only hosting:app');
    expect(workflow).not.toMatch(/--only hosting(?![:\w])/);
  });

  it('every package.json hosting deploy script names a target', () => {
    const pkg = read('package.json');
    const bare = [...pkg.matchAll(/--only hosting(?![:\w])/g)];
    expect(bare).toHaveLength(0);
  });

  it('declares only the app target, as an array', () => {
    const config = JSON.parse(read('firebase.json')) as { hosting: { target?: string; public: string }[] };
    expect(Array.isArray(config.hosting)).toBe(true);
    expect(config.hosting.map((h) => [h.target, h.public])).toEqual([['app', 'web/dist']]);
  });

  it('maps app on all three projects, and never the business repo\'s panel site', () => {
    // Values typed as possibly-absent on purpose: a project missing from
    // `.firebaserc` is exactly what these assertions are here to catch.
    const rc = JSON.parse(read('.firebaserc')) as {
      targets: Record<string, { hosting: Record<string, string[] | undefined> } | undefined>;
    };
    for (const project of ['villa-events', 'cultuvilla-beta', 'cultuvilla-prod']) {
      expect(Object.keys(rc.targets[project]?.hosting ?? {})).toEqual(['app']);
    }
  });
});

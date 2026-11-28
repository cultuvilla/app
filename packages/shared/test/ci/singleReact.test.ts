import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Two Reacts in one jest run fail mobile suites at random with "Invalid hook
// call": a hook from @cultuvilla/shared resolved react@19.1.0 (its own
// `^19.1.0` devDependency) under react-test-renderer's 19.2.3. In a Metro
// bundle the same split is a crash on device. The root `pnpm.overrides`
// pins every importer to one React; this fails if a second one comes back.

const repoRoot = resolve(__dirname, '../../../..');
const lockfile = readFileSync(resolve(repoRoot, 'pnpm-lock.yaml'), 'utf8');
const rootPkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
  pnpm?: { overrides?: Record<string, string> };
};
const mobilePkg = JSON.parse(
  readFileSync(resolve(repoRoot, 'apps/mobile/package.json'), 'utf8'),
) as { dependencies: Record<string, string> };

function lockedVersions(name: string): string[] {
  const re = new RegExp(`^  ${name}@([^:(\\s]+):$`, 'gm');
  return [...new Set([...lockfile.matchAll(re)].map((m) => m[1]))];
}

describe('one React in the dependency tree', () => {
  it('locks exactly one react version', () => {
    expect(lockedVersions('react')).toEqual([mobilePkg.dependencies.react]);
  });

  it('pins react through the root override to the version the app declares', () => {
    expect(rootPkg.pnpm?.overrides?.react).toBe(mobilePkg.dependencies.react);
  });
});

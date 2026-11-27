import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// vitest strips types with esbuild and never checks them, so a test fixture
// can drift from the model it fakes — a GeoPoint where the schema says
// { lat, lng }, a status the enum no longer has — and still pass. The shared
// build's tsconfig includes only `src` (it emits the published package), so
// `pnpm typecheck` checks the tests through a second config,
// tsconfig.test.json. These pins fail if that second pass is dropped.

const sharedRoot = resolve(__dirname, '../..');
const repoRoot = resolve(sharedRoot, '../..');

interface PackageJson {
  scripts: Record<string, string>;
}
interface TsConfig {
  include: string[];
  compilerOptions?: { noEmit?: boolean };
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf-8'));

describe('shared tests are type-checked', () => {
  it('pnpm typecheck runs the shared package typecheck', () => {
    const root = readJson(resolve(repoRoot, 'package.json')) as PackageJson;
    expect(root.scripts.typecheck).toContain('pnpm shared:typecheck');
    expect(root.scripts['shared:typecheck']).toBe('pnpm --filter @cultuvilla/shared typecheck');
  });

  it('the shared typecheck checks both the build and the tests', () => {
    const shared = readJson(resolve(sharedRoot, 'package.json')) as PackageJson;
    expect(shared.scripts.typecheck).toContain('tsc --noEmit');
    expect(shared.scripts.typecheck).toContain('tsc -p tsconfig.test.json');
  });

  it('the test config covers test/ and emits nothing, while the build stays src-only', () => {
    const test = readJson(resolve(sharedRoot, 'tsconfig.test.json')) as TsConfig;
    expect(test.include).toContain('test');
    expect(test.compilerOptions?.noEmit).toBe(true);

    const build = readJson(resolve(sharedRoot, 'tsconfig.json')) as TsConfig;
    expect(build.include).toEqual(['src']);
  });
});

// Ratchet on escape-hatch casts in the shared tests. A cast hides exactly the
// drift the type check exists to catch, so each one is replaced by a typed
// fixture over time. The count may only go down: lower BASELINE when it does.
const BASELINE = 105;
const CAST = /\bas any\b|\bas unknown as\b/g;
const SELF = resolve(__filename);

function testFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return testFiles(path);
    return /\.tsx?$/.test(entry.name) && path !== SELF ? [path] : [];
  });
}

describe('escape-hatch casts in shared tests', () => {
  it('only go down', () => {
    const count = testFiles(resolve(sharedRoot, 'test')).reduce(
      (n, file) => n + (readFileSync(file, 'utf-8').match(CAST)?.length ?? 0),
      0,
    );
    if (count > BASELINE) {
      expect.fail(
        `${String(count)} \`as any\` / \`as unknown as\` casts in packages/shared/test, above the ` +
          `baseline of ${String(BASELINE)}. Type the fixture instead of casting it.`,
      );
    }
    if (count < BASELINE) {
      expect.fail(
        `Casts went down to ${String(count)}. Lower BASELINE in ` +
          `packages/shared/test/ci/sharedTestTypecheck.test.ts to ${String(count)} to lock it in.`,
      );
    }
  });
});

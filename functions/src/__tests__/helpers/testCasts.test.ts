import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Ratchet on escape-hatch casts in the functions tests. `pnpm typecheck` checks
// them (tsconfig.test.json), but a cast hides exactly the drift that check
// exists to catch — a fixture that no longer matches the model, a request the
// handler no longer accepts. Each one is replaced by a typed fixture or a typed
// test bridge over time. The count may only go down: lower BASELINE when it does.
// packages/shared/test/ci/sharedTestTypecheck.test.ts is the same ratchet there.
// What is left is the boundary: hand-built Express req/res fakes for HTTP
// handlers, hand-built trigger events, and one deliberately malformed payload.
// A callable goes through helpers/functionsTest.ts, never a cast.
const BASELINE = 9;
const CAST = /\bas any\b|\bas unknown as\b/g;
const TESTS_ROOT = resolve(__dirname, '..');
const SELF = resolve(__filename);

function testFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return testFiles(path);
    return /\.tsx?$/.test(entry.name) && path !== SELF ? [path] : [];
  });
}

describe('escape-hatch casts in functions tests', () => {
  it('only go down', () => {
    const count = testFiles(TESTS_ROOT).reduce(
      (n, file) => n + (readFileSync(file, 'utf-8').match(CAST)?.length ?? 0),
      0,
    );
    if (count > BASELINE) {
      expect.fail(
        `${String(count)} \`as any\` / \`as unknown as\` casts in functions/src/__tests__, above the ` +
          `baseline of ${String(BASELINE)}. Type the fixture instead of casting it.`,
      );
    }
    if (count < BASELINE) {
      expect.fail(
        `Casts went down to ${String(count)}. Lower BASELINE in ` +
          `functions/src/__tests__/helpers/testCasts.test.ts to ${String(count)} to lock it in.`,
      );
    }
  });
});

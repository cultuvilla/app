#!/usr/bin/env node
/**
 * check-beta-version-bump.mjs
 *
 * CI gate for `develop → beta` promotion PRs: fail unless the PR's marketing
 * version is strictly greater than the one currently on `beta`. Enforces the
 * "bump the version on every beta promotion" rule (see AGENTS.md → Versioning &
 * releases; `pnpm release:cut` does the bump).
 *
 * USAGE
 *   node scripts/check-beta-version-bump.mjs <headAppConfigPath> <betaAppConfigPath>
 *
 * Both paths point at an `apps/mobile/app.config.ts`. The workflow materializes
 * beta's copy via `git show origin/beta:apps/mobile/app.config.ts`.
 */

import { readVersionFrom } from './lib/app-version.mjs';

/** -1 | 0 | 1, comparing MAJOR.MINOR.PATCH numerically. */
function compareVersions(a, b) {
  const parse = (v) => {
    const parts = v.split('.').map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
      throw new Error(`Invalid semver: "${v}"`);
    }
    return parts;
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

const [headPath, betaPath] = process.argv.slice(2);
if (!headPath || !betaPath) {
  console.error('Usage: check-beta-version-bump.mjs <headAppConfigPath> <betaAppConfigPath>');
  process.exit(2);
}

const head = readVersionFrom(headPath);
const beta = readVersionFrom(betaPath);

if (compareVersions(head, beta) <= 0) {
  console.error(
    `❌ Version must increase for a beta promotion.\n` +
      `   beta is ${beta}, this PR is ${head}.\n` +
      `   Bump apps/mobile/app.config.ts (+ apps/mobile/package.json) — cut releases with \`pnpm release:cut\`.`,
  );
  process.exit(1);
}

console.log(`✅ Version bump OK: ${beta} → ${head}`);

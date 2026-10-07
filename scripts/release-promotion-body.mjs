#!/usr/bin/env node
/**
 * Print the version and the body of the `beta → main` promotion PR for a
 * checkout of beta (promote-to-main.yml). RUNS_JSON is `[{ name, url, conclusion }]`.
 *
 *   node scripts/release-promotion-body.mjs <beta checkout> --version   # prints X.Y.Z
 *   node scripts/release-promotion-body.mjs <beta checkout>             # prints the body
 *
 * The beta checkout is an argument because the workflow runs this script from
 * develop (workflow_run uses the default branch's files) against beta's data.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readVersionFrom } from './lib/app-version.mjs';
import { breakingSinceLastRelease } from './lib/breaking-rollup.mjs';
import { extractMigrations, promotionPrBody, versionSection } from './lib/release.mjs';

const [root = '.', flag] = process.argv.slice(2);
const version = readVersionFrom(path.join(root, 'apps/mobile/app.config.ts'));

if (flag === '--version') {
  process.stdout.write(`${version}\n`);
} else {
  const section = versionSection(readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version);
  const runs = JSON.parse(process.env.RUNS_JSON || '[]');
  // Needs the checkout's history and tags (fetch-depth 0): the same rollup the
  // prod deploy uses to decide the hold.
  const breaking = breakingSinceLastRelease({ version, cwd: root });
  process.stdout.write(promotionPrBody({ version, section, migrations: extractMigrations(section), runs, breaking }) + '\n');
}

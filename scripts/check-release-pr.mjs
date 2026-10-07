#!/usr/bin/env node
/**
 * CI gate for PRs into beta and main (version-gate.yml): which branch may open
 * one, and what it must be titled. See `releasePrProblems` in lib/release.mjs.
 *
 *   node scripts/check-release-pr.mjs --base=beta --head-ref=release/1.6.0 \
 *     --title="1.6.0" --head-config=apps/mobile/app.config.ts --base-config=<file>
 */

import { readVersionFrom } from './lib/app-version.mjs';
import { releasePrProblems } from './lib/release.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const m = /^--([a-z-]+)=([\s\S]*)$/.exec(arg);
    if (!m) throw new Error(`check-release-pr: unrecognised argument "${arg}"`);
    return [m[1], m[2]];
  }),
);
for (const name of ['base', 'head-ref', 'head-config', 'base-config']) {
  if (!args[name]) {
    console.error(`check-release-pr: --${name} is required`);
    process.exit(2);
  }
}

const problems = releasePrProblems({
  base: args.base,
  headRef: args['head-ref'],
  title: args.title ?? '',
  headVersion: readVersionFrom(args['head-config']),
  baseVersion: readVersionFrom(args['base-config']),
});

if (problems.length) {
  for (const p of problems) console.error(`❌ ${p}`);
  process.exit(1);
}
console.log(`✅ ${args['head-ref']} → ${args.base} is a valid release PR`);

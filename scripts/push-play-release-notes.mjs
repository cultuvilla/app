#!/usr/bin/env node
/**
 * Sets Google Play's "What's new" (es-ES) on a release EAS has just submitted,
 * from that version's CHANGELOG section — the same text the App Store gets
 * (scripts/lib/changelog-notes.mjs), cut to Play's 500 characters.
 *
 * production-release.yml runs it after the Play production submit, and
 * beta-build-and-submit.yml after the Cultuvilla Beta upload. It opens an
 * edit, patches the matching release's notes and commits; it never uploads,
 * promotes or releases anything. Dry run unless `--apply`.
 *
 *   node scripts/push-play-release-notes.mjs --profile production|beta
 *     [--version 1.14.0]     default: apps/mobile/package.json
 *     [--version-code 123]   match the release by it; default: by version name
 *     [--key-file sa.json]   default: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, then ADC
 *     [--attempts 10] [--apply]
 *
 * Read back what Play holds with `pnpm play:notes:show`.
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { extractReleaseNotes } from './lib/changelog-notes.mjs';
import {
  MAX_PLAY_NOTES,
  makePlayClient,
  playSubmitTarget,
  pushReleaseNotesWhenReady,
  resolvePlayCredential,
} from './lib/play.mjs';

const LANGUAGE = 'es-ES';

const { values: args } = parseArgs({
  options: {
    profile: { type: 'string' },
    version: { type: 'string' },
    'version-code': { type: 'string' },
    'key-file': { type: 'string' },
    attempts: { type: 'string', default: '10' },
    apply: { type: 'boolean', default: false },
  },
});

function fail(msg) {
  console.error(`push-play-release-notes: ${msg}`);
  process.exit(1);
}

try {
  if (!args.profile) fail('--profile <production|beta> is required (an eas.json submit profile)');
  const { packageName, track } = playSubmitTarget(args.profile, JSON.parse(readFileSync('apps/mobile/eas.json', 'utf8')));
  const version = args.version ?? JSON.parse(readFileSync('apps/mobile/package.json', 'utf8')).version;
  const versionCode = args['version-code'] || undefined;
  const text = extractReleaseNotes(readFileSync('CHANGELOG.md', 'utf8'), version, { max: MAX_PLAY_NOTES });

  console.log(`${packageName} ${track} — v${version}${versionCode ? ` (versionCode ${versionCode})` : ''}, ${LANGUAGE}, ${[...text].length} chars:`);
  console.log(text);
  if (!args.apply) {
    console.log('\n[dry run] nothing written; pass --apply to set these notes on Play.');
    process.exit(0);
  }

  const credential = resolvePlayCredential({ keyFile: args['key-file'] });
  if (!credential) fail('no Play credential: set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON or pass --key-file');
  const play = makePlayClient({ credential });
  await pushReleaseNotesWhenReady({
    play,
    packageName,
    track,
    version,
    versionCode,
    language: LANGUAGE,
    text,
    attempts: Number(args.attempts),
    log: (m) => console.log(m),
  });
} catch (err) {
  fail(err.message);
}

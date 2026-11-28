#!/usr/bin/env node
/**
 * Read-only: every release on a Google Play track, with its status, version
 * codes and "What's new" per language — what the Play Console shows. Use it to
 * confirm what scripts/push-play-release-notes.mjs wrote. It opens an edit to
 * read the track and deletes it uncommitted; it never writes.
 *
 *   pnpm play:notes:show --profile production|beta   (eas.json submit profile)
 *     [--version 1.14.0]   only that version's release
 *     [--track internal]   another track of the profile's app
 *     [--key-file sa.json] default: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, then ADC
 *
 * Auth and diagnosis: the verify-play-release-notes skill.
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { formatTrackRelease, makePlayClient, playSubmitTarget, resolvePlayCredential, versionNameRe } from './lib/play.mjs';

const { values: args } = parseArgs({
  options: {
    profile: { type: 'string', default: 'production' },
    track: { type: 'string' },
    version: { type: 'string' },
    'key-file': { type: 'string' },
  },
});

function fail(msg) {
  console.error(`show-play-release-notes: ${msg}`);
  process.exit(1);
}

try {
  const target = playSubmitTarget(args.profile, JSON.parse(readFileSync('apps/mobile/eas.json', 'utf8')));
  const track = args.track ?? target.track;
  const credential = resolvePlayCredential({ keyFile: args['key-file'] });
  if (!credential) fail('no Play credential: see the verify-play-release-notes skill for the ADC login');
  const play = makePlayClient({ credential });
  console.log(`auth: ${play.identity}`);

  const releases = (await play.getTrack(target.packageName, track)).releases ?? [];
  const shown = args.version ? releases.filter((r) => versionNameRe(args.version).test(String(r.name ?? ''))) : releases;
  console.log(`${target.packageName} ${track}: ${shown.length} release(s)${args.version ? ` named ${args.version}` : ''}`);
  shown.forEach((r, i) => console.log(`\n  [${i}]\n${formatTrackRelease(r)}`));
} catch (err) {
  fail(err.message);
}

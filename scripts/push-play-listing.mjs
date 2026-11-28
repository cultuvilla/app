#!/usr/bin/env node
/**
 * Pushes the es-ES store listing — title, short and full description — from
 * docs/store/listing-es-ES.md to Google Play. A manual command, never part of
 * a release: a listing change goes to Google's review by itself, and the
 * commit refuses to run while anything else is in review rather than cancel
 * that review. Dry run unless `--apply`; the dry run needs no credentials.
 *
 * The identity needs Play Console's «Manage store presence» permission, which
 * the release service account may not hold.
 *
 *   pnpm play:listing:push [--profile production|beta] [--key-file sa.json] [--apply]
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { makePlayClient, playSubmitTarget, resolvePlayCredential } from './lib/play.mjs';
import { DEFAULT_LISTING_DOC, loadStoreListing, validateStoreListing } from './lib/store-listing.mjs';

const LANGUAGE = 'es-ES';

const { values: args } = parseArgs({
  options: {
    profile: { type: 'string', default: 'production' },
    'key-file': { type: 'string' },
    apply: { type: 'boolean', default: false },
  },
});

function fail(msg) {
  console.error(`push-play-listing: ${msg}`);
  process.exit(1);
}

try {
  const { packageName } = playSubmitTarget(args.profile, JSON.parse(readFileSync('apps/mobile/eas.json', 'utf8')));
  const listing = loadStoreListing(DEFAULT_LISTING_DOC);
  const { errors } = validateStoreListing(listing);
  if (errors.length) fail(`${DEFAULT_LISTING_DOC}:\n  ${errors.join('\n  ')}`);
  const patch = { title: listing.name, shortDescription: listing.shortDescription, fullDescription: listing.fullDescription };

  console.log(`${packageName} ${LANGUAGE} listing:`);
  console.log(`  title: ${patch.title}`);
  console.log(`  shortDescription: ${patch.shortDescription}`);
  console.log(`  fullDescription (${[...patch.fullDescription].length} chars):\n${patch.fullDescription.replace(/^/gm, '    ')}`);
  if (!args.apply) {
    console.log('\n[dry run] nothing written; pass --apply to send this listing to Play.');
    process.exit(0);
  }

  const credential = resolvePlayCredential({ keyFile: args['key-file'] });
  if (!credential) fail('no Play credential: set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON or pass --key-file');
  const before = await makePlayClient({ credential }).pushListing(packageName, LANGUAGE, patch);
  for (const field of Object.keys(patch)) console.log(`${field} was: ${before?.[field] ?? '(none)'}`);
  console.log(`committed — the ${LANGUAGE} listing is in Google's review`);
} catch (err) {
  fail(err.message);
}

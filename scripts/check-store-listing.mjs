#!/usr/bin/env node
/**
 * Holds docs/store/listing-es-ES.md to Google Play's and App Store Connect's
 * limits, so text a store would reject fails a PR rather than a submission.
 * CI runs it (`pnpm check:store-listing`); it reads only the repo.
 *
 *   node scripts/check-store-listing.mjs [--file docs/store/listing-es-ES.md]
 */

import { DEFAULT_LISTING_DOC, loadStoreListing, validateStoreListing } from './lib/store-listing.mjs';

const fileArg = process.argv.indexOf('--file');
const file = fileArg === -1 ? DEFAULT_LISTING_DOC : process.argv[fileArg + 1];

let listing;
try {
  listing = loadStoreListing(file);
} catch (err) {
  console.error(`check-store-listing: ${file}: ${err.message}`);
  process.exit(1);
}
const { errors, warnings } = validateStoreListing(listing);
const warnPrefix = process.env.GITHUB_ACTIONS ? '::warning::' : 'warning: ';
for (const w of warnings) console.warn(`${warnPrefix}check-store-listing: ${w}`);
if (errors.length) {
  console.error(`check-store-listing: ${file}:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-store-listing: ${file} fits both stores' limits`);

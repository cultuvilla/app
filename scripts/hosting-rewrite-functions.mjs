#!/usr/bin/env node
/**
 * Prints `functions:<id>,…` for every Cloud Function the app hosting target
 * rewrites to, for `firebase deploy --only`.
 *
 * A breaking release holds Cloud Functions but still deploys hosting, and
 * hosting sends every page to `readSite`. 1.7.1 shipped hosting while
 * `readSite` had never been deployed to prod, and cultuvilla.es answered 404
 * for six hours, privacy policy included — which is what Google Play rejected
 * the release for. Read from firebase.json so the list cannot drift.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function hostingRewriteFunctions(firebaseJson) {
  const targets = [firebaseJson.hosting ?? []].flat();
  const ids = targets
    .flatMap((t) => t.rewrites ?? [])
    .map((r) => (typeof r.function === 'string' ? r.function : r.function?.functionId))
    .filter(Boolean);
  return [...new Set(ids)].map((id) => `functions:${id}`).join(',');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const json = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
  const only = hostingRewriteFunctions(json);
  if (!only) {
    console.error('firebase.json hosting rewrites name no function');
    process.exit(1);
  }
  console.log(only);
}

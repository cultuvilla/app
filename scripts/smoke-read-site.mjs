#!/usr/bin/env node
/**
 * After a deploy, ask the live read site for the pages that must never be
 * down, and fail if any of them is not a 200.
 *
 * 2026-10-07: a held 1.7.1 release shipped hosting without the readSite
 * function it rewrites every page to. cultuvilla.es answered 404 for five
 * hours and nothing noticed, until Google Play rejected the release because
 * the privacy policy and account-deletion URLs it reviews were dead. The
 * legal pages are store requirements, and the rest is what every share link
 * and the printed /descarga QR land on.
 *
 *   node scripts/smoke-read-site.mjs --env=<dev|beta|prod>
 */
import { fileURLToPath } from 'node:url';

export const HOSTS = {
  dev: ['villa-events.web.app'],
  beta: ['cultuvilla-beta.web.app'],
  prod: ['cultuvilla-prod.web.app', 'cultuvilla.es'],
};

// What Play and the App Store review (privacy, account deletion, terms, also
// as linked from the store listings), plus the home and the QR landing page.
export const PATHS = [
  '/',
  '/legal/privacidad',
  '/legal/privacy',
  '/legal/eliminar-cuenta',
  '/legal/terminos',
  '/descarga',
];

export function urlsFor(env) {
  const hosts = HOSTS[env];
  if (!hosts) throw new Error(`unknown env "${env}" (expected ${Object.keys(HOSTS).join(', ')})`);
  return hosts.flatMap((host) => PATHS.map((path) => `https://${host}${path}`));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A query string bypasses the CDN, which keeps a cached 404 for up to ten
// minutes: the check must see what the deploy just shipped. A freshly created
// function can also take a moment to answer, hence the retries.
async function check(url, { attempts = 6, delayMs = 10_000 } = {}) {
  let last = 'no answer';
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}smoke=${Date.now()}`, { redirect: 'follow' });
      if (res.status === 200) return { url, ok: true, status: 200 };
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = err.message;
    }
    if (i < attempts) await sleep(delayMs);
  }
  return { url, ok: false, status: last };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = process.argv.find((a) => a.startsWith('--env='))?.slice('--env='.length);
  const results = await Promise.all(urlsFor(env).map((u) => check(u)));
  for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.url} — ${r.status}`);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`::error::The read site is down on ${env}: ${failed.length} page(s) not 200. Every share link and the store-reviewed legal pages are affected.`);
    process.exit(1);
  }
}

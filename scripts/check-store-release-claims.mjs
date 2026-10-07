#!/usr/bin/env node
/**
 * Verify the store-release runbook against live infrastructure.
 *
 * WHY THIS EXISTS. `docs/plans/ongoing/store-release.md` tracks state that lives
 * outside the repo — Play Console, GCP, EAS, GitHub secrets — and that state
 * drifts silently while the doc does not. On 2026-08-24 three of its claims were
 * wrong at once, and each cost real time chasing a non-problem:
 *
 *   1. "Android OAuth client pending" — it had been configured for weeks.
 *   2. "Play Console -> Setup -> API access" — that page is no longer required
 *      and may not exist; Google dropped the Cloud-project link requirement.
 *   3. "the org policy blocks key creation" — true of the org, but
 *      `cultuvilla-prod` has no parent and was never subject to it.
 *
 * A doc cannot notice it has gone stale. This can. Everything here is READ-ONLY
 * and prints no secret material — only whether a thing exists and whether two
 * values agree.
 *
 *   node scripts/check-store-release-claims.mjs
 *
 * Requires `gcloud auth login cultuvilla.app@gmail.com` (the only identity that
 * can see all three projects) and an authenticated `gh`. Missing tooling is
 * reported as SKIP, not failure — this is a drift detector, not a deploy gate.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentStoreUrl } from './lib/app-stores.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_STORE_ID = currentStoreUrl('ios').match(/id(\d+)/)?.[1] ?? '';
const PROD = 'cultuvilla-prod';
const SA = `play-publisher@${PROD}.iam.gserviceaccount.com`;

let pass = 0;
let fail = 0;
let skip = 0;

const ok = (m, d) => { pass++; console.log(`  \x1b[32mPASS\x1b[0m ${m}${d ? ` — ${d}` : ''}`); };
const bad = (m, d) => { fail++; console.log(`  \x1b[31mFAIL\x1b[0m ${m}${d ? ` — ${d}` : ''}`); };
const meh = (m, d) => { skip++; console.log(`  \x1b[33mSKIP\x1b[0m ${m}${d ? ` — ${d}` : ''}`); };

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
/** Run a command, returning null instead of throwing when it fails. */
function trySh(cmd, args) {
  try {
    return sh(cmd, args);
  } catch {
    return null;
  }
}

console.log('\n\x1b[1mStore release — claims vs. live infrastructure\x1b[0m');

// ── GitHub secrets ────────────────────────────────────────────────────────
console.log('\nGitHub secrets');
const secrets = trySh('gh', ['secret', 'list']);
if (secrets === null) {
  meh('gh not authenticated', 'run `gh auth login`');
} else {
  for (const name of ['EXPO_TOKEN', 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON']) {
    if (secrets.includes(name)) ok(`${name} is set`);
    else bad(`${name} is MISSING`, 'beta-build-and-submit will stop at its guard');
  }
}

// ── GCP / Play publisher ──────────────────────────────────────────────────
console.log('\nGoogle Cloud');
const account = trySh('gcloud', ['config', 'get-value', 'account']);
if (!account) {
  meh('gcloud not authenticated');
} else if (account !== 'cultuvilla.app@gmail.com') {
  meh(`active gcloud account is ${account}`, 'only cultuvilla.app@gmail.com sees all three projects');
} else {
  const saOk = trySh('gcloud', ['iam', 'service-accounts', 'describe', SA, `--project=${PROD}`, '--format=value(email)']);
  if (saOk === SA) ok('Play publisher service account exists', SA);
  else bad('Play publisher service account missing', SA);

  const api = trySh('gcloud', ['services', 'list', '--enabled', `--project=${PROD}`,
    '--filter=config.name:androidpublisher', '--format=value(config.name)']);
  if (api && api.includes('androidpublisher')) ok('Play Developer API enabled on ' + PROD);
  else bad('androidpublisher.googleapis.com NOT enabled on ' + PROD);

  // The claim that burned us: the org-wide key ban does not reach a project
  // that has no parent. Report the EFFECTIVE policy, not the org's.
  const parent = trySh('gcloud', ['projects', 'describe', PROD, '--format=value(parent.id)']);
  const enforced = trySh('gcloud', ['resource-manager', 'org-policies', 'describe',
    'iam.disableServiceAccountKeyCreation', `--project=${PROD}`, '--effective',
    '--format=value(booleanPolicy.enforced)']);
  ok(`${PROD} key-creation ban effective = ${enforced || 'unset'}`,
    parent ? `parent org ${parent}` : 'no parent org — outside any organization');
}

// ── App-signing fingerprints ──────────────────────────────────────────────
console.log('\nAndroid signing / Google Sign-In');
const assetlinksPath = resolve(ROOT, 'web/well-known/prod/assetlinks.json');
let committed = null;
try {
  const entries = JSON.parse(readFileSync(assetlinksPath, 'utf8'));
  committed = entries[0]?.target?.sha256_cert_fingerprints?.[0]?.toUpperCase() ?? null;
} catch {
  bad('cannot read prod/assetlinks.json', assetlinksPath);
}

const token = account === 'cultuvilla.app@gmail.com' ? trySh('gcloud', ['auth', 'print-access-token']) : null;
if (!token) {
  meh('skipping Firebase fingerprint check', 'needs gcloud auth as cultuvilla.app@gmail.com');
} else if (committed) {
  const appsRaw = trySh('curl', ['-s', '-H', `Authorization: Bearer ${token}`,
    '-H', `x-goog-user-project: ${PROD}`,
    `https://firebase.googleapis.com/v1beta1/projects/${PROD}/androidApps`]);
  const appId = appsRaw ? (JSON.parse(appsRaw).apps ?? [])[0]?.appId : null;
  if (!appId) {
    bad('no Android app registered in ' + PROD);
  } else {
    const shaRaw = trySh('curl', ['-s', '-H', `Authorization: Bearer ${token}`,
      '-H', `x-goog-user-project: ${PROD}`,
      `https://firebase.googleapis.com/v1beta1/projects/${PROD}/androidApps/${appId}/sha`]);
    const certs = shaRaw ? (JSON.parse(shaRaw).certificates ?? []) : [];
    const has1 = certs.some((c) => c.certType === 'SHA_1');
    const sha256 = certs.find((c) => c.certType === 'SHA_256')?.shaHash?.toUpperCase() ?? null;
    const colonised = sha256 ? sha256.match(/../g).join(':') : null;

    // A registered SHA-1 is what auto-creates the Android OAuth client, so
    // Google Sign-In working is equivalent to this being present.
    if (has1) ok('SHA-1 registered (this is what creates the Android OAuth client)');
    else bad('no SHA-1 registered', 'Google Sign-In will fail in store builds');

    if (colonised && colonised === committed) {
      ok('registered SHA-256 matches the Play app-signing key in assetlinks.json');
    } else {
      bad('SHA-256 MISMATCH — deep links or sign-in will break',
        `firebase=${colonised ?? 'none'} assetlinks=${committed}`);
    }
  }
}

// ── Firebase Auth sign-in providers ───────────────────────────────────────
// Apple rejected 1.0.0 under guideline 2.1(a) — "got an error when trying to
// login with Apple login" — because `apple.com` was enabled in NO environment.
// The client shipped a working Sign in with Apple button and the unit tests
// passed: the gap was entirely server-side config, which no test in the repo
// could see. A provider the UI offers but the project does not enable fails at
// `signInWithCredential` with auth/operation-not-allowed, i.e. only ever at
// runtime, in front of a reviewer or a user.
console.log('\nFirebase Auth sign-in providers');
const idpToken = trySh('gcloud', ['auth', 'print-access-token']);
if (!idpToken) {
  meh('could not read Auth providers', 'needs an authenticated gcloud');
} else {
  // Every provider the app offers in its UI must be enabled in every env, not
  // just prod — a provider missing on dev/beta cannot be caught by testing.
  const REQUIRED_IDPS = ['google.com', 'apple.com'];
  for (const project of ['villa-events', 'cultuvilla-beta', PROD]) {
    const raw = trySh('bash', ['-lc',
      `curl -sS -H "Authorization: Bearer ${idpToken}" -H "X-Goog-User-Project: ${project}" ` +
      `"https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/defaultSupportedIdpConfigs"`]);
    let configs = null;
    try {
      configs = JSON.parse(raw ?? '').defaultSupportedIdpConfigs ?? [];
    } catch {
      meh(`could not read Auth providers for ${project}`);
      continue;
    }
    const enabled = new Set(
      configs.filter((c) => c.enabled).map((c) => c.name.split('/').pop()),
    );
    for (const idp of REQUIRED_IDPS) {
      if (enabled.has(idp)) ok(`${idp} enabled on ${project}`);
      else bad(`${idp} NOT enabled on ${project}`, 'the app offers this provider — sign-in will fail at runtime');
    }
  }
}

// ── EAS production environment ────────────────────────────────────────────
console.log('\nEAS production environment');
const easEnv = trySh('bash', ['-lc',
  'cd apps/mobile && npx --yes eas-cli@latest env:list production 2>/dev/null | sed "s/\\x1b\\[[0-9;]*m//g"']);
if (!easEnv) {
  meh('could not read EAS env', 'needs EXPO_TOKEN in the environment');
} else {
  // app.config.ts is evaluated on the EAS build server, so a value missing here
  // silently disables the feature in the shipped binary.
  for (const key of ['GOOGLE_WEB_CLIENT_ID_PROD', 'FIREBASE_PROJECT_ID_PROD', 'FIREBASE_API_KEY_PROD']) {
    if (easEnv.includes(key)) ok(`${key} present`);
    else bad(`${key} MISSING from the EAS production environment`);
  }
}

// ── Store listings ────────────────────────────────────────────────────────
// APP_STORES gates every download offer in the web build. A URL filled in
// before its listing is public sends real visitors to a 404, which is strictly
// worse than showing them nothing — and nothing else in the repo can catch it,
// because whether a store page is publicly reachable is not a fact any test has
// access to. So it is checked here, against the live stores.
console.log('\nStore listings');

/**
 * Is the iOS listing reachable?
 *
 * The question this check exists to answer is "does the URL we put in front of
 * visitors resolve", so the page itself is the authority — not the lookup API.
 * They disagree for hours: on release day (2026-09-04) the product page served
 * 200 with the real listing while `lookup` still returned `resultCount: 0`,
 * because the search index is a slower pipeline than the store front end.
 * Gating on lookup would have held the banner back from a page that worked.
 */
async function iosListingIsLive(url) {
  const id = url.match(/id(\d+)/)?.[1];
  if (!id) return { live: false, why: 'no numeric app id in the URL' };

  const page = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!page.ok) return { live: false, why: `product page HTTP ${page.status} — not published yet` };

  // A 200 that isn't this app would mean Apple redirected us somewhere generic.
  const html = await page.text();
  if (!/cultuvilla/i.test(html)) return { live: false, why: 'product page 200 but does not name the app' };

  // Supplementary: the search index, which lags and must not gate.
  const res = await fetch(`https://itunes.apple.com/lookup?id=${id}&country=es`);
  const body = await res.json();
  const indexed = body.resultCount > 0 ? `indexed as ${body.results[0].trackName}` : 'not yet in the search index (lags the page)';
  return { live: true, why: `product page 200; ${indexed}` };
}

async function androidListingIsLive(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  return res.ok
    ? { live: true, why: `HTTP ${res.status}` }
    : { live: false, why: `HTTP ${res.status} — still closed-track?` };
}

for (const [key, probe] of [['ios', iosListingIsLive], ['android', androidListingIsLive]]) {
  const url = currentStoreUrl(key);
  if (!url) {
    meh(`APP_STORES.${key} is empty`, 'that platform offers no download — deliberate until it ships');
    continue;
  }
  try {
    const { live, why } = await probe(url);
    if (live) ok(`APP_STORES.${key} listing is public`, why);
    else bad(`APP_STORES.${key} points at a listing that is NOT public`, why);
  } catch (err) {
    meh(`could not reach the ${key} store`, err.message);
  }
}

// prod's `config/appVersion.<platform>.latest` is what the update nudge
// promises; the announce poller writes it once a store serves a release. A
// value behind the store means the poller missed one (nudges stop); ahead of
// it means a version was announced that nobody can download — prod announced
// 1.3.0 for weeks while the App Store served 1.2.2. Only the store can say
// which; Android has no free public equivalent of the iTunes lookup, so it is
// reported, not verified. The pending release, if any, is what is in flight.
console.log('\nAnnounced versions (prod config/appVersion vs. the stores)');
async function readProdDoc(docPath) {
  const tok = trySh('gcloud', ['auth', 'print-access-token']);
  if (!tok) return { error: 'needs an authenticated gcloud' };
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROD}/databases/(default)/documents/${docPath}`,
    { headers: { Authorization: `Bearer ${tok}`, 'x-goog-user-project': PROD } },
  );
  if (res.status === 404) return { doc: null };
  if (!res.ok) return { error: `Firestore HTTP ${res.status}` };
  return { doc: (await res.json()).fields ?? {} };
}
const field = (fields, ...keys) =>
  keys.reduce((f, k) => f?.mapValue?.fields?.[k] ?? f?.[k], fields)?.stringValue ?? null;

const config = await readProdDoc('config/appVersion');
if (config.error) {
  meh('could not read prod config/appVersion', config.error);
} else if (!config.doc) {
  bad('prod config/appVersion is missing', 'clients have no update gate at all');
} else {
  const announcedIos = field(config.doc, 'ios', 'latest');
  try {
    const body = await (await fetch(`https://itunes.apple.com/lookup?id=${APP_STORE_ID}&country=es`)).json();
    const live = body.resultCount > 0 ? body.results[0].version : null;
    if (!live) meh('App Store version unavailable', 'lookup returned no result — the index lags the page');
    else if (live === announcedIos) ok('config/appVersion.ios.latest matches the App Store', live);
    else bad('config/appVersion.ios.latest disagrees with the App Store', `announced ${announcedIos}, App Store serves ${live}`);
  } catch (err) {
    meh('could not read the App Store version', err.message);
  }
  ok('config/appVersion.android.latest', `${field(config.doc, 'android', 'latest')} — no public API to verify against`);
}
const pending = await readProdDoc('_admin/announce/pending/prod');
if (pending.error) meh('could not read the pending release', pending.error);
else if (!pending.doc) ok('no release waiting on the stores');
else {
  const held = pending.doc.holdBackend?.booleanValue ? ' — its backend is HELD until both stores serve it' : '';
  ok('release waiting on the stores', `${field(pending.doc, 'version')}${held}`);
}

console.log(`\n\x1b[1m${pass} pass · ${fail} fail · ${skip} skipped\x1b[0m`);
if (fail > 0) {
  console.log('\nA FAIL means docs/plans/ongoing/store-release.md may be out of date.');
  console.log('Fix the infrastructure or the doc — do not leave them disagreeing.\n');
}
process.exit(fail > 0 ? 1 : 0);

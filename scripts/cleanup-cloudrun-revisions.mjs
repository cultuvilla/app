#!/usr/bin/env node
/**
 * cleanup-cloudrun-revisions.mjs
 *
 * Delete the Cloud Run revisions old function deploys leave behind — never a
 * serving one. Dry run by default.
 *
 *   node scripts/cleanup-cloudrun-revisions.mjs --env=<dev|beta|prod> \
 *     [--apply] [--confirm] [--max-deletes=150] [--max-minutes=10] [--min-age-days=2] [--keep=2]
 *
 * WHY. Every 2nd-gen function deploy creates a new immutable revision and
 * keeps the old one. A revision scaled to zero still counts against the
 * regional "total allowable CPU" quota; Órdago reached 1,529 revisions and
 * every `firebase deploy --only functions` then failed with "Quota exceeded
 * for total allowable CPU per project per region" — and each retry made one
 * more. Measured here 2026-11-27: dev 16,871 revisions, beta 1,719, prod 1,106,
 * across ~100 services.
 *
 * WHAT IS KEPT, per service, whatever its age:
 *   - every revision the traffic config or the traffic status names (serving,
 *     tagged, or pinned at 0%);
 *   - latestReadyRevision and latestCreatedRevision — a failed deploy leaves
 *     a newer revision that never served, while the healthy one is older;
 *   - the newest --keep revisions (a rollback budget);
 *   - anything younger than --min-age-days;
 *   - the whole service while it is reconciling (a deploy is in flight).
 *
 * Revisions hold no data and no config of their own; removing one that serves
 * no traffic cannot affect a running service.
 *
 * PACE. Órdago learned that bursts of deletes hit the admin API's rate limit
 * and spike `run.googleapis.com/cpu_allocation`, failing live invocations. So
 * deletes go one at a time with a pause, in a bounded batch per run; re-run
 * until DELETABLE reaches 0 — the script is idempotent. The deploy runs it
 * after every deploy, which removes about one deploy's worth each time.
 *
 * Adapted from Órdago's scripts/ops-cleanup-cloudrun-revisions.js.
 */
import { fileURLToPath } from 'node:url';

const RUN = 'https://run.googleapis.com/v2';
const DAY_MS = 86_400_000;

export const DEFAULTS = { maxDeletes: 150, maxMinutes: 10, minAgeDays: 2, keep: 2, delayMs: 400 };

const regionOf = (name) => name.split('/')[3];
const shortName = (name) => name.split('/').pop();

/** Revision short names a service still needs, from its own status. */
export function protectedRevisions(service) {
  const names = new Set();
  for (const t of [...(service.traffic ?? []), ...(service.trafficStatuses ?? [])]) {
    if (t.revision) names.add(shortName(t.revision));
  }
  for (const r of [service.latestReadyRevision, service.latestCreatedRevision]) if (r) names.add(shortName(r));
  return names;
}

/**
 * Split one service's revisions into those to delete and those kept, with
 * the reason each was kept.
 */
export function plan(service, revisions, { now = Date.now(), minAgeDays = DEFAULTS.minAgeDays, keep = DEFAULTS.keep } = {}) {
  const kept = { protected: 0, recent: 0, young: 0, reconciling: 0 };
  if (service.reconciling) {
    kept.reconciling = revisions.length;
    return { deletable: [], kept };
  }
  const guard = protectedRevisions(service);
  const newest = [...revisions].sort((a, b) => Date.parse(b.createTime) - Date.parse(a.createTime));
  const cutoff = now - minAgeDays * DAY_MS;
  const deletable = [];
  newest.forEach((rev, i) => {
    if (guard.has(shortName(rev.name))) kept.protected += 1;
    else if (i < keep) kept.recent += 1;
    else if (!(Date.parse(rev.createTime) <= cutoff)) kept.young += 1;
    else deletable.push(rev);
  });
  return { deletable, kept };
}

export async function paged(api, url, key) {
  const items = [];
  let token = '';
  do {
    const body = await api(`${url}${url.includes('?') ? '&' : '?'}pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`);
    items.push(...(body[key] ?? []));
    token = body.nextPageToken ?? '';
  } while (token);
  return items;
}

/** Every service with its revisions, across every region it lives in. */
export async function inventory(api, project) {
  const services = await paged(api, `${RUN}/projects/${project}/locations/-/services`, 'services');
  const regions = [...new Set(services.map((s) => regionOf(s.name)))].sort();
  const byService = new Map();
  for (const region of regions) {
    for (const rev of await paged(api, `${RUN}/projects/${project}/locations/${region}/services/-/revisions`, 'revisions')) {
      const svc = rev.name.split('/revisions/')[0];
      if (!byService.has(svc)) byService.set(svc, []);
      byService.get(svc).push(rev);
    }
  }
  return services.map((service) => ({ service, revisions: byService.get(service.name) ?? [] }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** DELETE with backoff on 429/5xx; a 404 is already gone. */
export async function deleteRevision(api, name, { attempts = 6, backoff = sleep } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await api(`${RUN}/${name}`, { method: 'DELETE' });
      return;
    } catch (err) {
      if (err.status === 404) return;
      const retryable = err.status === 429 || err.status >= 500;
      if (!retryable || attempt >= attempts) throw err;
      await backoff(Math.min(30_000, 2 ** attempt * 500));
    }
  }
}

/** Plan every service, and with `apply` delete a bounded batch. Returns counts. */
export async function run({ api, project, apply, options = {}, log = console.log, now = Date.now(), pause = sleep }) {
  const o = { ...DEFAULTS, ...options };
  const all = await inventory(api, project);
  const counts = { services: all.length, revisions: 0, protected: 0, recent: 0, young: 0, reconciling: 0, deletable: 0, deleted: 0, failed: 0 };
  const candidates = [];
  const perService = [];
  for (const { service, revisions } of all) {
    const { deletable, kept } = plan(service, revisions, { now, minAgeDays: o.minAgeDays, keep: o.keep });
    counts.revisions += revisions.length;
    for (const k of Object.keys(kept)) counts[k] += kept[k];
    counts.deletable += deletable.length;
    candidates.push(...deletable);
    if (deletable.length) perService.push([shortName(service.name), deletable.length]);
  }
  log(
    `services ${counts.services} · revisions ${counts.revisions} · kept: serving/latest ${counts.protected}, ` +
      `newest ${counts.recent}, < ${o.minAgeDays}d ${counts.young}, reconciling ${counts.reconciling} · DELETABLE ${counts.deletable}`,
  );
  for (const [svc, n] of perService.sort((a, b) => b[1] - a[1]).slice(0, 10)) log(`  ${String(n).padStart(5)}  ${svc}`);
  if (!apply) return counts;

  // Oldest first, so a bounded run frees the longest-dead revisions.
  candidates.sort((a, b) => Date.parse(a.createTime) - Date.parse(b.createTime));
  const deadline = Date.now() + o.maxMinutes * 60_000;
  for (const rev of candidates.slice(0, o.maxDeletes)) {
    if (Date.now() > deadline) {
      log(`time budget of ${o.maxMinutes} min reached`);
      break;
    }
    try {
      await deleteRevision(api, rev.name);
      counts.deleted += 1;
      if (counts.deleted % 50 === 0) log(`  deleted ${counts.deleted}…`);
    } catch (err) {
      counts.failed += 1;
      log(`  ✗ ${shortName(rev.name)}: ${String(err.message).split('\n')[0]}`);
    }
    await pause(o.delayMs);
  }
  log(`deleted ${counts.deleted} · failed ${counts.failed} · left ${counts.deletable - counts.deleted}`);
  return counts;
}

async function main() {
  const { ENVS, resolveEnv } = await import('./lib/env-credentials.mjs');
  const { accessToken, client } = await import('./check-env-parity.mjs');
  const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const num = (n, fallback) => {
    const v = arg(n);
    if (v === undefined) return fallback;
    const parsed = Number(v);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`--${n} must be a non-negative number`);
    return parsed;
  };
  const env = resolveEnv(arg('env'));
  const apply = process.argv.includes('--apply');
  if (apply && env === 'prod' && !process.argv.includes('--confirm')) {
    console.error('Refusing to delete prod revisions without --confirm.');
    process.exit(2);
  }
  const options = {
    maxDeletes: num('max-deletes', DEFAULTS.maxDeletes),
    maxMinutes: num('max-minutes', DEFAULTS.maxMinutes),
    minAgeDays: num('min-age-days', DEFAULTS.minAgeDays),
    keep: num('keep', DEFAULTS.keep),
  };
  const project = ENVS[env].project;
  console.log(`Cloud Run revision cleanup — ${env} (${project}) — ${apply ? `APPLY (up to ${options.maxDeletes})` : 'dry run'}`);
  // A token lasts an hour; a long run asks for a fresh one per request.
  let token = await accessToken();
  let fetched = Date.now();
  const api = async (url, init) => {
    if (Date.now() - fetched > 45 * 60_000) {
      token = await accessToken();
      fetched = Date.now();
    }
    return client(token, project)(url, init);
  };
  const counts = await run({ api, project, apply, options });
  if (counts.failed) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`::error::Revision cleanup could not run: ${err.message}`);
    process.exit(1);
  });
}

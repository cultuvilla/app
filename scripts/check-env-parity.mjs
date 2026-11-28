#!/usr/bin/env node
/**
 * check-env-parity.mjs
 *
 * Dev and beta exist to prove that prod will work. They only can if they are
 * configured like prod, so this checks that they are — strictly.
 *
 * Two scopes:
 *
 *   config     The project's own setup: Firestore database and Storage bucket
 *              settings, enabled APIs, IAM grants to service accounts, Secret
 *              Manager names, Auth configuration, Artifact Registry
 *              cleanup policies, and every data store with its retention
 *              (Firestore databases and backup schedules, Storage buckets,
 *              Cloud Logging buckets and sinks, BigQuery datasets). It must equal the
 *              committed baseline (infra/env-parity.json) plus that env's
 *              declared exceptions, each of which carries its reason. Every
 *              env is checked against the same baseline, so passing here
 *              means matching each other. Runs before anything is deployed.
 *
 *   artifacts  What a deploy puts there: the live Firestore and Storage rules
 *              equal this commit's files, the deployed composite indexes equal
 *              firestore.indexes.json, and the deployed functions are exactly
 *              the ones functions/src/index.ts exports — each ACTIVE, its
 *              Eventarc trigger present, its traffic on a Ready revision that
 *              runs the image its build made. Runs after deploying.
 *
 * Each CI identity can reach only its own project (the WIF pools are bound to
 * develop / beta / main), so the deploy checks its own env. Locally, with the
 * operator's ADC, --all checks all three and --write-baseline drafts the
 * baseline from them.
 *
 *   node scripts/check-env-parity.mjs --env=<dev|beta|prod> [--scope=config|artifacts|all] [--also-baseline=<file>]
 *   node scripts/check-env-parity.mjs --all
 *   node scripts/check-env-parity.mjs --write-baseline
 *
 * Why it exists: 2026-10-07, a storage.rules change that every deployed
 * project refuses shipped to prod with every gate green, and nothing had
 * exercised beta. Parity is what makes "it worked on beta" mean something.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import { ADC_PATH, ENVS, resolveEnv } from './lib/env-credentials.mjs';
import { cleanupLines, listRepositories } from './setup-artifact-cleanup.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE_PATH = resolve(repoRoot, 'infra/env-parity.json');

/** Dimensions compared as sets; the rest are flat key → value maps. */
export const LIST_DIMENSIONS = ['apis', 'iam', 'secrets', 'authProviders', 'authDomains', 'artifactCleanup', 'dataStores'];
export const MAP_DIMENSIONS = ['firestore', 'bucket', 'auth'];
export const DIMENSIONS = [...MAP_DIMENSIONS, ...LIST_DIMENSIONS];

// ---------------------------------------------------------------- pure logic

/** Replace a project's id and number with placeholders so envs compare. */
export function normalize(value, { project, number }) {
  return JSON.parse(
    JSON.stringify(value).split(project).join('<project>').split(String(number)).join('<number>'),
  );
}

/** The snapshot an env must match: the baseline with its exceptions applied. */
export function expectedFor(baseline, env) {
  const expected = structuredClone(baseline.expected);
  for (const ex of baseline.exceptions?.[env] ?? []) {
    if (LIST_DIMENSIONS.includes(ex.dimension)) {
      const set = new Set(expected[ex.dimension]);
      for (const item of ex.add ?? []) set.add(item);
      for (const item of ex.remove ?? []) set.delete(item);
      expected[ex.dimension] = [...set].sort();
    } else {
      expected[ex.dimension] = { ...expected[ex.dimension], ...ex.set };
    }
  }
  return expected;
}

/** Every way `actual` differs from `expected`, as human-readable lines. */
export function diffSnapshot(actual, expected) {
  const out = [];
  for (const dim of LIST_DIMENSIONS) {
    const a = new Set(actual[dim] ?? []);
    const e = new Set(expected[dim] ?? []);
    for (const item of e) if (!a.has(item)) out.push(`${dim}: missing ${item}`);
    for (const item of a) if (!e.has(item)) out.push(`${dim}: unexpected ${item}`);
  }
  for (const dim of MAP_DIMENSIONS) {
    const a = actual[dim] ?? {};
    const e = expected[dim] ?? {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(e)])) {
      const av = JSON.stringify(a[key] ?? null);
      const ev = JSON.stringify(e[key] ?? null);
      if (av !== ev) out.push(`${dim}.${key}: is ${av}, expected ${ev}`);
    }
  }
  return out.sort();
}

/**
 * Config differences of `actual` from the first baseline it fully matches —
 * none if it matches any. A live env changes the moment someone changes it,
 * while a baseline edit reaches main only with the next release; accepting
 * develop's baseline too lets an infra change that is declared on develop
 * stop blocking beta and prod deploys in the meantime (2026-10-08: dropping
 * the appspot editor grant stopped the 1.8.0 prod deploy). When nothing
 * matches, the report is against the first — the branch's own — baseline.
 */
export function configDifferences(actual, env, baselines) {
  const diffs = baselines.map((b) => diffSnapshot(actual, expectedFor(b, env)));
  return diffs.some((d) => d.length === 0) ? [] : diffs[0];
}

/**
 * Problems with the baseline itself. An exception must say why it exists and
 * must change something — a no-op exception is a stale one.
 */
export function validateBaseline(baseline) {
  const problems = [];
  for (const dim of DIMENSIONS) {
    if (!(dim in (baseline.expected ?? {}))) problems.push(`expected.${dim} is missing`);
  }
  for (const [env, exceptions] of Object.entries(baseline.exceptions ?? {})) {
    if (!ENVS[env]) problems.push(`exceptions.${env}: unknown env`);
    for (const [i, ex] of exceptions.entries()) {
      const at = `exceptions.${env}[${i}]`;
      if (!DIMENSIONS.includes(ex.dimension)) problems.push(`${at}: unknown dimension "${ex.dimension}"`);
      if (typeof ex.reason !== 'string' || ex.reason.trim().length < 10 || /\bTODO\b/.test(ex.reason)) {
        problems.push(`${at}: needs a real reason`);
      }
      const base = baseline.expected?.[ex.dimension];
      if (LIST_DIMENSIONS.includes(ex.dimension)) {
        if (!(ex.add?.length || ex.remove?.length)) problems.push(`${at}: adds and removes nothing`);
        for (const item of ex.add ?? []) if (base?.includes(item)) problems.push(`${at}: adds ${item}, already expected`);
        for (const item of ex.remove ?? []) if (!base?.includes(item)) problems.push(`${at}: removes ${item}, never expected`);
      } else if (MAP_DIMENSIONS.includes(ex.dimension)) {
        if (!ex.set || Object.keys(ex.set).length === 0) problems.push(`${at}: sets nothing`);
        for (const [k, v] of Object.entries(ex.set ?? {})) {
          if (JSON.stringify(base?.[k]) === JSON.stringify(v)) problems.push(`${at}: sets ${k} to its expected value`);
        }
      }
    }
  }
  return problems;
}

/** Draft a baseline: prod is the reference, dev and beta differences become exceptions. */
export function draftBaseline(snapshots) {
  const expected = snapshots.prod;
  const exceptions = {};
  for (const env of ['dev', 'beta']) {
    const list = [];
    for (const dim of LIST_DIMENSIONS) {
      const a = new Set(snapshots[env][dim]);
      const e = new Set(expected[dim]);
      const add = [...a].filter((x) => !e.has(x)).sort();
      const remove = [...e].filter((x) => !a.has(x)).sort();
      if (add.length || remove.length) {
        list.push({ dimension: dim, ...(add.length && { add }), ...(remove.length && { remove }), reason: 'TODO' });
      }
    }
    for (const dim of MAP_DIMENSIONS) {
      const set = {};
      for (const [k, v] of Object.entries(snapshots[env][dim])) {
        if (JSON.stringify(v) !== JSON.stringify(expected[dim][k])) set[k] = v;
      }
      if (Object.keys(set).length) list.push({ dimension: dim, set, reason: 'TODO' });
    }
    if (list.length) exceptions[env] = list;
  }
  return { expected, exceptions };
}

/** The function names functions/src/index.ts exports — what a deploy ships. */
export function exportedFunctionNames(indexSource) {
  const names = [];
  for (const m of indexSource.matchAll(/export\s*\{([^}]*)\}\s*from/g)) {
    for (const part of m[1].split(',')) {
      const name = part.replace(/\/\/.*$/gm, '').trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.push(name);
    }
  }
  for (const m of indexSource.matchAll(/export\s+const\s+(\w+)/g)) names.push(m[1]);
  return names.sort();
}

/**
 * One comparable string per composite index. Firestore appends the implicit
 * `__name__` tiebreaker to a deployed index; the repo file omits it.
 */
export function indexKey({ collectionGroup, queryScope, fields }) {
  const parts = fields
    .filter((f) => f.fieldPath !== '__name__')
    .map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig ?? (f.vectorConfig ? JSON.stringify(f.vectorConfig) : '')}`);
  return `${collectionGroup}|${queryScope ?? 'COLLECTION'}|${parts.join(',')}`;
}

export function sha(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

// ------------------------------------------------------- function health
//
// A function can be listed and still be dead. Órdago found both shapes in
// 2026: a function whose Eventarc trigger vanished in an interrupted deploy
// (present, ACTIVE, never fired), and one whose serving Cloud Run revision ran
// an older image than the build the function's metadata names — every
// metadata check green, the pre-fix code serving
// (ordago-apps docs/decisions/verify-running-cf-container-image.md). So each
// deployed function is judged on what serves it: state, trigger, the revision
// that takes the traffic, and the image that revision runs.

/** Cloud Functions v2 states that mean "still being worked on", not a verdict. */
export const TRANSIENT_FUNCTION_STATES = new Set(['DEPLOYING', 'STATE_UNSPECIFIED']);

/**
 * Artifact Registry's cleanup deletes images older than a day, tagged or not
 * (infra/env-parity.json `artifactCleanup`), while Cloud Run keeps serving its
 * imported copy. The image is compared only when the function's build is
 * younger than this, so it still exists — which a deploy's own build always is.
 */
export const IMAGE_CHECK_MAX_BUILD_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * An Artifact Registry image reference, as a revision or a build names it:
 * `<location>-docker.pkg.dev/<project>/<repository>/<package>(:tag|@sha256:…)`.
 * Null for anything else (an image outside Artifact Registry).
 */
export function parseImage(ref) {
  const m = /^([a-z0-9-]+)-docker\.pkg\.dev\/([^/]+)\/([^/]+)\/([^@:]+)(?::([^@]+))?(?:@(sha256:[0-9a-f]{64}))?$/.exec(ref ?? '');
  if (!m) return null;
  const [, location, project, repository, pkg, tag, digest] = m;
  return { location, project, repository, package: pkg, tag: tag ?? null, digest: digest ?? null };
}

/** The image a Cloud Functions build pushes — its buildpack's `--app_image_unique`. */
export function builtImage(build) {
  for (const step of build?.steps ?? []) {
    for (const a of step.args ?? []) {
      if (a.startsWith('--app_image_unique=')) return parseImage(a.slice('--app_image_unique='.length));
    }
  }
  return null;
}

/** The revisions a Cloud Run v2 service sends traffic to. */
export function servingRevisions(service) {
  return (service?.trafficStatuses ?? [])
    .filter((t) => (t.percent ?? 0) > 0)
    .map((t) => t.revision)
    .filter(Boolean)
    .sort();
}

const lastSegment = (name) => String(name ?? '').split('/').pop();
const succeeded = (condition) => condition?.state === 'CONDITION_SUCCEEDED';
const conditionText = (c) => `${c?.state ?? 'no condition'}${c?.message ? `: ${c.message.split('\n')[0]}` : ''}`;

function arPackageUrl(image) {
  return (
    `https://artifactregistry.googleapis.com/v1/projects/${image.project}/locations/${image.location}` +
    `/repositories/${image.repository}/packages/${encodeURIComponent(image.package)}`
  );
}

async function orNullOn404(promise) {
  try {
    return await promise;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/** Run `fn` over `items`, at most `limit` at a time, keeping order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Whether `servingImage` is what the function's build made. It is when the
 * build's tag still points at it, or — when a later build reused that package
 * name for other functions and moved the tag — when that digest was pushed
 * into the build's package while the build ran.
 */
async function imageProblem(api, build, servingImage, cache) {
  const built = builtImage(build);
  if (!built) return `its build ${lastSegment(build.name)} names no image`;
  if (!servingImage?.digest) return `its serving revision runs an unpinned image`;
  const runs = `${servingImage.package}@${servingImage.digest.slice(0, 19)}…`;
  if (
    servingImage.location !== built.location ||
    servingImage.repository !== built.repository ||
    servingImage.package !== built.package
  ) {
    return `runs ${runs}, not the ${built.package} image its build ${lastSegment(build.name).slice(0, 8)} made`;
  }
  const tagUrl = `${arPackageUrl(built)}/tags/${encodeURIComponent(built.tag ?? 'latest')}`;
  cache.tags[tagUrl] ??= orNullOn404(api(tagUrl));
  const tag = await cache.tags[tagUrl];
  if (tag && lastSegment(tag.version) === servingImage.digest) return null;
  const versionUrl = `${arPackageUrl(built)}/versions/${servingImage.digest}`;
  cache.versions[versionUrl] ??= orNullOn404(api(versionUrl));
  const version = await cache.versions[versionUrl];
  const pushedAt = Date.parse(version?.createTime ?? '');
  const start = Date.parse(build.createTime ?? '');
  const end = Date.parse(build.finishTime ?? build.createTime ?? '');
  if (pushedAt >= start && pushedAt <= end) return null;
  return `runs ${runs}, not the image its build ${lastSegment(build.name).slice(0, 8)} made`;
}

/** Why one deployed function is not healthy and serving its build — none if it is. */
export async function functionHealthProblems(api, fn, { now = Date.now(), cache = { builds: {}, tags: {}, versions: {} } } = {}) {
  const problems = [];
  if (fn.state !== 'ACTIVE') {
    const stuck = TRANSIENT_FUNCTION_STATES.has(fn.state) ? ' (still settling after the wait)' : '';
    problems.push(`state is ${fn.state ?? 'unknown'}${stuck}`);
  }
  for (const m of fn.stateMessages ?? []) {
    if (m.severity === 'ERROR') problems.push(`${m.type ?? 'error'}: ${String(m.message ?? '').split('\n')[0]}`);
  }
  if (problems.length) return problems;

  const serviceName = fn.serviceConfig?.service;

  if (fn.eventTrigger) {
    const triggerName = fn.eventTrigger.trigger;
    const trigger = triggerName ? await orNullOn404(api(`https://eventarc.googleapis.com/v1/${triggerName}`)) : null;
    if (!trigger) {
      problems.push(triggerName ? `its Eventarc trigger ${lastSegment(triggerName)} is missing` : 'has no Eventarc trigger');
    } else {
      const dest = trigger.destination ?? {};
      const delivers = dest.cloudFunction === fn.name || (serviceName && lastSegment(dest.cloudRun?.service) === lastSegment(serviceName));
      if (!delivers) problems.push(`its Eventarc trigger ${lastSegment(triggerName)} delivers to something else`);
      for (const [key, c] of Object.entries(trigger.conditions ?? {})) {
        if (c?.code && c.code !== 'OK') problems.push(`its Eventarc trigger ${key}: ${c.code}${c.message ? ` ${c.message}` : ''}`);
      }
    }
  }

  // A 1st-gen function has no Cloud Run service; state and trigger are all there is.
  if (!serviceName) return problems;

  const service = await orNullOn404(api(`https://run.googleapis.com/v2/${serviceName}`));
  if (!service) return [...problems, `its Cloud Run service ${lastSegment(serviceName)} is missing`];
  if (!succeeded(service.terminalCondition)) {
    problems.push(`its Cloud Run service is not Ready (${conditionText(service.terminalCondition)})`);
  }
  const expected = fn.serviceConfig.revision;
  const serving = servingRevisions(service);
  if (serving.length === 0) return [...problems, 'no revision receives traffic'];
  if (expected && (serving.length !== 1 || serving[0] !== expected)) {
    problems.push(`traffic goes to ${serving.join(', ')}, not its revision ${expected}`);
  }
  const revisionName = expected && serving.includes(expected) ? expected : serving[0];
  const revision = await orNullOn404(api(`https://run.googleapis.com/v2/${serviceName}/revisions/${revisionName}`));
  if (!revision) return [...problems, `its serving revision ${revisionName} is missing`];
  const ready = (revision.conditions ?? []).find((c) => c.type === 'Ready');
  if (!succeeded(ready)) problems.push(`its serving revision ${revisionName} is not Ready (${conditionText(ready)})`);

  const buildName = fn.buildConfig?.build;
  if (buildName) {
    cache.builds[buildName] ??= orNullOn404(api(`https://cloudbuild.googleapis.com/v1/${buildName}`));
    const build = await cache.builds[buildName];
    const age = now - Date.parse(build?.finishTime ?? build?.createTime ?? '');
    if (build && age <= IMAGE_CHECK_MAX_BUILD_AGE_MS) {
      const problem = await imageProblem(api, build, parseImage(revision.containers?.[0]?.image), cache);
      if (problem) problems.push(problem);
    }
  }
  return problems;
}

const listFunctions = (api, project) =>
  paged(api, `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/-/functions?pageSize=200`, 'functions');

/**
 * The deployed functions, re-listed while any is still settling — `firebase
 * deploy` returns once each operation is accepted, so a function updated in an
 * early batch may still be DEPLOYING when this runs.
 */
export async function settledFunctions(api, project, { attempts = 6, delayMs = 15000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    const fns = await listFunctions(api, project);
    const settling = fns.filter((f) => TRANSIENT_FUNCTION_STATES.has(f.state));
    if (settling.length === 0 || attempt >= attempts) return fns;
    console.log(`   ${settling.length} function(s) still settling, waiting…`);
    await sleep(delayMs);
  }
}

// ------------------------------------------------------------ data stores
//
// Every place a project keeps data, one line each with where it lives and how
// long it keeps it: an undeclared store — a bucket made by hand, a backup
// schedule deleted, a log bucket's retention raised — fails parity like any
// other drift. Ported from Órdago's data-store census (ordago-apps
// scripts/check-data-stores.js), folded into this check so the existing
// deploy gate and nightly run carry it.

/** `604800s` → `7d`; a duration that is not whole days stays in seconds. */
export function durationText(seconds) {
  const s = Number(/^(\d+)s$/.exec(String(seconds ?? ''))?.[1]);
  if (!Number.isFinite(s)) return 'none';
  return s % 86400 === 0 ? `${s / 86400}d` : `${s}s`;
}

/** A Firestore backup schedule: its recurrence and how long each backup is kept. */
export function backupScheduleLine(database, schedule) {
  const recurrence = schedule.dailyRecurrence
    ? 'daily'
    : schedule.weeklyRecurrence
      ? `weekly:${schedule.weeklyRecurrence.day ?? 'unspecified'}`
      : 'unknown';
  return `firestore-backup ${database} ${recurrence} retention=${durationText(schedule.retention)}`;
}

/** A bucket's lifecycle rules, condition keys sorted, so a reordering is not drift. */
export function lifecycleText(bucket) {
  const rules = bucket.lifecycle?.rule ?? [];
  if (rules.length === 0) return 'none';
  return rules
    .map((r) => {
      const cond = Object.entries(r.condition ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('|') : v}`)
        .join(',');
      return `${String(r.action?.type ?? '').toLowerCase()}${r.action?.storageClass ? `:${r.action.storageClass}` : ''}(${cond})`;
    })
    .sort()
    .join(';');
}

export function bucketLine(bucket) {
  const lock = bucket.retentionPolicy?.retentionPeriod
    ? ` retentionPolicy=${durationText(`${bucket.retentionPolicy.retentionPeriod}s`)}`
    : '';
  return `storage ${bucket.name} ${bucket.location} lifecycle=${lifecycleText(bucket)}${lock}`;
}

export function logBucketLine(bucket) {
  const [, location, id] = /\/locations\/([^/]+)\/buckets\/([^/]+)$/.exec(bucket.name ?? '') ?? [];
  return `log-bucket ${location}/${id} retention=${bucket.retentionDays ?? 'default'}d${bucket.locked ? ' locked' : ''}`;
}

/** A sink by name and destination; its filter by hash, since filters run to hundreds of characters. */
export function logSinkLine(sink) {
  const state = sink.disabled ? ' disabled' : '';
  return `log-sink ${sink.name} -> ${sink.destination} filter=${sink.filter ? sha(sink.filter) : 'none'}${state}`;
}

/** `86400000` ms → `1d`; absent means tables never expire. */
function msText(ms) {
  return ms == null ? 'none' : durationText(`${Math.round(Number(ms) / 1000)}s`);
}

/**
 * A BigQuery dataset: where it lives and how long its tables, partitions and
 * time-travel history are kept. The list call (no `all=true`) leaves out the
 * hidden `_…` datasets BigQuery makes for anonymous query results.
 */
export function bigQueryDatasetLine(dataset) {
  return (
    `bigquery-dataset ${dataset.datasetReference?.datasetId} ${dataset.location}` +
    ` tableExpiration=${msText(dataset.defaultTableExpirationMs)}` +
    ` partitionExpiration=${msText(dataset.defaultPartitionExpirationMs)}` +
    ` timeTravel=${dataset.maxTimeTravelHours ? `${dataset.maxTimeTravelHours}h` : 'default'}`
  );
}

export async function dataStoreLines(api, project) {
  const databases = await paged(api, `https://firestore.googleapis.com/v1/projects/${project}/databases`, 'databases');
  const lines = [];
  for (const db of databases) {
    const id = lastSegment(db.name);
    lines.push(`firestore-database ${id} ${db.locationId}`);
    const { backupSchedules = [] } = await api(
      `https://firestore.googleapis.com/v1/projects/${project}/databases/${encodeURIComponent(id)}/backupSchedules`,
    );
    for (const s of backupSchedules) lines.push(backupScheduleLine(id, s));
  }
  const buckets = await paged(api, `https://storage.googleapis.com/storage/v1/b?project=${project}&maxResults=200`, 'items');
  lines.push(...buckets.map(bucketLine));
  const logBuckets = await paged(api, `https://logging.googleapis.com/v2/projects/${project}/locations/-/buckets?pageSize=100`, 'buckets');
  lines.push(...logBuckets.filter((b) => b.lifecycleState !== 'DELETE_REQUESTED').map(logBucketLine));
  const sinks = await paged(api, `https://logging.googleapis.com/v2/projects/${project}/sinks?pageSize=100`, 'sinks');
  lines.push(...sinks.map(logSinkLine));
  // Listing gives no retention, so each dataset is read too (needs
  // roles/bigquery.metadataViewer, granted by setup-ci-deploy-wif.sh).
  const datasets = await paged(api, `https://bigquery.googleapis.com/bigquery/v2/projects/${project}/datasets?maxResults=100`, 'datasets');
  for (const d of datasets) {
    const id = d.datasetReference.datasetId;
    lines.push(bigQueryDatasetLine(await api(`https://bigquery.googleapis.com/bigquery/v2/projects/${project}/datasets/${encodeURIComponent(id)}`)));
  }
  return lines.sort();
}

// ------------------------------------------------------------------ API reads

export async function accessToken() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.CI && existsSync(ADC_PATH)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = ADC_PATH;
  }
  const { access_token: token } = await admin.credential.applicationDefault().getAccessToken();
  return token;
}

export function client(token, project) {
  return async function api(url, init = {}) {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
        'x-goog-user-project': project,
        ...(init.body && { 'Content-Type': 'application/json' }),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(`${res.status} ${body?.error?.message ?? res.statusText} — ${url.split('?')[0]}`);
      err.status = res.status;
      throw err;
    }
    return body;
  };
}

export async function paged(api, url, key) {
  const items = [];
  let pageToken = '';
  do {
    const sep = url.includes('?') ? '&' : '?';
    const body = await api(`${url}${pageToken ? `${sep}pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    items.push(...(body[key] ?? []));
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);
  return items;
}

async function projectNumber(api, project) {
  return (await api(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}`)).projectNumber;
}

export async function configSnapshot(api, project, number) {
  const db = await api(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)`);
  const bucket = await api(`https://storage.googleapis.com/storage/v1/b/${project}.firebasestorage.app`);
  const apis = await paged(
    api,
    `https://serviceusage.googleapis.com/v1/projects/${number}/services?filter=state:ENABLED&pageSize=200`,
    'services',
  );
  const policy = await api(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}:getIamPolicy`, {
    method: 'POST',
    body: JSON.stringify({ options: { requestedPolicyVersion: 3 } }),
  });
  const secrets = await paged(api, `https://secretmanager.googleapis.com/v1/projects/${project}/secrets?pageSize=100`, 'secrets');
  const auth = await api(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`);
  const idps = await api(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/defaultSupportedIdpConfigs`);
  const repositories = await listRepositories(api, project);
  const dataStores = await dataStoreLines(api, project);

  const iam = [];
  for (const b of policy.bindings ?? []) {
    for (const m of b.members) {
      if (m.startsWith('serviceAccount:')) iam.push(`${m} ${b.role}${b.condition ? ` [${b.condition.title}]` : ''}`);
    }
  }

  return normalize(
    {
      firestore: {
        locationId: db.locationId,
        type: db.type,
        databaseEdition: db.databaseEdition ?? null,
        concurrencyMode: db.concurrencyMode,
        pointInTimeRecoveryEnablement: db.pointInTimeRecoveryEnablement,
        deleteProtectionState: db.deleteProtectionState,
      },
      bucket: {
        location: bucket.location,
        locationType: bucket.locationType,
        storageClass: bucket.storageClass,
        uniformBucketLevelAccess: bucket.iamConfiguration?.uniformBucketLevelAccess?.enabled ?? false,
        cors: bucket.cors ?? [],
      },
      auth: {
        email: auth.signIn?.email?.enabled ?? false,
        emailPasswordRequired: auth.signIn?.email?.passwordRequired ?? false,
        phone: auth.signIn?.phoneNumber?.enabled ?? false,
        anonymous: auth.signIn?.anonymous?.enabled ?? false,
        allowDuplicateEmails: auth.signIn?.allowDuplicateEmails ?? false,
        mfa: auth.mfa?.state ?? 'DISABLED',
        blockingFunctions: Object.keys(auth.blockingFunctions?.triggers ?? {}).sort(),
      },
      apis: apis.map((s) => s.config.name).sort(),
      iam: [...new Set(iam)].sort(),
      secrets: secrets.map((s) => s.name.split('/').pop()).sort(),
      authProviders: (idps.defaultSupportedIdpConfigs ?? [])
        .filter((c) => c.enabled)
        .map((c) => c.name.split('/').pop())
        .sort(),
      authDomains: [...(auth.authorizedDomains ?? [])].sort(),
      // Every Artifact Registry repository and its cleanup policy, `none` when
      // it has none: images otherwise pile up with every deploy
      // (scripts/setup-artifact-cleanup.mjs).
      artifactCleanup: repositories.flatMap(cleanupLines).sort(),
      dataStores,
    },
    { project, number },
  );
}

async function liveRules(api, project, release) {
  const { rulesetName } = await api(`https://firebaserules.googleapis.com/v1/projects/${project}/releases/${release}`);
  const ruleset = await api(`https://firebaserules.googleapis.com/v1/${rulesetName}`);
  return ruleset.source.files[0].content;
}

/**
 * Whether a breaking prod release is holding its backend: its rules and
 * functions then deliberately stay at the previous release until it is
 * published (release-announce.mjs records `holdBackend` on the pending doc).
 */
export async function backendHeld(api, project, env) {
  try {
    const doc = await api(
      `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/_admin/announce/pending/${env}`,
    );
    return doc.fields?.holdBackend?.booleanValue === true;
  } catch (err) {
    if (err.status === 404) return false;
    throw err;
  }
}

/** Live deploy artifacts compared with this checkout; returns problem lines. */
export async function artifactProblems(
  api,
  project,
  {
    held = false,
    readFile = (path) => readFileSync(resolve(repoRoot, path), 'utf8'),
    now = Date.now(),
    settle = {},
  } = {},
) {
  const problems = [];

  for (const [file, release] of held ? [] : [
    ['firestore.rules', 'cloud.firestore'],
    ['storage.rules', `firebase.storage/${project}.firebasestorage.app`],
  ]) {
    const live = await liveRules(api, project, release);
    const local = readFile(file);
    if (live !== local) problems.push(`rules: live ${file} (${sha(live)}) is not this commit's (${sha(local)})`);
  }

  const deployedIndexes = (
    await paged(
      api,
      `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/-/indexes`,
      'indexes',
    )
  ).map((ix) => indexKey({ ...ix, collectionGroup: ix.name.split('/collectionGroups/')[1].split('/')[0] }));
  const declared = JSON.parse(readFile('firestore.indexes.json')).indexes.map(indexKey);
  for (const k of declared) if (!deployedIndexes.includes(k)) problems.push(`indexes: missing ${k}`);
  for (const k of deployedIndexes) if (!declared.includes(k)) problems.push(`indexes: not in firestore.indexes.json ${k}`);

  if (!held) {
    const fns = await settledFunctions(api, project, settle);
    const deployedFns = fns.map((f) => lastSegment(f.name));
    const exported = exportedFunctionNames(readFile('functions/src/index.ts'));
    for (const n of exported) if (!deployedFns.includes(n)) problems.push(`functions: ${n} is exported but not deployed`);
    for (const n of deployedFns) if (!exported.includes(n)) problems.push(`functions: ${n} is deployed but not exported`);
    const cache = { builds: {}, tags: {}, versions: {} };
    const health = await mapLimit(
      fns.filter((f) => exported.includes(lastSegment(f.name))),
      8,
      async (f) => (await functionHealthProblems(api, f, { now, cache })).map((p) => `functions: ${lastSegment(f.name)} ${p}`),
    );
    problems.push(...health.flat());
  }

  return problems.sort();
}

// ----------------------------------------------------------------------- CLI

function arg(name) {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

/** Every difference between `env` and its declared state, as report lines. */
export async function checkEnv(env, scope, baseline, api, { readFile, alsoBaselines = [], now, settle } = {}) {
  const project = ENVS[env].project;
  const lines = [];
  if (scope !== 'artifacts') {
    const number = await projectNumber(api, project);
    const actual = await configSnapshot(api, project, number);
    const differences = configDifferences(actual, env, [baseline, ...alsoBaselines]);
    lines.push(...differences.map((l) => `config ${l}`));
  }
  if (scope !== 'config') {
    const held = await backendHeld(api, project, env);
    if (held) console.log(`   ${env}: a release is holding its backend — rules and functions not compared`);
    lines.push(...(await artifactProblems(api, project, { held, readFile, now, settle })).map((l) => `artifacts ${l}`));
  }
  return lines;
}

function permissionHint(err) {
  if (err?.status !== 403) return '';
  return (
    '\n  The reader needs roles/iam.securityReviewer, roles/serviceusage.serviceUsageViewer and' +
    '\n  roles/bigquery.metadataViewer on the project (scripts/setup-ci-deploy-wif.sh grants them to gha-deployer).'
  );
}

async function main() {
  const token = await accessToken();

  if (process.argv.includes('--write-baseline')) {
    const snapshots = {};
    for (const env of Object.keys(ENVS)) {
      const project = ENVS[env].project;
      const api = client(token, project);
      snapshots[env] = await configSnapshot(api, project, await projectNumber(api, project));
    }
    writeFileSync(BASELINE_PATH, `${JSON.stringify(draftBaseline(snapshots), null, 2)}\n`);
    console.log(`Drafted ${BASELINE_PATH}. Replace every "TODO" reason, or fix the env instead.`);
    return;
  }

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const invalid = validateBaseline(baseline);
  if (invalid.length) {
    for (const p of invalid) console.error(`::error::infra/env-parity.json: ${p}`);
    process.exit(1);
  }
  // --also-baseline=<file>: develop's baseline, accepted for the config scope
  // too (see configDifferences). Ignored when missing or invalid — it can only
  // widen what passes, never be the reason a deploy fails.
  const alsoBaselines = [];
  const alsoPath = arg('also-baseline');
  if (alsoPath && existsSync(alsoPath)) {
    const also = JSON.parse(readFileSync(alsoPath, 'utf8'));
    if (validateBaseline(also).length === 0) alsoBaselines.push(also);
    else console.log(`   ${alsoPath} is not a valid baseline — ignored`);
  }

  const scope = arg('scope') ?? 'all';
  if (!['config', 'artifacts', 'all'].includes(scope)) throw new Error(`unknown --scope=${scope}`);
  const envs = process.argv.includes('--all') ? Object.keys(ENVS) : [resolveEnv(arg('env'))];

  let failed = false;
  for (const env of envs) {
    const lines = await checkEnv(env, scope, baseline, client(token, ENVS[env].project), { alsoBaselines });
    console.log(`${lines.length ? '❌' : '✅'} ${env} (${ENVS[env].project}) — ${scope}`);
    for (const l of lines) console.log(`   ${l}`);
    if (lines.length) {
      failed = true;
      console.error(
        `::error::${env} has ${lines.length} difference(s) from the declared environment. ` +
          'Fix the env, or declare the difference with its reason in infra/env-parity.json.',
      );
    }
  }
  if (failed) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`::error::Environment parity check could not run: ${err.message}${permissionHint(err)}`);
    process.exit(1);
  });
}

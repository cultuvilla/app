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
 *              Manager names and Auth configuration. It must equal the
 *              committed baseline (infra/env-parity.json) plus that env's
 *              declared exceptions, each of which carries its reason. Every
 *              env is checked against the same baseline, so passing here
 *              means matching each other. Runs before anything is deployed.
 *
 *   artifacts  What a deploy puts there: the live Firestore and Storage rules
 *              equal this commit's files, the deployed composite indexes equal
 *              firestore.indexes.json, and the deployed functions are exactly
 *              the ones functions/src/index.ts exports. Runs after deploying.
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

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE_PATH = resolve(repoRoot, 'infra/env-parity.json');

/** Dimensions compared as sets; the rest are flat key → value maps. */
export const LIST_DIMENSIONS = ['apis', 'iam', 'secrets', 'authProviders', 'authDomains'];
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

// ------------------------------------------------------------------ API reads

async function accessToken() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.CI && existsSync(ADC_PATH)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = ADC_PATH;
  }
  const { access_token: token } = await admin.credential.applicationDefault().getAccessToken();
  return token;
}

function client(token, project) {
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
  { held = false, readFile = (path) => readFileSync(resolve(repoRoot, path), 'utf8') } = {},
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

  const deployedFns = (
    await paged(api, `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/-/functions?pageSize=200`, 'functions')
  ).map((f) => f.name.split('/').pop());
  const exported = exportedFunctionNames(readFile('functions/src/index.ts'));
  if (!held) {
    for (const n of exported) if (!deployedFns.includes(n)) problems.push(`functions: ${n} is exported but not deployed`);
    for (const n of deployedFns) if (!exported.includes(n)) problems.push(`functions: ${n} is deployed but not exported`);
  }

  return problems.sort();
}

// ----------------------------------------------------------------------- CLI

function arg(name) {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

/** Every difference between `env` and its declared state, as report lines. */
export async function checkEnv(env, scope, baseline, api, { readFile, alsoBaselines = [] } = {}) {
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
    lines.push(...(await artifactProblems(api, project, { held, readFile })).map((l) => `artifacts ${l}`));
  }
  return lines;
}

function permissionHint(err) {
  if (err?.status !== 403) return '';
  return (
    '\n  The reader needs roles/iam.securityReviewer and roles/serviceusage.serviceUsageViewer' +
    '\n  on the project (scripts/setup-ci-deploy-wif.sh grants both to gha-deployer).'
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

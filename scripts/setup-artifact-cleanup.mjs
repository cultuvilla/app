#!/usr/bin/env node
/**
 * setup-artifact-cleanup.mjs
 *
 * Every Artifact Registry repository in a project carries a cleanup policy, so
 * images stop piling up with every deploy. Dry run by default.
 *
 *   node scripts/setup-artifact-cleanup.mjs --env=<dev|beta|prod> [--apply] [--confirm]
 *
 * WHAT IT WRITES. Only to a repository with NO policy at all — an existing
 * policy is never touched, because `cleanupPolicies` is replaced, not merged.
 *
 *   gcf-artifacts   Firebase's own `firebase-functions-cleanup` (delete images
 *                   older than a day), the policy `firebase deploy` sets on every
 *                   functions repository. Cloud Run keeps serving a deployed
 *                   revision without its image, so this is what Firebase ships.
 *                   Writing anything else here would replace Firebase's.
 *   any other repo  keep the newest KEEP_RECENT versions of each image (the
 *                   rollback budget) and delete untagged ones older than
 *                   UNTAGGED_DAYS. `Keep` beats `Delete` when both match.
 *
 * Measured 2026-11-27: the only repositories in dev, beta and prod are the
 * three `gcf-artifacts` (europe-west1, us-central1, us-east1), each already
 * carrying Firebase's policy. This script is what keeps a new repository — a
 * Cloud Run service deployed from source creates `cloud-run-source-deploy` —
 * from growing without one, and infra/env-parity.json's `artifactCleanup`
 * dimension is what notices one.
 *
 * Adapted from Órdago's scripts/setup-artifact-cleanup.sh.
 */
import { fileURLToPath } from 'node:url';

export const FIREBASE_REPO = 'gcf-artifacts';
export const KEEP_RECENT = 5;
export const UNTAGGED_DAYS = 7;

export const FIREBASE_POLICY = {
  'firebase-functions-cleanup': {
    id: 'firebase-functions-cleanup',
    action: 'DELETE',
    condition: { tagState: 'ANY', olderThan: '86400s' },
  },
};

export const DEFAULT_POLICY = {
  'keep-recent-releases': {
    id: 'keep-recent-releases',
    action: 'KEEP',
    mostRecentVersions: { keepCount: KEEP_RECENT },
  },
  'delete-stale-untagged': {
    id: 'delete-stale-untagged',
    action: 'DELETE',
    condition: { tagState: 'UNTAGGED', olderThan: `${UNTAGGED_DAYS * 86400}s` },
  },
};

const AR = 'https://artifactregistry.googleapis.com/v1';

/** `projects/p/locations/l/repositories/r` → { location, repo }. */
export function repoId(name) {
  const parts = name.split('/');
  return { location: parts[3], repo: parts[5] };
}

/** One comparable line per policy of a repository, or `none` — the parity dimension. */
export function cleanupLines({ name, cleanupPolicies, cleanupPolicyDryRun }) {
  const { location, repo } = repoId(name);
  const at = `${location}/${repo}`;
  const policies = Object.values(cleanupPolicies ?? {});
  if (policies.length === 0) return [`${at} none`];
  const mode = cleanupPolicyDryRun ? ' (dry-run)' : '';
  return policies
    .map((p) => {
      const c = p.condition ?? {};
      const what = p.mostRecentVersions
        ? `keepCount=${p.mostRecentVersions.keepCount}`
        : [c.tagState && `tagState=${c.tagState}`, c.olderThan && `olderThan=${c.olderThan}`]
            .filter(Boolean)
            .join(',');
      return `${at} ${p.id} ${p.action} ${what}${mode}`;
    })
    .sort();
}

/** What to do with one repository: `keep` its policy, or `set` the given one. */
export function planFor(repository) {
  if (Object.keys(repository.cleanupPolicies ?? {}).length > 0) return { action: 'keep' };
  const { repo } = repoId(repository.name);
  return { action: 'set', policies: repo === FIREBASE_REPO ? FIREBASE_POLICY : DEFAULT_POLICY };
}

/**
 * Every repository of the project, each with its cleanup policies. The list
 * call omits `cleanupPolicies`, so each one is read on its own; and the API
 * has no all-locations listing, so every location is asked.
 */
export async function listRepositories(api, project) {
  const { locations = [] } = await api(`${AR}/projects/${project}/locations?pageSize=200`);
  const perLocation = await Promise.all(
    locations.map(async ({ locationId }) => {
      const body = await api(`${AR}/projects/${project}/locations/${locationId}/repositories?pageSize=1000`);
      return body.repositories ?? [];
    }),
  );
  const repos = await Promise.all(perLocation.flat().map((r) => api(`${AR}/${r.name}`)));
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

export async function setPolicies(api, name, policies) {
  return api(`${AR}/${name}?updateMask=cleanupPolicies,cleanupPolicyDryRun`, {
    method: 'PATCH',
    body: JSON.stringify({ cleanupPolicies: policies, cleanupPolicyDryRun: false }),
  });
}

/** Plan, and with `apply` write, every repository's policy. Returns counts. */
export async function run({ api, project, apply, log = console.log }) {
  const counts = { repositories: 0, kept: 0, set: 0 };
  for (const repository of await listRepositories(api, project)) {
    counts.repositories += 1;
    const { location, repo } = repoId(repository.name);
    const plan = planFor(repository);
    if (plan.action === 'keep') {
      counts.kept += 1;
      log(`  ${location}/${repo}: has ${Object.keys(repository.cleanupPolicies).join(', ')} → kept`);
      continue;
    }
    counts.set += 1;
    log(`  ${location}/${repo}: no policy → ${apply ? 'setting' : 'would set'} ${Object.keys(plan.policies).join(', ')}`);
    if (apply) await setPolicies(api, repository.name, plan.policies);
  }
  return counts;
}

async function main() {
  const { ENVS, resolveEnv } = await import('./lib/env-credentials.mjs');
  const { accessToken, client } = await import('./check-env-parity.mjs');
  const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const env = resolveEnv(arg('env'));
  const apply = process.argv.includes('--apply');
  if (apply && env === 'prod' && !process.argv.includes('--confirm')) {
    console.error('Refusing to write prod without --confirm.');
    process.exit(2);
  }
  const project = ENVS[env].project;
  console.log(`Artifact Registry cleanup — ${env} (${project}) — ${apply ? 'APPLY' : 'dry run'}`);
  const counts = await run({ api: client(await accessToken(), project), project, apply });
  console.log(`repositories: ${counts.repositories}  kept: ${counts.kept}  ${apply ? 'set' : 'to set'}: ${counts.set}`);
  if (!apply && counts.set) console.log('Dry run — re-run with --apply to write.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`::error::Artifact cleanup could not run: ${err.message}`);
    process.exit(1);
  });
}

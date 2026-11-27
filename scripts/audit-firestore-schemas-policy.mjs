/**
 * The weekly schema audit's policy — pure, dependency-free (no firebase-admin),
 * so the PR ratchet check runs without installing anything. Ported from
 * ordago-apps' scripts/lib/firestore-audit-policy.js, cut to two tracks:
 *
 *   GATED (fail closed unless allowlisted with a reason):
 *     schema-drift      a doc the shipped converter cannot parse
 *     unmatched-path    a doc at a path no collection template declares
 *     undeclared-root   a live root collection the table does not declare
 *   RATCHETED (fail on growth; the baseline may only shrink):
 *     unmodeled-field   a stored key the schema drops on parse
 *
 * Orphans (nonconforming docs under a deleted parent) are reported, never gated:
 * no reader reaches them by path.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { display, normalizePath } from './lib/conformance-walk.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ALLOWLIST_PATH = path.join(here, 'audit-firestore-schemas.allowlist.json');
export const BASELINE_PATH = path.join(here, 'audit-firestore-schemas.baseline.json');
/** Repo-relative, for `git show <ref>:<path>`. */
export const BASELINE_REPO_PATH = 'scripts/audit-firestore-schemas.baseline.json';
export const AUDIT_ENVS = ['beta', 'prod'];

export const driftSignature = (template, issue) =>
  `schema-drift :: ${display(template)} :: ${normalizePath(issue.path)} :: ${issue.code}`;

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** Every problem with the allowlist; empty when well-formed. */
export function validateAllowlist(list) {
  if (!Array.isArray(list)) return ['allowlist must be a JSON array'];
  const errors = [];
  const seen = new Set();
  list.forEach((entry, i) => {
    const where = `allowlist[${i}]`;
    if (!entry || typeof entry !== 'object') return errors.push(`${where}: not an object`);
    if (typeof entry.signature !== 'string' || !entry.signature.trim()) errors.push(`${where}: missing signature`);
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 10) {
      errors.push(`${where} (${entry.signature}): needs a reason of at least 10 characters`);
    }
    if (entry.envs !== undefined && (!Array.isArray(entry.envs) || entry.envs.some((e) => !AUDIT_ENVS.includes(e)))) {
      errors.push(`${where} (${entry.signature}): envs must be a subset of ${AUDIT_ENVS.join(', ')}`);
    }
    if (seen.has(entry.signature)) errors.push(`${where}: duplicate signature ${entry.signature}`);
    seen.add(entry.signature);
  });
  return errors;
}

/** Every problem with the baseline; empty when well-formed. */
export function validateBaseline(baseline) {
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) return ['baseline must be a JSON object'];
  const errors = [];
  for (const [env, list] of Object.entries(baseline)) {
    if (env.startsWith('$')) continue;
    if (!AUDIT_ENVS.includes(env)) errors.push(`baseline: unknown env "${env}"`);
    if (!Array.isArray(list) || list.some((s) => typeof s !== 'string')) {
      errors.push(`baseline.${env}: must be an array of signatures`);
      continue;
    }
    const sorted = [...new Set(list)].sort();
    if (sorted.length !== list.length || sorted.some((s, i) => s !== list[i])) {
      errors.push(`baseline.${env}: must be sorted and free of duplicates`);
    }
  }
  return errors;
}

/**
 * Apply the policy to one env's audit result (the JSON the audit writes).
 * `failures` non-empty means the run fails; `stale` lists recorded entries
 * that matched nothing this run — safe to delete.
 */
export function evaluate({ env, result, allowlist, baseline }) {
  const allowed = new Map(
    allowlist.filter((e) => !e.envs || e.envs.includes(env)).map((e) => [e.signature, e]),
  );
  const used = new Set();
  const failures = [];

  const gate = (signature, detail) => {
    if (allowed.has(signature)) used.add(signature);
    else failures.push({ signature, detail });
  };

  for (const target of result.targets) {
    const bySignature = new Map();
    for (const doc of target.bad) {
      for (const issue of doc.issues) {
        const signature = driftSignature(target.path, issue);
        if (!bySignature.has(signature)) bySignature.set(signature, { count: 0, example: doc.id, message: issue.message });
        bySignature.get(signature).count += 1;
      }
    }
    for (const [signature, { count, example, message }] of bySignature) {
      gate(signature, `${count} doc(s), e.g. ${example} — ${message}`);
    }
  }
  for (const p of result.unmatched) gate(`unmatched-path :: ${p}`, 'docs at a path no collection in refs/collections.ts declares');
  for (const root of result.undeclared) gate(`undeclared-root :: ${root}`, 'a live root collection refs/collections.ts does not declare');

  const recorded = new Set(baseline[env] ?? []);
  const seenUnmodeled = new Set(Object.keys(result.unmodeled));
  for (const [signature, { count, example }] of Object.entries(result.unmodeled)) {
    if (recorded.has(signature)) continue;
    const key = `unmodeled-field :: ${signature}`;
    if (allowed.has(key)) used.add(key);
    else failures.push({ signature: key, detail: `${count} doc(s), e.g. ${example} — stored but dropped by the schema` });
  }

  return {
    failures,
    stale: {
      allowlist: [...allowed.keys()].filter((s) => !used.has(s)),
      baseline: [...recorded].filter((s) => !seenUnmodeled.has(s)),
    },
  };
}

/** The baseline with `env`'s entries cut to those still seen. Never adds one. */
export function shrinkBaseline(baseline, env, seen) {
  const keep = new Set(seen);
  return { ...baseline, [env]: (baseline[env] ?? []).filter((s) => keep.has(s)) };
}

/** Signatures the head baseline carries that the base did not — the ratchet. */
export function ratchetGrowth(base, head) {
  const growth = [];
  for (const env of AUDIT_ENVS) {
    if (!base || !Array.isArray(base[env])) continue; // first recording of this env
    const before = new Set(base[env]);
    for (const s of head[env] ?? []) if (!before.has(s)) growth.push(`${env}: ${s}`);
  }
  return growth;
}

/** Markdown for the run summary. */
export function renderReport({ env, result, verdict }) {
  const docs = result.targets.reduce((n, t) => n + t.total, 0);
  const lines = [`## Schema audit — ${env} (${result.projectId})`, '', `${docs} docs across ${result.targets.length} collections, at ${result.gitSha?.slice(0, 7) ?? 'local'}.`, ''];
  if (verdict.failures.length === 0) lines.push('**PASS** — only allowlisted residuals and baselined unmodeled fields remain.');
  else {
    lines.push(`**FAIL** — ${verdict.failures.length} finding(s) neither allowlisted nor baselined:`, '');
    for (const f of verdict.failures) lines.push(`- \`${f.signature}\` — ${f.detail}`);
    lines.push('', 'Fix the data or the schema. Only if the residual is accepted, add it to `scripts/audit-firestore-schemas.allowlist.json` with a reason.');
  }
  if (result.orphans.length) lines.push('', `${result.orphans.length} nonconforming doc(s) under a deleted parent (reported, not gated).`);
  const stale = [...verdict.stale.allowlist.map((s) => `allowlist: ${s}`), ...verdict.stale.baseline.map((s) => `baseline: ${s}`)];
  if (stale.length) {
    lines.push('', 'Recorded entries that matched nothing this run — delete them (`--update-baseline` shrinks the baseline):', '');
    for (const s of stale) lines.push(`- \`${s}\``);
  }
  return `${lines.join('\n')}\n`;
}

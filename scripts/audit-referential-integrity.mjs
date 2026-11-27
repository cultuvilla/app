#!/usr/bin/env node
/**
 * audit-referential-integrity.mjs — READ-ONLY.
 *
 * Loads the collections the referential-integrity invariants read, runs them
 * (packages/shared/src/validation, pure and unit-tested) and prints, per
 * invariant, how many documents break it with a few example paths. Ids and
 * paths only: no names, phones or emails reach the report.
 *
 * There is no --apply. A finding is repaired by a registered backfill or a
 * reviewed one-off, dry run first — see .agents/skills/prod-data-repair.
 *
 * USAGE
 *   pnpm audit:refs                                   # dev (villa-events)
 *   pnpm audit:refs -- --env=beta                     # needs the stored ADC (~/.config/cultuvilla/adc.json)
 *   pnpm audit:refs -- --invariant=events.totalCount.matches --verbose
 *   pnpm audit:refs -- --list                         # invariant ids, no credentials
 *   pnpm audit:refs -- --json=report.json             # machine-readable report too
 *   Beta/prod without local credentials: Actions → "Audit Referential Integrity".
 *
 * EXIT: 0 when the audit ran (findings or not); 1 when it could not run;
 * with --strict, also 1 when any invariant is broken.
 *
 * SCALE: each referenced collection is read in full (an existence check needs
 * the whole target set; sampling would hide exactly the rows we look for), one
 * query per collection id. Narrow with --invariant if a run gets too large.
 */

import { writeFileSync } from 'node:fs';
import admin from 'firebase-admin';
import { initAdminForEnv } from './lib/env-credentials.mjs';
import { buildSnapshot, collectionsFor, loadQueries, registry, runInvariants } from '@cultuvilla/shared/validation';

function arg(flag) {
  const prefix = `${flag}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}
const has = (flag) => process.argv.includes(flag);

if (has('--list')) {
  for (const inv of registry) console.log(`${inv.id}\t${inv.description}\t[reads: ${inv.reads.join(', ')}]`);
  process.exit(0);
}

const only = (arg('--invariant') ?? '').split(',').filter(Boolean);
const selected = only.length > 0 ? registry.filter((inv) => only.includes(inv.id)) : registry;
const unknown = only.filter((id) => !registry.some((inv) => inv.id === id));
if (unknown.length > 0 || selected.length === 0) {
  console.error(`Unknown invariant(s): ${unknown.join(', ') || '(none selected)'}. Use --list.`);
  process.exit(1);
}
const examples = has('--verbose') ? Infinity : Number(arg('--examples') ?? 5);

const { env, projectId } = initAdminForEnv(arg('--env') ?? 'dev');
const db = admin.firestore();
const log = (...a) => console.log(`[ref-integrity][${env}]`, ...a);

async function load(keys) {
  const raw = [];
  for (const query of loadQueries(keys)) {
    const source = query.group ? db.collectionGroup(query.collectionId) : db.collection(query.collectionId);
    for await (const doc of source.stream()) raw.push({ path: doc.ref.path, data: doc.data() });
  }
  return buildSnapshot(raw, keys);
}

async function main() {
  log(`READ-ONLY audit of ${projectId}: ${selected.length} invariants`);
  const keys = collectionsFor(selected);
  const started = Date.now();
  const snap = await load(keys);
  for (const key of keys) log(`  loaded ${key}: ${snap[key]?.size ?? 0}`);
  log(`  in ${Math.round((Date.now() - started) / 1000)}s`);

  const violations = runInvariants(snap, selected);
  const byInvariant = new Map(selected.map((inv) => [inv.id, []]));
  for (const v of violations) byInvariant.get(v.invariant).push(v);

  console.log('');
  log('===== REPORT =====');
  const rows = [];
  for (const inv of selected) {
    const hits = byInvariant.get(inv.id);
    const scanned = snap[inv.reads[0]]?.size ?? 0;
    rows.push({ id: inv.id, description: inv.description, scanned, violations: hits.length, examples: hits.slice(0, 50) });
    console.log(`${hits.length === 0 ? 'ok  ' : 'FAIL'} ${inv.id}: ${hits.length} / ${scanned}`);
    for (const v of hits.slice(0, examples)) console.log(`       ${v.message}`);
    if (hits.length > examples) console.log(`       … ${hits.length - examples} more (--verbose)`);
  }
  const broken = rows.filter((r) => r.violations > 0).length;
  console.log('');
  log(`TOTAL: ${violations.length} violations across ${broken} of ${selected.length} invariants`);

  const jsonPath = arg('--json');
  if (jsonPath) {
    writeFileSync(jsonPath, `${JSON.stringify({ env, projectId, at: new Date().toISOString(), total: violations.length, invariants: rows }, null, 2)}\n`);
    log(`report written to ${jsonPath}`);
  }
  process.exit(has('--strict') && violations.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Audit failed:', err?.stack ?? err);
  process.exit(1);
});

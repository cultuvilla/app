#!/usr/bin/env node
/**
 * census-fields.mjs — READ-ONLY field census for one collection.
 *
 * Tallies every field path the stored docs actually carry: the Firestore
 * type(s) seen at each path and the share of docs carrying it. It knows nothing
 * about the schema; its job is to make each stored field a conscious decision
 * when tightening a converter — model it, or backfill it away — before the
 * strict parse silently drops it. Pairs with the unmodeled-field baseline of
 * the weekly schema audit (audit-firestore-schemas.mjs).
 * Ported from ordago-apps' admin-firestore-field-census.js. Writes nothing.
 *
 * USAGE
 *   pnpm census:fields --collection=events --env=dev
 *   pnpm census:fields --collection='organizations/{organizationId}/members' --env=beta --limit=2000 --json
 *
 * `--collection` takes a root collection id or a path template from
 * refs/collections.ts (any `{x}` or `*` segment matches every parent). For
 * beta/prod, unset GOOGLE_APPLICATION_CREDENTIALS first so the stored ADC is
 * used (see scripts/lib/env-credentials.mjs).
 */

import admin from 'firebase-admin';
import { initAdminForEnv } from './lib/env-credentials.mjs';
import { isMain } from './lib/backfill-harness.mjs';
import { templateRegex } from './lib/conformance-walk.mjs';

/** Firestore value → census type label. */
export function fsType(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return 'array';
  if (v instanceof admin.firestore.Timestamp) return 'timestamp';
  if (v instanceof admin.firestore.GeoPoint) return 'geopoint';
  if (v instanceof admin.firestore.DocumentReference) return 'reference';
  const t = typeof v;
  return t === 'object' ? 'map' : t;
}

/** Add one doc's field paths to `stats` (Map<path, { types: Set, docCount }>). */
export function tallyDoc(data, stats, typeOf = fsType) {
  const seen = new Set();
  const record = (path, type) => {
    let s = stats.get(path);
    if (!s) stats.set(path, (s = { types: new Set(), docCount: 0 }));
    s.types.add(type);
    if (!seen.has(path)) {
      s.docCount += 1;
      seen.add(path);
    }
  };
  const walk = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      const t = typeOf(v);
      record(path, t);
      if (t === 'map') walk(v, path);
      else if (t === 'array') {
        for (const el of v) record(`${path}[]`, typeOf(el));
        for (const el of v.slice(0, 50)) if (typeOf(el) === 'map') walk(el, `${path}[]`);
      }
    }
  };
  walk(data ?? {}, '');
}

export function censusRows(stats, scanned) {
  return [...stats.entries()]
    .map(([path, s]) => ({
      path,
      types: [...s.types].sort().join('|'),
      pct: scanned ? Math.round((s.docCount / scanned) * 1000) / 10 : 0,
      docCount: s.docCount,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function main() {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const collection = arg('collection');
  const envArg = arg('env') ?? 'dev';
  const limit = arg('limit') ? Number(arg('limit')) : Infinity;
  if (!collection || !(limit > 0)) {
    console.error('Usage: census-fields.mjs --collection=<id or path template> [--env=dev|beta|prod] [--limit=N] [--json]');
    process.exit(2);
  }

  const { projectId } = initAdminForEnv(envArg);
  const db = admin.firestore();
  const template = collection.replace(/\*/g, '{x}');
  const id = template.slice(template.lastIndexOf('/') + 1);
  const matches = templateRegex(template);

  const stats = new Map();
  let scanned = 0;
  for await (const doc of db.collectionGroup(id).stream()) {
    if (!matches.test(doc.ref.path)) continue;
    tallyDoc(doc.data(), stats);
    scanned += 1;
    if (scanned >= limit) break;
  }
  const rows = censusRows(stats, scanned);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ project: projectId, collection, scanned, fields: rows }, null, 2));
    return;
  }
  console.log(`\nField census — ${collection} @ ${projectId} (${scanned} docs${limit !== Infinity ? `, capped at ${limit}` : ''})\n`);
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad('FIELD PATH', 52)}${pad('TYPES', 24)}PRESENT`);
  console.log('-'.repeat(84));
  for (const r of rows) console.log(`${pad(r.path, 52)}${pad(r.types, 24)}${r.pct}%`);
  console.log(`\n${rows.length} distinct field paths.`);
}

if (isMain(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

#!/usr/bin/env node
/**
 * seed-municipalities.mjs
 *
 * Idempotently seeds the Firestore `municipalities` collection with Spanish
 * provincial capitals (INE codes) from scripts/data/municipalities-es.json.
 *
 * USAGE
 *   pnpm seed:municipalities                        # dev
 *   node scripts/seed-municipalities.mjs --env=beta --confirm
 *   node scripts/seed-municipalities.mjs --env=prod --confirm
 *   node scripts/seed-municipalities.mjs --dry-run  # report only, no writes
 *
 * Credentials + project id are resolved per-env by scripts/lib/env-credentials.mjs;
 * beta/prod require an explicit --confirm (scripts/lib/env-confirm.mjs).
 *
 * FULL INE DATASET
 *   Replace scripts/data/municipalities-es.json with a fuller dataset (same
 *   shape: array of { name, province, comunidadAutonoma, codigoINE }) — see
 *   scripts/fetch-municipalities.mjs.
 *
 * PURELY ADDITIVE: entries are matched by codigoINE and only the missing ones
 * are created. Existing docs are never touched, so activated `community`
 * overlays, escudos and admin uploads survive a re-run untouched.
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { initAdminForEnv } from './lib/env-credentials.mjs';
import { parseEnvConfirm } from './lib/env-confirm.mjs';
import { searchKey, searchPrefixes } from './lib/municipality-search.mjs';
import { assignMunicipalitySlugs } from '@cultuvilla/shared/models';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRY_RUN = process.argv.slice(2).includes('--dry-run');

// ── Init firebase-admin for the target env ───────────────────────────────────

const env = parseEnvConfirm(process.argv.slice(2).filter((a) => a !== '--dry-run'));
const { projectId, auth } = initAdminForEnv(env);
console.log(`[seed] env=${env} project=${projectId} auth=${auth}${DRY_RUN ? ' (dry-run)' : ''}`);

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// ── Load seed data ────────────────────────────────────────────────────────────

const dataPath = path.join(__dirname, 'data', 'municipalities-es.json');
if (!existsSync(dataPath)) {
  console.error(`[seed] Data file not found: ${dataPath}`);
  process.exit(1);
}

/** @type {Array<{ name: string, province: string, comunidadAutonoma: string, codigoINE: string }>} */
const seedData = JSON.parse(readFileSync(dataPath, 'utf8'));

if (!Array.isArray(seedData) || seedData.length === 0) {
  console.error('[seed] Data file is empty or not an array.');
  process.exit(1);
}

console.log(`[seed] Loaded ${seedData.length} entries from ${dataPath}`);

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const collection = db.collection('municipalities');

  // 1. Fetch all codigoINE values that already exist (single query, no per-doc reads)
  const existingSnap = await collection.select('codigoINE', 'slug').get();
  const existingCodes = new Set(existingSnap.docs.map((d) => d.data().codigoINE));
  const takenSlugs = existingSnap.docs.map((d) => d.data().slug).filter((s) => typeof s === 'string');

  console.log(`[seed] Existing municipalities in Firestore: ${existingCodes.size}`);

  // 2. Determine which entries to write
  const toWrite = seedData.filter((entry) => !existingCodes.has(entry.codigoINE));
  const skipCount = seedData.length - toWrite.length;

  if (toWrite.length === 0) {
    console.log(`[seed] Nothing to write.`);
    console.log(`Created: 0 | Skipped (already existed): ${skipCount}`);
    process.exit(0);
  }

  // Existing docs are never modified, so anything already activated as a village
  // is safe; report the count so a re-run's blast radius is visible up front.
  const activeSnap = await collection.where('communityActive', '==', true).count().get();
  console.log(
    `[seed] To create: ${toWrite.length} | untouched existing: ${skipCount} ` +
      `(of which ${activeSnap.data().count} are activated villages)`,
  );

  if (DRY_RUN) {
    console.log('[seed] --dry-run: no writes. First 10 that would be created:');
    for (const e of toWrite.slice(0, 10)) {
      console.log(`    ${e.codigoINE}  ${e.name} (${e.province})`);
    }
    process.exit(0);
  }

  const slugs = assignMunicipalitySlugs(
    toWrite.map((e) => ({ id: e.codigoINE, name: e.name, province: e.province, codigoINE: e.codigoINE })),
    takenSlugs,
  );

  // 3. Write in batches of max 500
  const BATCH_SIZE = 500;
  let created = 0;

  for (let i = 0; i < toWrite.length; i += BATCH_SIZE) {
    const chunk = toWrite.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const entry of chunk) {
      const docRef = collection.doc(); // auto-ID
      const nameLower = searchKey(entry.name);
      const nameAliases = entry.nameAliases ?? [];
      const localityNames = entry.localityNames ?? [];
      batch.set(docRef, {
        name: entry.name,
        nameLower,
        nameAliases,
        localityNames,
        searchPrefixes: searchPrefixes(entry.name, nameAliases, localityNames),
        province: entry.province,
        comunidadAutonoma: entry.comunidadAutonoma,
        codigoINE: entry.codigoINE,
        slug: slugs.get(entry.codigoINE),
        coordinates: null,
        locationLabel: null,
        mapZoom: null,
        escudoUrl: null,
        escudoThumbUrl: null,
        escudoManualUrl: null,
        community: null,
        communityActive: false,
        peopleCount: 0,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    created += chunk.length;
    console.log(`[seed] Batch committed: ${created}/${toWrite.length} new documents`);
  }

  console.log(`\nCreated: ${created} | Skipped (already existed): ${skipCount}`);
}

main().catch((err) => {
  console.error('[seed] Fatal error:', err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Add `community.organizerSex` to every municipality with a community — the Embajador's own
 * `persons.sex`, denormalized so the app can say "Embajador" or "Embajadora"
 * without reading a person doc that may be private. `null` when the pueblo has
 * no Embajador or the Embajador has no person/sex on record.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills" and
 * `pnpm backfills:list`.
 *
 *   node scripts/backfill-community-organizer-sex.mjs --env=dev            (dry run)
 *   node scripts/backfill-community-organizer-sex.mjs --env=dev --apply
 */

import { backfillCollection } from './lib/backfill.mjs';
import { isMain, runBackfill } from './lib/backfill-harness.mjs';

export const meta = {
  id: 'community-organizer-sex',
  kind: 'backfill',
  description: 'Denormalize the Embajador sex onto municipalities.community.organizerSex (Embajador/Embajadora title)',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: [],
};

const SEXES = new Set(['male', 'female', 'other']);

export async function run({ db, apply, log }) {
  log('municipalities.community.organizerSex');

  async function sexOf(userId) {
    const snap = await db.collection('persons').where('userId', '==', userId).limit(1).get();
    if (snap.empty) return null;
    const sex = snap.docs[0].get('sex');
    return SEXES.has(sex) ? sex : null;
  }

  async function patchFor(data) {
    const community = data.community;
    if (!community || typeof community !== 'object') return null;
    const want = community.organizerId ? await sexOf(community.organizerId) : null;
    if (Object.prototype.hasOwnProperty.call(community, 'organizerSex') && community.organizerSex === want) {
      return null;
    }
    return { 'community.organizerSex': want };
  }

  const { total, patched } = await backfillCollection(
    db,
    'municipalities',
    // Whole collection, not `communityActive == true`: the strict converter
    // rejects ANY doc carrying a community object without the field.
    db.collection('municipalities'),
    patchFor,
    { apply },
  );
  return { total, patched };
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });

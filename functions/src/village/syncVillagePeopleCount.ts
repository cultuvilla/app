import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { municipalityDoc, municipalityPeopleCollection } from '@cultuvilla/shared/firebase/refs/admin';

const db = getFirestore();

function rowMunicipality(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Counts and writes inside one transaction that also reads the municipality
 * doc. Invocations for the same village run in no particular order, so a bare
 * count-then-write could let a slow invocation overwrite a newer count with an
 * older one. Reading the doc makes every pair of overlapping invocations
 * conflict: the later committer retries and counts again, so the last write is
 * always the freshest count. Returns null when the municipality doc is gone.
 */
async function recount(municipalityId: string): Promise<number | null> {
  const ref = municipalityDoc(db, municipalityId).withConverter(null);
  const rows = municipalityPeopleCollection(db)
    .where('municipalityId', '==', municipalityId)
    .count();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const peopleCount = (await tx.get(rows)).data().count;
    tx.update(ref, { peopleCount });
    return peopleCount;
  });
}

/**
 * Keeps `municipalities/{id}.peopleCount` equal to the number of rows the
 * village has in the `municipalityPeople` projection. The projection is
 * member-only, so the count is copied onto the public municipality doc for
 * every viewer.
 *
 * It recounts rather than increments: an aggregate count is one read, and a
 * recount heals any drift — including rows written between the backfill and
 * this trigger's first deploy — where an increment would carry it forever.
 */
export const syncVillagePeopleCount = onDocumentWritten(
  { document: 'municipalityPeople/{rowId}', region: 'us-central1' },
  async (event) => {
    const handler = 'syncVillagePeopleCount';
    const before = rowMunicipality(event.data?.before.data()?.['municipalityId']);
    const after = rowMunicipality(event.data?.after.data()?.['municipalityId']);

    // syncMunicipalityPeople rewrites a row with a full set() on every person
    // edit; only a row joining or leaving a village moves the count.
    if (before === after) return;

    const affected = [before, after].filter((id): id is string => id !== null);
    for (const municipalityId of affected) {
      const peopleCount = await recount(municipalityId);
      if (peopleCount === null) continue;
      logger.info('village people count updated', {
        handler,
        rowId: event.params.rowId,
        municipalityId,
        peopleCount,
      });
    }
  },
);

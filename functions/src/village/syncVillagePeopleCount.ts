import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { municipalityDoc, municipalityPeopleCollection } from '@cultuvilla/shared/firebase/refs/admin';
import { isNotFound } from '../interaction/syncEntityInteractionCounts';

const db = getFirestore();

function rowMunicipality(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
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
      const snap = await municipalityPeopleCollection(db)
        .where('municipalityId', '==', municipalityId)
        .count()
        .get();
      const peopleCount = snap.data().count;
      try {
        await municipalityDoc(db, municipalityId).update('peopleCount', peopleCount);
      } catch (err) {
        if (isNotFound(err)) continue;
        throw err;
      }
      logger.info('village people count updated', {
        handler,
        rowId: event.params.rowId,
        municipalityId,
        peopleCount,
      });
    }
  },
);

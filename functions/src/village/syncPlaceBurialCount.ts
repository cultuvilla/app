import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { municipalityPlaceDoc } from '@cultuvilla/shared/firebase/refs/admin';
import { isNotFound } from '../interaction/syncEntityInteractionCounts';
import { defineDocumentTrigger } from '../shared/define/defineDocumentTrigger';

const db = getFirestore();

interface BurialPlace {
  municipalityId: string;
  placeId: string;
}

function burialPlace(value: unknown): BurialPlace | null {
  const raw = value as Partial<BurialPlace> | null;
  if (!raw || typeof raw.municipalityId !== 'string' || typeof raw.placeId !== 'string') {
    return null;
  }
  return { municipalityId: raw.municipalityId, placeId: raw.placeId };
}

function burialKey(place: BurialPlace | null): string | null {
  return place ? `${place.municipalityId}/${place.placeId}` : null;
}

export const syncPlaceBurialCount = defineDocumentTrigger(
  'syncPlaceBurialCount',
  { kind: 'written', document: 'persons/{personId}' },
  async (event) => {
    const handler = 'syncPlaceBurialCount';
    const before = burialPlace(event.data?.before.data()?.['burialPlace']);
    const after = burialPlace(event.data?.after.data()?.['burialPlace']);

    if (burialKey(before) === burialKey(after)) return;

    const deltas: { place: BurialPlace; delta: number }[] = [];
    if (before) deltas.push({ place: before, delta: -1 });
    if (after) deltas.push({ place: after, delta: 1 });

    const { personId } = event.params;
    for (const { place, delta } of deltas) {
      try {
        await municipalityPlaceDoc(db, place.municipalityId, place.placeId).update(
          'burialCount',
          FieldValue.increment(delta),
        );
      } catch (err) {
        if (isNotFound(err)) continue;
        throw err;
      }
      logger.info('place burial count updated', {
        handler,
        personId,
        municipalityId: place.municipalityId,
        placeId: place.placeId,
        delta,
      });
    }
  },
);

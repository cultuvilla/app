import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { municipalityBarrioDoc } from '@cultuvilla/shared/firebase/refs/admin';
import { isDeceased } from '@cultuvilla/shared/models';
import type { BurialPlace, PartialDate } from '@cultuvilla/shared/models';
import { isNotFound } from '../interaction/syncEntityInteractionCounts';

const db = getFirestore();

interface ResidenceLink {
  municipalityId: string;
  barrioId: string | null;
}

// A deceased persona belongs to the cemetery, not the barrio resident count.
// Zeroing their barrio set on each side of the diff means they never add to a
// count, and a living resident who dies is decremented out of it.
function residentBarrioKeys(data: Record<string, unknown> | undefined): Map<string, ResidenceLink> {
  if (!data) return new Map<string, ResidenceLink>();
  const deceased = isDeceased({
    deathDate: (data['deathDate'] ?? null) as PartialDate | null,
    burialPlace: (data['burialPlace'] ?? null) as BurialPlace | null,
  });
  return deceased ? new Map<string, ResidenceLink>() : barrioKeys(data['municipalityLinks']);
}

// A barrio is identified across municipalities by (municipalityId, barrioId).
// `barrioId: null` links ("whole village") belong to no specific barrio and are
// dropped, matching `getBarrioResidentCount`'s array-contains query.
function barrioKeys(links: unknown): Map<string, ResidenceLink> {
  const out = new Map<string, ResidenceLink>();
  if (!Array.isArray(links)) return out;
  for (const raw of links) {
    const link = raw as Partial<ResidenceLink> | null;
    if (!link || typeof link.municipalityId !== 'string' || typeof link.barrioId !== 'string') {
      continue;
    }
    out.set(`${link.municipalityId}/${link.barrioId}`, {
      municipalityId: link.municipalityId,
      barrioId: link.barrioId,
    });
  }
  return out;
}

/**
 * Keeps `municipalities/{mid}/barrios/{bid}.residentCount` in step with the
 * persons who list that barrio in their `municipalityLinks`. Residency is
 * written from many client and server paths (join/leave, change-barrio,
 * startVillage, membership-delete cleanup, account deletion), so a single
 * persons write-trigger diffing the barrio set is the robust single writer.
 *
 * A barrio present only after → +1; present only before → -1; unchanged → skip.
 * Deleting a person removes all their links (all -1). Uses the field-path
 * `.update()` overload (no converter) and swallows NOT_FOUND so a person whose
 * barrio was deleted concurrently doesn't retry forever.
 */
export const syncBarrioResidentCount = onDocumentWritten(
  { document: 'persons/{personId}', region: 'us-central1' },
  async (event) => {
    const handler = 'syncBarrioResidentCount';
    const before = residentBarrioKeys(event.data?.before.data());
    const after = residentBarrioKeys(event.data?.after.data());

    const deltas = new Map<string, { link: ResidenceLink; delta: number }>();
    for (const [key, link] of after) {
      if (!before.has(key)) deltas.set(key, { link, delta: 1 });
    }
    for (const [key, link] of before) {
      if (!after.has(key)) deltas.set(key, { link, delta: -1 });
    }
    if (deltas.size === 0) return;

    const { personId } = event.params;
    for (const { link, delta } of deltas.values()) {
      const barrioId = link.barrioId as string;
      try {
        await municipalityBarrioDoc(db, link.municipalityId, barrioId).update(
          'residentCount',
          FieldValue.increment(delta),
        );
      } catch (err) {
        if (isNotFound(err)) continue; // barrio deleted before this ran → skip
        throw err;
      }
      logger.info('barrio resident count updated', {
        handler,
        personId,
        municipalityId: link.municipalityId,
        barrioId,
        delta,
      });
    }
  },
);

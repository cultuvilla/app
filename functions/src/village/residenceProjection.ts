import type { Firestore, Transaction, DocumentReference } from 'firebase-admin/firestore';
import { personsCollection } from '@cultuvilla/shared/firebase/refs/admin';
import { buildResidenceLinks } from '@cultuvilla/shared/models';
import type { MunicipalityLink, PersonData } from '@cultuvilla/shared';

export interface ResidenceTarget {
  ref: DocumentReference<PersonData>;
  links: MunicipalityLink[];
}

/**
 * Read phase: locate an account-holder's person doc and its current residence
 * links. MUST be called before any transaction write (Firestore requires all
 * reads before writes). Returns null when the user has no linked person — then
 * there is nothing to project onto.
 *
 * Server-side membership creations (startVillage, organizer approval) can't rely on a Firestore trigger to project residence anymore: the
 * syncMemberBarrioToResidence trigger is delete-only. Each such path pairs this
 * read with `upsertResidenceLink` below so a seeded member still shows up in
 * `getPersonsByBarrio`.
 */
export async function readResidenceTarget(
  tx: Transaction,
  db: Firestore,
  userId: string,
): Promise<ResidenceTarget | null> {
  const snap = await tx.get(personsCollection(db).where('userId', '==', userId).limit(1));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { ref: d.ref, links: d.data().municipalityLinks };
}

/**
 * Write phase: upsert the residence link for `municipalityId` into the target
 * person (`barrioId` null = whole village). `buildResidenceLinks` is the single
 * constructor of the exact `{ municipalityId, barrioId }` shape the
 * `getPersonsByBarrio` array-contains query matches on. tx.update takes field
 * paths, so it bypasses the person converter (a partial write is fine).
 */
export function upsertResidenceLink(
  tx: Transaction,
  target: ResidenceTarget,
  municipalityId: string,
  barrioId: string | null,
): void {
  const others = target.links.filter((l) => l.municipalityId !== municipalityId);
  tx.update(target.ref, {
    municipalityLinks: [...others, ...buildResidenceLinks(municipalityId, barrioId)],
  });
}

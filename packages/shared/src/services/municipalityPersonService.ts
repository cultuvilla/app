import { getDocs, orderBy, query, where } from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import { municipalityPeopleCollection } from '../firebase/refs/client';
import type { MunicipalityPersonData } from '../models/municipality/MunicipalityPersonDataModel';

export async function getMunicipalityPeople(
  municipalityId: string,
): Promise<(MunicipalityPersonData & { id: string })[]> {
  const q = query(
    municipalityPeopleCollection(getDb()),
    where('municipalityId', '==', municipalityId),
    orderBy('sortName', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * The same directory, narrowed to one barrio. The barrio roster reads this
 * rather than querying `persons` by `municipalityLinks`: the persons read rule
 * is evaluated per matched document, so any query that could match a private
 * persona is rejected outright — filtering them out would drop those people
 * from the barrio entirely instead of merely leaving their row unlinked.
 *
 * Deceased people are absent by construction: the sync trigger drops their
 * municipality links, since they belong to the cemetery view.
 */
export async function getMunicipalityPeopleByBarrio(
  municipalityId: string,
  barrioId: string,
): Promise<(MunicipalityPersonData & { id: string })[]> {
  const q = query(
    municipalityPeopleCollection(getDb()),
    where('municipalityId', '==', municipalityId),
    where('barrioId', '==', barrioId),
    orderBy('sortName', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

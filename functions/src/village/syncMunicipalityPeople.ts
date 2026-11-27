import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { municipalityPersonDoc, personDoc } from '@cultuvilla/shared/firebase/refs/admin';
import { buildDisplayName, buildNameWithNickname, isDeceased } from '@cultuvilla/shared/models';
import type { BurialPlace, PartialDate } from '@cultuvilla/shared/models';
import { defineDocumentTrigger } from '../shared/define/defineDocumentTrigger';
import { deleteRow, projectRowsFromCurrentSource, setRow } from '../shared/convergeOnSource';

const db = getFirestore();

interface DirectoryPerson {
  displayName: string;
  sortName: string;
  photoURL: string | null;
  userId: string | null;
  isPublic: boolean;
  /** municipalityId → barrioId (null when linked to the village at large). */
  barrioByMunicipality: Map<string, string | null>;
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const asNullableString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

function asDirectoryPerson(data: Record<string, unknown>): DirectoryPerson {
  const rawMiddleNames: unknown = data['middleNames'];
  const middleNames = Array.isArray(rawMiddleNames)
    ? rawMiddleNames.filter((name): name is string => typeof name === 'string')
    : [];
  const person = {
    givenName: asString(data['givenName']),
    middleNames,
    firstSurname: asNullableString(data['firstSurname']),
    secondSurname: asNullableString(data['secondSurname']),
    nickname: asNullableString(data['nickname']),
  };
  // Deceased personas belong only in the cemetery, not the living-people
  // directory. Zeroing their membership here removes them from the Pueblo
  // people count and roster (and deletes any stale rows when they die).
  const deceased = isDeceased({
    deathDate: (data['deathDate'] ?? null) as PartialDate | null,
    burialPlace: (data['burialPlace'] ?? null) as BurialPlace | null,
  });
  const links = deceased || !Array.isArray(data['municipalityLinks']) ? [] : data['municipalityLinks'];
  const barrioByMunicipality = new Map<string, string | null>();
  for (const link of links) {
    if (!link || typeof link !== 'object') continue;
    const record = link as Record<string, unknown>;
    const municipalityId = record['municipalityId'];
    if (typeof municipalityId !== 'string' || municipalityId.length === 0) continue;
    const barrioId = typeof record['barrioId'] === 'string' ? record['barrioId'] : null;
    // A person may hold several links to one municipality; the first that names
    // a barrio wins, so a village-wide link can't erase a barrio assignment.
    if (barrioByMunicipality.get(municipalityId) == null) {
      barrioByMunicipality.set(municipalityId, barrioId);
    }
  }
  return {
    // Directory shows the apodo in parentheses after the full name; the sort key
    // stays on the plain full name so the list stays alphabetical by real name.
    displayName: buildNameWithNickname(person),
    sortName: buildDisplayName(person)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-ES'),
    photoURL: typeof data['photoURL'] === 'string' ? data['photoURL'] : null,
    userId: typeof data['userId'] === 'string' ? data['userId'] : null,
    // Defensive default: a person doc written before the privacy field existed
    // projects as public, matching buildPersonData's default.
    isPublic: data['isPublic'] !== false,
    barrioByMunicipality,
  };
}

/**
 * Keeps the municipality-scoped people directory in sync with the canonical
 * person record. The directory is an alphabetical list projection; clients
 * cannot write it directly.
 *
 * The event names the municipalities to look at; the rows are written from
 * the person as it stands now, read in the same transaction, so a late update
 * delivered after the delete cannot bring a deleted person back.
 */
export const syncMunicipalityPeople = defineDocumentTrigger(
  'syncMunicipalityPeople',
  { kind: 'written', document: 'persons/{personId}' },
  async (event) => {
    const handler = 'syncMunicipalityPeople';
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const eventMunicipalities = new Set([
      ...(before ? asDirectoryPerson(before).barrioByMunicipality.keys() : []),
      ...(after ? asDirectoryPerson(after).barrioByMunicipality.keys() : []),
    ]);
    if (eventMunicipalities.size === 0) return;

    const { personId } = event.params;
    const outcome = await projectRowsFromCurrentSource({
      db,
      sourceRef: personDoc(db, personId),
      project: (current) => {
        const person = current ? asDirectoryPerson(current) : null;
        const municipalities = person?.barrioByMunicipality ?? new Map<string, string | null>();
        const affected = new Set([...eventMunicipalities, ...municipalities.keys()]);
        return [...affected].map((municipalityId) => {
          const ref = municipalityPersonDoc(db, municipalityId, personId);
          if (!person || !municipalities.has(municipalityId)) return deleteRow(ref);
          return setRow(ref, {
            municipalityId,
            personId,
            displayName: person.displayName,
            sortName: person.sortName,
            photoURL: person.photoURL,
            userId: person.userId,
            isPublic: person.isPublic,
            barrioId: municipalities.get(municipalityId) ?? null,
          });
        });
      },
    });
    logger.info('Municipality people directory synchronized', {
      handler,
      personId,
      rowsSet: outcome.set,
      rowsDeleted: outcome.deleted,
    });
  },
);

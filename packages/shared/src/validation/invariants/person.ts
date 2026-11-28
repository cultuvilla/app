import { municipalityPersonDirectoryId } from '../../models/municipality/MunicipalityPersonDataModel';
import { referenceInvariant, type Ref } from '../factories';
import { docPath, docsOf, idValue, type Invariant, type SnapshotDoc, type Violation } from '../types';

export interface PersonLink {
  readonly municipalityId: string;
  readonly barrioId: string | null;
}

/** The person's `municipalityLinks`, skipping malformed entries (a converter concern, not a reference). */
export function personLinks(doc: SnapshotDoc): PersonLink[] {
  const raw = doc.data['municipalityLinks'];
  if (!Array.isArray(raw)) return [];
  const out: PersonLink[] = [];
  for (const link of raw as unknown[]) {
    if (link === null || typeof link !== 'object') continue;
    const record = link as Record<string, unknown>;
    const municipalityId = idValue(record['municipalityId']);
    if (municipalityId === null) continue;
    out.push({ municipalityId, barrioId: idValue(record['barrioId']) });
  }
  return out;
}

/** Mirrors `isDeceased`: a death date or a burial place moves a persona to the cemetery. */
export function isDeceasedDoc(doc: SnapshotDoc): boolean {
  return (doc.data['deathDate'] ?? null) !== null || (doc.data['burialPlace'] ?? null) !== null;
}

function burialPlace(doc: SnapshotDoc): { municipalityId: unknown; placeId: unknown } | null {
  const raw = doc.data['burialPlace'];
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  return { municipalityId: record['municipalityId'], placeId: record['placeId'] };
}

export const personMunicipalityExists = referenceInvariant({
  id: 'persons.municipalityLinks.municipalityId.exists',
  description: 'Every municipality a person is linked to exists',
  collection: 'persons',
  targets: ['municipalities'],
  refs: (doc) => personLinks(doc).map((link): Ref => ({ field: 'municipalityLinks.municipalityId', value: link.municipalityId, target: 'municipalities' })),
});

export const personBarrioExists = referenceInvariant({
  id: 'persons.municipalityLinks.barrioId.exists',
  description: 'Every barrio a person lives in exists in that municipality',
  collection: 'persons',
  targets: ['municipalityBarrios'],
  refs: (doc) =>
    personLinks(doc).map((link): Ref => ({
      field: 'municipalityLinks.barrioId',
      value: link.barrioId,
      target: 'municipalityBarrios',
      parents: [link.municipalityId],
      optional: true,
    })),
});

export const personUserExists = referenceInvariant({
  id: 'persons.userId.exists',
  description: 'A person linked to an account names an existing account',
  collection: 'persons',
  targets: ['users'],
  refs: (doc) => [{ field: 'userId', value: doc.data['userId'], target: 'users', optional: true }],
});

export const personBurialPlaceExists = referenceInvariant({
  id: 'persons.burialPlace.placeId.exists',
  description: 'A burial place names an existing place in that municipality',
  collection: 'persons',
  targets: ['municipalityPlaces'],
  refs: (doc) => {
    const place = burialPlace(doc);
    const municipalityId = idValue(place?.municipalityId);
    if (!place || municipalityId === null) return [];
    return [{ field: 'burialPlace.placeId', value: place.placeId, target: 'municipalityPlaces', parents: [municipalityId] }];
  },
});

/**
 * `municipalityPeople` is a projection of `persons` (syncMunicipalityPeople):
 * exactly one row per living person per municipality they are linked to, at
 * `{municipalityId}_{personId}`, carrying the first barrio-naming link's
 * barrio. A missing row hides someone from the village roster and its count; a
 * stale row shows someone who left, died or was deleted.
 */
export const municipalityPeopleMatchesPersons: Invariant = {
  id: 'municipalityPeople.matchesPersons',
  description: 'The village roster projection has exactly the living linked persons, with their barrio',
  reads: ['persons', 'municipalityPeople'],
  check: (snap) => {
    const id = 'municipalityPeople.matchesPersons';
    const expected = new Map<string, string | null>();
    for (const person of docsOf(snap, 'persons').values()) {
      if (isDeceasedDoc(person)) continue;
      for (const link of personLinks(person)) {
        const rowPath = docPath('municipalityPeople', [], municipalityPersonDirectoryId(link.municipalityId, person.id));
        if (expected.get(rowPath) == null) expected.set(rowPath, link.barrioId);
      }
    }
    const out: Violation[] = [];
    const rows = docsOf(snap, 'municipalityPeople');
    for (const [rowPath, barrioId] of expected) {
      const row = rows.get(rowPath);
      if (!row) {
        out.push({ invariant: id, path: rowPath, message: `${rowPath} is missing for a linked living person` });
      } else if ((row.data['barrioId'] ?? null) !== barrioId) {
        out.push({ invariant: id, path: rowPath, field: 'barrioId', value: String(row.data['barrioId']), expected: String(barrioId), message: `${rowPath}.barrioId = ${String(row.data['barrioId'])}, person says ${String(barrioId)}` });
      }
    }
    for (const row of rows.values()) {
      if (!expected.has(row.path)) {
        out.push({ invariant: id, path: row.path, message: `${row.path} has no living person linked to that municipality` });
      }
    }
    return out;
  },
};

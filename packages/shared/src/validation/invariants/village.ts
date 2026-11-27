import { orphanInvariant, referenceInvariant } from '../factories';
import { docPath, docsOf, idValue, type Invariant, type SnapshotDoc, type Violation } from '../types';

function community(doc: SnapshotDoc): Record<string, unknown> | null {
  const value = doc.data['community'];
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export const villageMemberParentExists = orphanInvariant('municipalityMembers');
export const barrioParentExists = orphanInvariant('municipalityBarrios');
export const placeParentExists = orphanInvariant('municipalityPlaces');

export const villageMemberUserExists = referenceInvariant({
  id: 'municipalityMembers.userId.exists',
  description: 'Every village member is an existing account (deleteAccount removes its memberships)',
  collection: 'municipalityMembers',
  targets: ['users'],
  refs: (doc) => [{ field: 'userId', value: doc.data['userId'], target: 'users' }],
});

/**
 * The Embajador pointer must name an admin of that village:
 * `transferVillageAmbassador` and organizer approval both promote the holder,
 * and the title shown on the village is read from this pointer.
 */
export const villageAmbassadorIsAdmin: Invariant = {
  id: 'municipalities.community.organizerId.isAdmin',
  description: 'A village Embajador is an admin member of that village',
  reads: ['municipalities', 'municipalityMembers'],
  check: (snap) => {
    const id = 'municipalities.community.organizerId.isAdmin';
    const members = docsOf(snap, 'municipalityMembers');
    const out: Violation[] = [];
    for (const doc of docsOf(snap, 'municipalities').values()) {
      const organizerId = idValue(community(doc)?.['organizerId']);
      if (organizerId === null) continue;
      const member = members.get(docPath('municipalityMembers', [doc.id], organizerId));
      if (!member) {
        out.push({ invariant: id, path: doc.path, field: 'community.organizerId', value: organizerId, message: `${doc.path} Embajador ${organizerId} is not a member` });
      } else if (member.data['role'] !== 'admin') {
        out.push({ invariant: id, path: doc.path, field: 'community.organizerId', value: organizerId, expected: 'admin', message: `${doc.path} Embajador ${organizerId} has role ${String(member.data['role'])}` });
      }
    }
    return out;
  },
};

/** A barrio or place carries its municipality's id as a field too; it must agree with its path. */
function municipalityIdMatchesParent(key: 'municipalityBarrios' | 'municipalityPlaces'): Invariant {
  const id = `${key}.municipalityId.matchesParent`;
  return {
    id,
    description: `Every ${key} doc's municipalityId names the municipality it sits under`,
    reads: [key],
    check: (snap) =>
      [...docsOf(snap, key).values()]
        .filter((doc) => doc.data['municipalityId'] !== doc.parents[0])
        .map((doc) => ({
          invariant: id,
          path: doc.path,
          field: 'municipalityId',
          value: String(doc.data['municipalityId']),
          expected: doc.parents[0],
          message: `${doc.path}.municipalityId = ${String(doc.data['municipalityId'])}`,
        })),
  };
}

export const barrioMunicipalityIdMatches = municipalityIdMatchesParent('municipalityBarrios');
export const placeMunicipalityIdMatches = municipalityIdMatchesParent('municipalityPlaces');

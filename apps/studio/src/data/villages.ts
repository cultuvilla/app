import { getMunicipality } from '@cultuvilla/shared/services/municipalityService';
import { getMunicipalityPeople } from '@cultuvilla/shared/services/municipalityPersonService';
import { getOrganizationsByMunicipality } from '@cultuvilla/shared/services/organizationService';
import { getPublicProfile } from '@cultuvilla/shared/services/userService';
import { getUserMemberships, getVillageMembers } from '@cultuvilla/shared/services/villageMemberService';

export interface Village {
  id: string;
  name: string;
}

const names = new Map<string, Promise<string>>();

export function villageName(municipalityId: string): Promise<string> {
  let name = names.get(municipalityId);
  if (!name) {
    name = getMunicipality(municipalityId).then((m) => m?.name ?? municipalityId);
    names.set(municipalityId, name);
  }
  return name;
}

/** The pueblos the user belongs to — the ones they may write articles for. */
export async function myVillages(uid: string): Promise<Village[]> {
  const memberships = await getUserMemberships(uid);
  const villages = await Promise.all(
    memberships.map(async (m) => ({ id: m.municipalityId, name: await villageName(m.municipalityId) })),
  );
  return villages.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export interface Writer {
  userId: string;
  name: string;
}

export interface Group {
  id: string;
  name: string;
}

export interface VillageDirectory {
  writers: Writer[];
  groups: Group[];
}

/**
 * Who may be credited on an article in this pueblo: its members (named from
 * the people directory, else their public profile) and its approved groups.
 */
export async function villageDirectory(municipalityId: string): Promise<VillageDirectory> {
  const [members, people, orgs] = await Promise.all([
    getVillageMembers(municipalityId),
    getMunicipalityPeople(municipalityId).catch(() => []),
    getOrganizationsByMunicipality(municipalityId, 'approved').catch(() => []),
  ]);
  const byUserId = new Map(people.flatMap((p) => (p.userId ? [[p.userId, p.displayName] as const] : [])));
  const writers = await Promise.all(
    members.map(async (m): Promise<Writer> => {
      const known = byUserId.get(m.userId);
      if (known) return { userId: m.userId, name: known };
      const profile = await getPublicProfile(m.userId).catch(() => null);
      return { userId: m.userId, name: profile?.displayName ?? m.userId };
    }),
  );
  return {
    writers: writers.sort((a, b) => a.name.localeCompare(b.name, 'es')),
    groups: orgs.map((o) => ({ id: o.id, name: o.name })).sort((a, b) => a.name.localeCompare(b.name, 'es')),
  };
}

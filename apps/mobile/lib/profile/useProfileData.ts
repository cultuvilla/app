import { useMemo } from 'react';
import type { EventData } from '@cultuvilla/shared/models/event';
import type { MunicipalityData } from '@cultuvilla/shared/models/municipality/MunicipalityDataModel';
import type { NewsPostData } from '@cultuvilla/shared/models/news/NewsPostDataModel';
import type { OrganizationData, OrganizationType, OrgMemberRole } from '@cultuvilla/shared/models/organization';
import type { PersonData } from '@cultuvilla/shared/models/person';
import { watchPersonByUserId, watchPersonsByCreator } from '@cultuvilla/shared/services/personService';
import { watchEventsByOrganizer } from '@cultuvilla/shared/services/eventService';
import { watchNewsPostsByOrganizer } from '@cultuvilla/shared/services/newsService';
import { watchOrganizationsByMunicipality } from '@cultuvilla/shared/services/organizationService';
import {
  watchOrgMembershipsByUser,
  type UserOrgMembership,
} from '@cultuvilla/shared/services/orgMemberService';
import {
  watchUserMemberships,
  type UserMembership,
} from '@cultuvilla/shared/services/villageMemberService';
import { watchMunicipalitiesByIds } from '@cultuvilla/shared/services/municipalityService';
import { escudoFullUrl, hasManualEscudo } from '@cultuvilla/shared/models/municipality';
import { useWatch } from '../hooks/useWatch';
import type { ManagedEvent } from '../../components/feature/profile/ManagedEventsScroll';
import type { CreatedNews } from '../../components/feature/profile/CreatedNewsScroll';
import type { VillageRow } from '../../components/feature/profile/VillagesScroll';

type PersonDoc = PersonData & { id: string };
type MunicipalityDoc = MunicipalityData & { id: string };
type OrgDoc = OrganizationData & { id: string };

/** An organization the user belongs to, shaped for the profile card scrolls. */
type MemberOrg = {
  id: string;
  name: string;
  villageSlug: string;
  type: OrganizationType;
  imageURL: string | null;
  role: OrgMemberRole;
  commentCount: number;
};

type ProfileData = {
  selfPerson: PersonDoc | null;
  allPersonas: PersonDoc[];
  eventsCreated: number | null;
  managedEvents: ManagedEvent[];
  newsCount: number | null;
  createdNews: CreatedNews[];
  newsError: boolean;
  orgs: MemberOrg[];
  villages: VillageRow[];
  loading: boolean;
};

const NO_PERSONAS: PersonDoc[] = [];
const NO_EVENTS: (EventData & { id: string })[] = [];
const NO_NEWS: (NewsPostData & { id: string })[] = [];

/**
 * Everything the profile card shows, as live listeners: on the native SDK each
 * answers from the device cache first and stays current, so an edit made on
 * another screen (a new persona, a photo, an event) shows here without the
 * profile reloading on focus.
 *
 * Every section is its own listener and fails on its own: a denial in one
 * degrades that section instead of blanking the card. A single coupled load
 * once left another user's profile with no photo, no name and a dash for every
 * stat because one query the rules deny for a stranger failed.
 */
export function useProfileData(
  uid: string | null,
  activeMunicipalityId: string | null,
  variant: 'self' | 'other',
): ProfileData {
  const isSelf = variant === 'self';
  const key = uid ? `${uid}|${variant}` : null;

  // Only the profile's own owner may read it unfiltered (a private persona is
  // still theirs to see).
  const self = useWatch<PersonDoc | null>(
    'profile:watchPersonByUserId',
    key,
    uid ? (next, error) => watchPersonByUserId(uid, isSelf ? uid : null, next, error) : null,
  );
  // "Mi gente" is a self-only section, and only its owner may read the list at
  // all (see getPersonsByCreator) — so don't ask when visiting.
  const personas = useWatch<PersonDoc[]>(
    'profile:watchPersonsByCreator',
    uid && isSelf ? uid : null,
    uid && isSelf ? (next, error) => watchPersonsByCreator(uid, uid, next, error) : null,
  );
  const events = useWatch<(EventData & { id: string })[]>(
    'profile:watchEventsByOrganizer',
    uid,
    uid ? (next, error) => watchEventsByOrganizer(uid, next, error) : null,
  );
  // The organizer news query is denied by rules when the user is an organizer
  // but not the post's creator; the active-only form is what a visitor may read.
  const news = useWatch<(NewsPostData & { id: string })[]>(
    'profile:watchNewsPostsByOrganizer',
    key,
    uid ? (next, error) => watchNewsPostsByOrganizer(uid, { activeOnly: !isSelf }, next, error) : null,
  );

  const villages = useVillageRows(uid);
  const orgs = useMemberOrgs(uid, activeMunicipalityId);

  const managedEvents = events.data ?? NO_EVENTS;
  return {
    selfPerson: self.data ?? null,
    allPersonas: personas.data ?? NO_PERSONAS,
    eventsCreated: events.status === 'ready' ? managedEvents.length : null,
    managedEvents,
    newsCount: news.data ? news.data.length : null,
    createdNews: news.data ?? NO_NEWS,
    newsError: news.status === 'error',
    orgs,
    villages,
    loading: self.status === 'loading' || personas.status === 'loading',
  };
}

function useVillageRows(uid: string | null): VillageRow[] {
  const memberships = useWatch<UserMembership[]>(
    'profile:watchUserMemberships',
    uid,
    uid ? (next, error) => watchUserMemberships(uid, next, error) : null,
  );
  const ids = useMemo(() => (memberships.data ?? []).map((m) => m.municipalityId), [memberships.data]);
  const municipalities = useWatch<MunicipalityDoc[]>(
    'profile:watchMunicipalitiesByIds',
    memberships.data ? `ids:${ids.join(',')}` : null,
    memberships.data ? (next, error) => watchMunicipalitiesByIds(ids, next, error) : null,
  );

  return useMemo(() => {
    if (!memberships.data || municipalities.status === 'loading') return [];
    const byId = new Map((municipalities.data ?? []).map((m) => [m.id, m]));
    return memberships.data.map((m) => {
      const muni = byId.get(m.municipalityId);
      return {
        municipalityId: m.municipalityId,
        name: muni?.name ?? m.municipalityId,
        comunidadAutonoma: muni?.comunidadAutonoma ?? '',
        escudoUrl: muni ? escudoFullUrl(muni) : null,
        manualEscudo: muni ? hasManualEscudo(muni) : false,
        role: m.role,
      } satisfies VillageRow;
    });
  }, [memberships.data, municipalities.status, municipalities.data]);
}

function useMemberOrgs(uid: string | null, municipalityId: string | null): MemberOrg[] {
  const villageOrgs = useWatch<OrgDoc[]>(
    'profile:watchOrganizationsByMunicipality',
    uid && municipalityId ? municipalityId : null,
    uid && municipalityId
      ? (next, error) => watchOrganizationsByMunicipality(municipalityId, 'approved', next, error)
      : null,
  );
  const orgIds = useMemo(() => (villageOrgs.data ?? []).map((o) => o.id), [villageOrgs.data]);
  const memberships = useWatch<UserOrgMembership[]>(
    'profile:watchOrgMembershipsByUser',
    uid && villageOrgs.data ? `${uid}|${orgIds.join(',')}` : null,
    uid && villageOrgs.data ? (next, error) => watchOrgMembershipsByUser(uid, orgIds, next, error) : null,
  );

  return useMemo(() => {
    if (!villageOrgs.data || !memberships.data) return [];
    const roleByOrgId = new Map(memberships.data.map((m) => [m.orgId, m.role]));
    return villageOrgs.data
      .filter((o) => roleByOrgId.has(o.id))
      .map((o) => ({
        id: o.id,
        name: o.name,
        villageSlug: o.villageSlug,
        type: o.type,
        imageURL: o.images[0] ?? null,
        role: roleByOrgId.get(o.id) ?? 'member',
        commentCount: o.commentCount,
      }));
  }, [villageOrgs.data, memberships.data]);
}

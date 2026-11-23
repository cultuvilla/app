import { useMemo } from 'react';
import type { MunicipalityData } from '@cultuvilla/shared/models';
import { watchMunicipalitiesByIds } from '@cultuvilla/shared/services/municipalityService';
import { watchUserMemberships, type UserMembership } from '@cultuvilla/shared/services/villageMemberService';
import { useIsAppAdmin } from '../auth/useIsAppAdmin';
import { useWatch, type WatchStatus } from '../hooks/useWatch';
import { useMyGroups, type MyGroup } from '../orgs/useMyGroups';

export interface NotificationVillage {
  municipalityId: string;
  name: string;
}

export interface NotificationAudience {
  status: WatchStatus;
  groups: MyGroup[];
  villages: NotificationVillage[];
  /** Admin of a pueblo, a group, or the app: someone requests can reach. */
  handlesRequests: boolean;
}

/**
 * What the notification settings need to know about the person to show only
 * the switches that can ever fire for them: their groups, their pueblos, and
 * whether anyone's requests land on them.
 */
export function useNotificationAudience(uid: string | null): NotificationAudience {
  const { groups, status: groupsStatus } = useMyGroups(uid);
  const { isAppAdmin } = useIsAppAdmin();
  const memberships = useWatch<UserMembership[]>(
    'notifications:watchUserMemberships',
    uid,
    uid ? (next, error) => watchUserMemberships(uid, next, error) : null,
  );
  const ids = useMemo(() => (memberships.data ?? []).map((m) => m.municipalityId), [memberships.data]);
  const municipalities = useWatch<(MunicipalityData & { id: string })[]>(
    'notifications:watchMunicipalitiesByIds',
    memberships.data ? `ids:${ids.join(',')}` : null,
    memberships.data ? (next, error) => watchMunicipalitiesByIds(ids, next, error) : null,
  );

  const villages = useMemo(() => {
    const names = new Map((municipalities.data ?? []).map((m) => [m.id, m.name]));
    return ids
      .map((municipalityId) => ({ municipalityId, name: names.get(municipalityId) ?? municipalityId }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ids, municipalities.data]);

  const handlesRequests =
    isAppAdmin ||
    groups.some((g) => g.role === 'admin') ||
    (memberships.data ?? []).some((m) => m.role === 'admin');

  const status: WatchStatus =
    groupsStatus === 'loading' || memberships.status === 'loading' || municipalities.status === 'loading'
      ? 'loading'
      : 'ready';
  return { status, groups, villages, handlesRequests };
}

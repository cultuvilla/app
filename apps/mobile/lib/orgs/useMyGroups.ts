import { useMemo } from 'react';
import type { OrganizationData, OrgMemberRole } from '@cultuvilla/shared/models/organization';
import { watchUserOrgMemberships, type UserOrgMembership } from '@cultuvilla/shared/services/orgMemberService';
import { watchOrganizationsByIds } from '@cultuvilla/shared/services/organizationService';
import { useWatch, type WatchStatus } from '../hooks/useWatch';

export type MyGroup = { org: OrganizationData & { id: string }; role: OrgMemberRole };

export interface MyGroups {
  groups: MyGroup[];
  status: WatchStatus;
}

const NO_GROUPS: MyGroup[] = [];

/**
 * The organizations the signed-in user belongs to, in every village, by name —
 * live, so joining or leaving a group shows or hides the Grupos tab at once.
 */
export function useMyGroups(uid: string | null): MyGroups {
  const memberships = useWatch<UserOrgMembership[]>(
    'groups:watchUserOrgMemberships',
    uid,
    uid ? (next, error) => watchUserOrgMemberships(uid, next, error) : null,
  );
  const ids = useMemo(() => (memberships.data ?? []).map((m) => m.orgId).sort(), [memberships.data]);
  const orgs = useWatch<(OrganizationData & { id: string })[]>(
    'groups:watchOrganizationsByIds',
    memberships.data ? `ids:${ids.join(',')}` : null,
    memberships.data ? (next, error) => watchOrganizationsByIds(ids, next, error) : null,
  );

  const groups = useMemo(() => {
    if (!memberships.data || !orgs.data) return NO_GROUPS;
    const roleByOrg = new Map(memberships.data.map((m) => [m.orgId, m.role]));
    return orgs.data
      .map((org) => ({ org, role: roleByOrg.get(org.id) ?? 'member' }))
      .sort((a, b) => a.org.name.localeCompare(b.org.name));
  }, [memberships.data, orgs.data]);

  const status: WatchStatus =
    !uid ? 'ready'
      : memberships.status === 'error' || orgs.status === 'error' ? 'error'
        : memberships.status === 'loading' || orgs.status === 'loading' ? 'loading'
          : 'ready';
  return { groups, status };
}

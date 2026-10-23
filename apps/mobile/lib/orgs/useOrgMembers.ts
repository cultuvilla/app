import { useEffect, useMemo, useState } from 'react';
import type { OrgMemberData, OrgMemberRole } from '@cultuvilla/shared/models/organization';
import { buildNameWithNickname } from '@cultuvilla/shared/models/person';
import { watchOrgMembers } from '@cultuvilla/shared/services/orgMemberService';
import { getPersonByUserId } from '@cultuvilla/shared/services/personService';
import { getPublicProfile } from '@cultuvilla/shared/services/userService';
import { useWatch } from '../hooks/useWatch';

export interface GroupMember {
  uid: string;
  name: string;
  role: OrgMemberRole;
}

async function memberName(uid: string): Promise<string> {
  // The person carries the full name and apodo, as in the member list.
  const person = await getPersonByUserId(uid).catch(() => null);
  const fromPerson = person ? buildNameWithNickname(person).trim() : '';
  if (fromPerson) return fromPerson;
  const user = await getPublicProfile(uid).catch(() => null);
  return user?.displayName || uid;
}

/**
 * The group's members with a display name each, by name — who a task can be
 * assigned to, and whose name a task or a shift shows. Live membership; names
 * are resolved once per member.
 */
export function useOrgMembers(orgId: string): { members: GroupMember[]; nameOf: (uid: string) => string } {
  const watched = useWatch<(OrgMemberData & { id: string })[]>('groups:watchOrgMembers', orgId, (next, error) =>
    watchOrgMembers(orgId, next, error),
  );
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const missing = (watched.data ?? []).map((m) => m.userId).filter((uid) => !(uid in names));
    if (missing.length === 0) return;
    let live = true;
    void Promise.all(missing.map(async (uid) => [uid, await memberName(uid)] as const)).then((pairs) => {
      if (live) setNames((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => {
      live = false;
    };
  }, [watched.data, names]);

  return useMemo(() => {
    const members = (watched.data ?? [])
      .map((m) => ({ uid: m.userId, name: names[m.userId] ?? '…', role: m.role }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return { members, nameOf: (uid: string) => names[uid] ?? '…' };
  }, [watched.data, names]);
}

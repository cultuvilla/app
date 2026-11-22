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
  photoURL: string | null;
  role: OrgMemberRole;
}

export interface MemberFace {
  name: string;
  photoURL: string | null;
}

async function memberFace(uid: string): Promise<MemberFace> {
  // The person carries the full name, apodo and photo, as in the member list.
  const person = await getPersonByUserId(uid).catch(() => null);
  const fromPerson = person ? buildNameWithNickname(person).trim() : '';
  if (fromPerson) return { name: fromPerson, photoURL: person?.photoURL ?? null };
  const user = await getPublicProfile(uid).catch(() => null);
  return { name: user?.displayName || uid, photoURL: null };
}

/**
 * Name and photo of just these members — the faces on a task card. Resolved
 * once per uid, so a home showing a few tasks reads a few people, not the
 * whole membership.
 */
export function useMemberFaces(uids: readonly string[]): Record<string, MemberFace> {
  const [faces, setFaces] = useState<Record<string, MemberFace>>({});
  const key = [...new Set(uids)].sort().join(',');

  useEffect(() => {
    const missing = key.split(',').filter((uid) => uid !== '' && !(uid in faces));
    if (missing.length === 0) return;
    let live = true;
    void Promise.all(missing.map(async (uid) => [uid, await memberFace(uid)] as const)).then((pairs) => {
      if (live) setFaces((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => {
      live = false;
    };
  }, [key, faces]);

  return faces;
}

/**
 * The group's members with a display name and photo each, by name — who a
 * task can be assigned to, and whose name a task or a shift shows. Live
 * membership; faces are resolved once per member.
 */
export function useOrgMembers(orgId: string): { members: GroupMember[]; nameOf: (uid: string) => string } {
  const watched = useWatch<(OrgMemberData & { id: string })[]>('groups:watchOrgMembers', orgId, (next, error) =>
    watchOrgMembers(orgId, next, error),
  );
  const [faces, setFaces] = useState<Record<string, MemberFace>>({});

  useEffect(() => {
    const missing = (watched.data ?? []).map((m) => m.userId).filter((uid) => !(uid in faces));
    if (missing.length === 0) return;
    let live = true;
    void Promise.all(missing.map(async (uid) => [uid, await memberFace(uid)] as const)).then((pairs) => {
      if (live) setFaces((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => {
      live = false;
    };
  }, [watched.data, faces]);

  return useMemo(() => {
    const members = (watched.data ?? [])
      .map((m) => ({ uid: m.userId, name: faces[m.userId]?.name ?? '…', photoURL: faces[m.userId]?.photoURL ?? null, role: m.role }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return { members, nameOf: (uid: string) => faces[uid]?.name ?? '…' };
  }, [watched.data, faces]);
}

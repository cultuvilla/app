// packages/shared/src/services/orgMemberService.ts
import { collectionGroup, getDoc, getDocs, query, deleteDoc, setDoc, where } from '../firebase/sdk/firestore';
import { httpsCallable } from '../firebase/sdk/functions';
import { getDb, getFirebaseFunctions } from '../firebase';
import {
  organizationMembersCollection,
  organizationMemberDoc,
} from '../firebase/refs/client';
import { orgMemberConverterClient } from '../firebase/converters/orgMemberConverter.client';
import { buildOrgMemberData, type OrgMemberData } from '../models/organization/OrgMemberDataModel';
import type { OrgMemberRole } from '../models/organization/OrgMemberDataModel';
import { watchDoc, watchDocsByIds, watchQuery, watchQueryWith, type Unwatch, type WatchError } from './watch';

export async function getOrgMembers(orgId: string): Promise<(OrgMemberData & { id: string })[]> {
  const snap = await getDocs(organizationMembersCollection(getDb(), orgId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Live twin of `getOrgMembers`. */
export function watchOrgMembers(
  orgId: string,
  onNext: (members: (OrgMemberData & { id: string })[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(organizationMembersCollection(getDb(), orgId), onNext, onError);
}

export async function addOrgMember(orgId: string, userId: string): Promise<void> {
  await setDoc(organizationMemberDoc(getDb(), orgId, userId), buildOrgMemberData({ userId, role: 'member' }));
}

/**
 * Promote/demote an org member — the only way to make (or unmake) an org admin.
 * Thin wrapper over the `changeOrgMemberRole` callable, which checks authority,
 * updates the role, and writes a `membershipEvents` audit record in one
 * transaction. Clients can no longer write `role` directly (function-owned).
 */
export async function setOrgMemberRole(
  orgId: string,
  userId: string,
  role: OrgMemberRole,
): Promise<void> {
  const fn = httpsCallable<{ orgId: string; targetUserId: string; role: OrgMemberRole }, { ok: true }>(
    getFirebaseFunctions(),
    'changeOrgMemberRole',
  );
  await fn({ orgId, targetUserId: userId, role });
}

export async function getOrgAdminIds(orgId: string): Promise<string[]> {
  const members = await getOrgMembers(orgId);
  return members.filter((m) => m.role === 'admin').map((m) => m.id);
}

export async function removeOrgMember(orgId: string, userId: string): Promise<void> {
  await deleteDoc(organizationMemberDoc(getDb(), orgId, userId));
}

export async function isOrgMember(orgId: string, userId: string): Promise<boolean> {
  const snap = await getDoc(organizationMemberDoc(getDb(), orgId, userId));
  return snap.exists();
}

/**
 * True iff `userId` is an admin of the org. Authority is the role flag, never
 * the founder pointer (AGENTS.md §Membership roles) — the founder is seeded as
 * admin on approval, so this covers "a group I created" without special-casing.
 */
export async function isOrgAdmin(orgId: string, userId: string): Promise<boolean> {
  const snap = await getDoc(organizationMemberDoc(getDb(), orgId, userId));
  return snap.exists() && snap.data().role === 'admin';
}

export interface UserOrgMembership {
  orgId: string;
  role: OrgMemberRole;
}

/**
 * Reverse lookup: which organizations does `userId` belong to within a given
 * municipality. Fetches all orgs in the municipality and checks membership in
 * parallel — fine for the dev/early-stage scale; revisit when org counts grow.
 */
export async function getOrgMembershipsByUserInMunicipality(
  userId: string,
  municipalityId: string,
  orgIdsCandidate: string[],
): Promise<UserOrgMembership[]> {
  const checks = await Promise.all(
    orgIdsCandidate.map(async (orgId) => {
      const snap = await getDoc(organizationMemberDoc(getDb(), orgId, userId));
      if (!snap.exists()) return null;
      const data = snap.data();
      return { orgId, role: data.role };
    }),
  );
  // The municipality argument is currently passed through for symmetry with
  // future server-side filtering; not used in the body yet.
  void municipalityId;
  return checks.filter((m): m is UserOrgMembership => m !== null);
}

/**
 * Live twin of `getOrgMembershipsByUserInMunicipality`: the same per-org member
 * docs, one listener each, so a join or a role change shows without a reload.
 */
export function watchOrgMembershipsByUser(
  userId: string,
  orgIdsCandidate: string[],
  onNext: (memberships: UserOrgMembership[]) => void,
  onError: WatchError,
): Unwatch {
  return watchDocsByIds<UserOrgMembership>(
    orgIdsCandidate,
    (orgId, next, error) =>
      watchDoc(
        organizationMemberDoc(getDb(), orgId, userId),
        (member) => {
          next(member ? { orgId, role: member.role } : null);
        },
        error,
      ),
    onNext,
    onError,
  );
}

/**
 * Every organization `userId` belongs to, across every village — the reverse of
 * `getOrgMembers`. Uses the same collection-group index as
 * `getUserMemberships`, and the same parent-path filter, because
 * `municipalities/{id}/members` and `organizations/{id}/members` share a
 * collection id and a group query returns both.
 *
 * Feeds need this before they can ask for private events: an org id the viewer
 * does not belong to turns a list query into a permission-denied for the whole
 * page, so the org set has to be known up front rather than discovered from
 * the results.
 */
function userMembersGroupQuery(userId: string) {
  const cg = collectionGroup(getDb(), 'members').withConverter(orgMemberConverterClient);
  return query(cg, where('userId', '==', userId));
}

export async function getUserOrgIds(userId: string): Promise<string[]> {
  const snap = await getDocs(userMembersGroupQuery(userId));
  return snap.docs
    .filter((d) => d.ref.parent.parent?.parent.id === 'organizations')
    .map((d) => d.ref.parent.parent?.id)
    .filter((id): id is string => id !== undefined);
}

/**
 * Live twin of `getUserOrgIds`, with the role: every organization `userId`
 * belongs to, in any village. Drives the Grupos tab. Village member docs are
 * filtered out by parent path before they are parsed, since they share the
 * `members` collection id but not the schema.
 */
export function watchUserOrgMemberships(
  userId: string,
  onNext: (memberships: UserOrgMembership[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQueryWith(
    userMembersGroupQuery(userId),
    (docs) =>
      docs.flatMap((d) => {
        const org = d.ref.parent.parent;
        if (!org || org.parent.id !== 'organizations') return [];
        return [{ orgId: org.id, role: d.data().role }];
      }),
    onNext,
    onError,
  );
}

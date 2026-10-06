// packages/shared/src/services/orgJoinRequestService.ts
import { deleteDoc, getDoc, getDocs, query, setDoc, where } from '../firebase/sdk/firestore';
import { httpsCallable } from '../firebase/sdk/functions';
import { getDb, getFirebaseFunctions } from '../firebase';
import {
  joinRequestsGroup,
  organizationJoinRequestDoc,
  organizationJoinRequestsCollection,
} from '../firebase/refs/client';
import {
  buildOrgJoinRequestData,
  type OrgJoinRequestData,
} from '../models/organization/OrgJoinRequestDataModel';

export type OrgJoinDecision = 'approved' | 'rejected';

/**
 * Ask to join an organization whose joinPolicy is `approval`. The rules refuse
 * it for an open org (join directly with `addOrgMember`) and for a member.
 */
export async function requestToJoinOrganization(
  orgId: string,
  municipalityId: string,
  userId: string,
): Promise<void> {
  await setDoc(
    organizationJoinRequestDoc(getDb(), orgId, userId),
    buildOrgJoinRequestData({ userId, orgId, municipalityId }),
  );
}

/** Withdraw your own pending request. */
export async function cancelOrgJoinRequest(orgId: string, userId: string): Promise<void> {
  await deleteDoc(organizationJoinRequestDoc(getDb(), orgId, userId));
}

/** Whether `userId` has a pending request to join `orgId`. */
export async function hasPendingOrgJoinRequest(orgId: string, userId: string): Promise<boolean> {
  const snap = await getDoc(organizationJoinRequestDoc(getDb(), orgId, userId));
  return snap.exists();
}

/** The org's pending requests, oldest first. Org admins, village admins, app admins. */
export async function getPendingOrgJoinRequests(orgId: string): Promise<OrgJoinRequestData[]> {
  const snap = await getDocs(organizationJoinRequestsCollection(getDb(), orgId));
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/** Every request `userId` has pending, across all orgs. */
export async function getMyPendingOrgJoinRequests(userId: string): Promise<OrgJoinRequestData[]> {
  const snap = await getDocs(query(joinRequestsGroup(getDb()), where('userId', '==', userId)));
  return snap.docs.map((d) => d.data());
}

/**
 * Admit or turn away a requester. Thin wrapper over the `respondToOrgJoinRequest`
 * callable, which checks authority, adds the member and audits it in one
 * transaction, then notifies the requester.
 */
export async function respondToOrgJoinRequest(
  orgId: string,
  userId: string,
  decision: OrgJoinDecision,
): Promise<void> {
  const fn = httpsCallable<
    { orgId: string; userId: string; decision: OrgJoinDecision },
    { ok: true }
  >(getFirebaseFunctions(), 'respondToOrgJoinRequest');
  await fn({ orgId, userId, decision });
}

// packages/shared/src/services/orgFollowerService.ts
import { deleteDoc, getDoc, setDoc } from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import { organizationFollowerDoc } from '../firebase/refs/client';
import { buildOrgFollowerData } from '../models/organization/OrgFollowerDataModel';

/** Follow a group. The rules refuse it for a member, who already has more. */
export async function followOrganization(
  orgId: string,
  municipalityId: string,
  userId: string,
): Promise<void> {
  await setDoc(
    organizationFollowerDoc(getDb(), orgId, userId),
    buildOrgFollowerData({ userId, orgId, municipalityId }),
  );
}

export async function unfollowOrganization(orgId: string, userId: string): Promise<void> {
  await deleteDoc(organizationFollowerDoc(getDb(), orgId, userId));
}

export async function isFollowingOrganization(orgId: string, userId: string): Promise<boolean> {
  const snap = await getDoc(organizationFollowerDoc(getDb(), orgId, userId));
  return snap.exists();
}

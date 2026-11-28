// packages/shared/src/services/orgPresenceService.ts
import { deleteDoc, getDocs, query, setDoc, where, type Query } from '../firebase/sdk/firestore';
import { getCallable } from './callableTransport';
import { getDb } from '../firebase';
import {
  organizationPresenceRequestDoc,
  organizationPresenceRequestsCollection,
  presenceRequestsGroup,
} from '../firebase/refs/client';
import {
  buildOrgPresenceRequestData,
  type OrgPresenceRequestData,
} from '../models/organization/OrgPresenceRequestDataModel';
import { watchQuery, type Unwatch, type WatchError } from './watch';

// A group present in pueblos besides its own (docs/decisions/multi-village-groups.md).
// A group admin asks a pueblo; that pueblo's Equipo accepts or turns it down in
// the Buzón; either side may later take the group out of that pueblo. The
// group's own `municipalityIds` is function-owned — only the callables move it.

export type OrgPresenceDecision = 'approved' | 'rejected';

/** Ask `municipalityId` to list the group. Group admins only (the rules check the rest). */
export async function requestOrgPresence(input: {
  orgId: string;
  orgName: string;
  homeMunicipalityId: string;
  municipalityId: string;
  requestedBy: string;
}): Promise<void> {
  await setDoc(
    organizationPresenceRequestDoc(getDb(), input.orgId, input.municipalityId),
    buildOrgPresenceRequestData(input),
  );
}

/** Withdraw a pending request (the group's admins), or turn it away without a notice. */
export async function cancelOrgPresenceRequest(orgId: string, municipalityId: string): Promise<void> {
  await deleteDoc(organizationPresenceRequestDoc(getDb(), orgId, municipalityId));
}

/** The group's pending requests, live. Its admins. */
export function watchOrgPresenceRequests(
  orgId: string,
  onNext: (requests: OrgPresenceRequestData[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(organizationPresenceRequestsCollection(getDb(), orgId), onNext, onError);
}

/**
 * The requests waiting on these pueblos' Equipos, oldest first: one query per
 * pueblo, since the rules allow a village admin only their own. `'all'` is an
 * app admin's view. A pueblo whose read fails counts as empty, so one denial
 * does not hide the rest.
 */
export async function getPendingOrgPresenceRequests(villages: 'all' | string[]): Promise<OrgPresenceRequestData[]> {
  const group = presenceRequestsGroup(getDb());
  const read = async (q: Query<OrgPresenceRequestData>) => (await getDocs(q)).docs.map((d) => d.data());
  const rows =
    villages === 'all'
      ? await read(group)
      : (
          await Promise.all(
            villages.map((mid) =>
              read(query(group, where('municipalityId', '==', mid))).catch((): OrgPresenceRequestData[] => []),
            ),
          )
        ).flat();
  return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/** Every request `uid` has sent and is still pending. */
export async function getMyPendingOrgPresenceRequests(uid: string): Promise<OrgPresenceRequestData[]> {
  const snap = await getDocs(query(presenceRequestsGroup(getDb()), where('requestedBy', '==', uid)));
  return snap.docs.map((d) => d.data());
}

/**
 * Accept or turn away a group asking to be listed in a pueblo. Thin wrapper over
 * the `respondToOrgPresenceRequest` callable, which checks the caller is that
 * pueblo's Equipo (or an app admin), adds the pueblo to the group and deletes the
 * request in one transaction, then tells the group's admins.
 */
export async function respondToOrgPresenceRequest(
  orgId: string,
  municipalityId: string,
  decision: OrgPresenceDecision,
): Promise<void> {
  const fn = getCallable<
    { orgId: string; municipalityId: string; decision: OrgPresenceDecision },
    { ok: true }
  >('respondToOrgPresenceRequest');
  await fn({ orgId, municipalityId, decision });
}

/**
 * Take a group out of a pueblo other than its home: its admins, that pueblo's
 * Equipo, or an app admin. Thin wrapper over the `removeOrgPresence` callable.
 */
export async function removeOrgPresence(orgId: string, municipalityId: string): Promise<void> {
  const fn = getCallable<{ orgId: string; municipalityId: string }, { ok: true }>('removeOrgPresence');
  await fn({ orgId, municipalityId });
}

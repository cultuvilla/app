import { getDoc, getDocs, query, where, orderBy } from '../firebase/sdk/firestore';
import { httpsCallable } from '../firebase/sdk/functions';
import { getDb, getFirebaseFunctions } from '../firebase';
import {
  organizerRequestsCollection,
  organizerRequestDoc,
} from '../firebase/refs/client';
import type { OrganizerRequestData } from '../models/municipality/OrganizerRequestDataModel';

export async function getOrganizerRequest(
  id: string,
): Promise<(OrganizerRequestData & { id: string }) | null> {
  const snap = await getDoc(organizerRequestDoc(getDb(), id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getPendingOrganizerRequests(): Promise<(OrganizerRequestData & { id: string })[]> {
  const q = query(
    organizerRequestsCollection(getDb()),
    where('status', '==', 'pending'),
    orderBy('requestedAt', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getMyOrganizerRequests(
  userId: string,
): Promise<(OrganizerRequestData & { id: string })[]> {
  const q = query(
    organizerRequestsCollection(getDb()),
    where('userId', '==', userId),
    orderBy('requestedAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

interface RequestOrgPayload {
  municipalityId: string;
  // Activation is decoupled from organizing — the village is already started, so
  // the request only carries why the user wants to organize it.
  motivation?: string | null;
}

export async function requestOrganizeVillage(payload: RequestOrgPayload): Promise<void> {
  const fn = httpsCallable<RequestOrgPayload, { ok: true; requestId: string }>(
    getFirebaseFunctions(),
    'requestOrganizeVillage',
  );
  await fn(payload);
}

interface RespondOrgPayload {
  requestId: string;
  decision: 'approved' | 'rejected';
}

export async function respondToOrganizerRequest(payload: RespondOrgPayload): Promise<void> {
  const fn = httpsCallable<RespondOrgPayload, { ok: true }>(
    getFirebaseFunctions(),
    'respondToOrganizerRequest',
  );
  await fn(payload);
}

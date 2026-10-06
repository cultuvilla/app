// packages/shared/src/services/organizationService.ts
import { getVillageSlug } from './municipalityService';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  type UpdateData,
  type DocumentData,
} from '../firebase/sdk/firestore';
import { httpsCallable } from '../firebase/sdk/functions';
import { getDb, getFirebaseFunctions } from '../firebase';
import {
  organizationsCollection,
  organizationDoc,
} from '../firebase/refs/client';
import type {
  OrganizationData,
  OrganizationDataInput,
  OrganizationStatus,
} from '../models/organization/OrganizationDataModel';
import { watchDoc, watchQuery, type Unwatch, type WatchError } from './watch';

export async function getPendingOrganizations(): Promise<(OrganizationData & { id: string })[]> {
  const q = query(
    organizationsCollection(getDb()),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getMyOrganizations(
  userId: string,
): Promise<(OrganizationData & { id: string })[]> {
  const q = query(
    organizationsCollection(getDb()),
    where('requestedBy', '==', userId),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getOrganization(orgId: string): Promise<(OrganizationData & { id: string }) | null> {
  const snap = await getDoc(organizationDoc(getDb(), orgId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function watchOrganization(
  orgId: string,
  onNext: (org: (OrganizationData & { id: string }) | null) => void,
  onError: WatchError,
): Unwatch {
  return watchDoc(organizationDoc(getDb(), orgId), onNext, onError);
}

function municipalityOrganizationsQuery(municipalityId: string, status?: OrganizationStatus) {
  const ref = organizationsCollection(getDb());
  return status
    ? query(
        ref,
        where('municipalityId', '==', municipalityId),
        where('status', '==', status),
        orderBy('name', 'asc'),
      )
    : query(ref, where('municipalityId', '==', municipalityId), orderBy('name', 'asc'));
}

export async function getOrganizationsByMunicipality(
  municipalityId: string,
  status?: OrganizationStatus,
): Promise<(OrganizationData & { id: string })[]> {
  const snap = await getDocs(municipalityOrganizationsQuery(municipalityId, status));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function watchOrganizationsByMunicipality(
  municipalityId: string,
  onNext: (orgs: (OrganizationData & { id: string })[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(municipalityOrganizationsQuery(municipalityId), onNext, onError);
}

/** Mint an organization doc id up front, so images can be uploaded to its
 * storage path before `requestOrganization` writes the doc (with images). */
export function newOrganizationId(): string {
  return doc(organizationsCollection(getDb())).id;
}

export async function requestOrganization(
  input: Omit<OrganizationDataInput, 'villageSlug'>,
): Promise<string> {
  // ayuntamiento is a singleton per village; the cap can only be enforced
  // server-side (rules can't query for an existing one), so it goes through the
  // requestAyuntamiento callable. peña / asociación are unlimited, written directly.
  if (input.type === 'ayuntamiento') {
    const fn = httpsCallable<
      { name: string; description: string | null; municipalityId: string },
      { ok: true; orgId: string }
    >(getFirebaseFunctions(), 'requestAyuntamiento');
    const res = await fn({
      name: input.name,
      description: input.description ?? null,
      municipalityId: input.municipalityId,
    });
    return res.data.orgId;
  }

  // Use a caller-provided id when present, so images can be uploaded to the
  // org's storage path *before* the doc is created (the create payload carries
  // images — no post-create update, which proposers aren't allowed).
  const newRef = input.id
    ? doc(organizationsCollection(getDb()), input.id)
    : doc(organizationsCollection(getDb()));
  const data: OrganizationData = {
    name: input.name,
    description: input.description ?? null,
    images: input.images ?? [],
    type: input.type,
    status: 'pending',
    municipalityId: input.municipalityId,
    villageSlug: await getVillageSlug(input.municipalityId),
    requestedBy: input.requestedBy,
    reviewedBy: null,
    createdAt: input.createdAt ?? new Date(),
    reviewedAt: null,
    commentCount: 0,
    readCount: 0,
    memberCount: 0,
    membersPublic: input.membersPublic ?? true,
    joinPolicy: input.joinPolicy ?? 'open',
  };
  await setDoc(newRef, data);
  return newRef.id;
}

/**
 * Approve a pending organization. Thin wrapper over the `approveOrganization`
 * callable, which flips the status AND seeds the requester as founding admin in
 * one audited transaction (the reviewer is the authenticated caller; the
 * requester is read from the org's `requestedBy`). Approval is function-owned —
 * firestore.rules forbids a client from setting `status: 'approved'`.
 */
export async function approveOrganization(orgId: string): Promise<void> {
  const fn = httpsCallable<{ orgId: string }, { ok: true }>(
    getFirebaseFunctions(),
    'approveOrganization',
  );
  await fn({ orgId });
}

export async function rejectOrganization(orgId: string): Promise<void> {
  await updateDoc(doc(getDb(), 'organizations', orgId), {
    status: 'rejected',
    reviewedBy: null,
    reviewedAt: serverTimestamp(),
  });
}

export async function updateOrganization(
  orgId: string,
  data: Partial<Omit<OrganizationData, 'createdAt' | 'requestedBy' | 'municipalityId' | 'villageSlug'>>,
): Promise<void> {
  const updates: UpdateData<DocumentData> = { ...data };
  await updateDoc(doc(getDb(), 'organizations', orgId), updates);
}

export async function deleteOrganization(orgId: string): Promise<void> {
  await deleteDoc(organizationDoc(getDb(), orgId));
}

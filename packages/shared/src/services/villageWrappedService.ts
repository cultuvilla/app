import { getDoc, getDocs, orderBy, query, where } from '../firebase/sdk/firestore';
import { httpsCallable } from '../firebase/sdk/functions';
import { getDb, getFirebaseFunctions } from '../firebase';
import { villageWrappedCollection, villageWrappedDoc } from '../firebase/refs/client';
import { wrappedId, type WrappedData, type WrappedStatus } from '../models/wrapped/WrappedDataModel';
import type { WrappedRequest } from '../wrapped/wrappedRequest';

export type VillageWrapped = WrappedData & { id: string };

/**
 * A village's published Wrapped cards, newest first.
 *
 * Only `published` rows: a draft is the admin's to release, and the rules
 * enforce the same thing server-side — this filter keeps a member's query from
 * being rejected wholesale for touching a draft.
 */
export async function getPublishedVillageWrapped(municipalityId: string): Promise<VillageWrapped[]> {
  const snap = await getDocs(
    query(
      villageWrappedCollection(getDb()),
      where('municipalityId', '==', municipalityId),
      where('status', '==', 'published'),
      orderBy('year', 'desc'),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** One Wrapped by its deterministic id. Drafts resolve only for village admins. */
export async function getVillageWrapped(wrappedId: string): Promise<VillageWrapped | null> {
  const snap = await getDoc(villageWrappedDoc(getDb(), wrappedId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** A village's Wrapped for one year, whatever its status — the admin's create/review screen. */
export async function getVillageWrappedForYear(municipalityId: string, year: number): Promise<VillageWrapped | null> {
  return getVillageWrapped(wrappedId(municipalityId, year));
}

/**
 * A year's Wrapped as a reader may see it: published, or null.
 *
 * The rules deny a draft to everyone but the village admins, and to a reader a
 * withheld draft is the same as no Wrapped at all — not an error to show them.
 * An admin's own draft is null here too: the public link must never look
 * published before it is.
 */
export async function getReadableWrapped(municipalityId: string, year: number): Promise<VillageWrapped | null> {
  try {
    const w = await getVillageWrappedForYear(municipalityId, year);
    return w?.status === 'published' ? w : null;
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === 'permission-denied') return null;
    throw error;
  }
}

/**
 * Render (or re-render) a year's Wrapped from the dates the admin picked.
 *
 * Rendering fetches every photo and flyer and takes up to a minute, past the
 * callable client's 70s default — so the timeout matches the function's own.
 */
export async function buildVillageWrapped(request: WrappedRequest): Promise<{ wrappedId: string; status: WrappedStatus }> {
  const fn = httpsCallable<WrappedRequest, { wrappedId: string; status: WrappedStatus }>(
    getFirebaseFunctions(),
    'buildVillageWrapped',
    { timeout: 300_000 },
  );
  return (await fn(request)).data;
}

/** Publish or discard a draft. */
export async function respondToVillageWrapped(id: string, decision: 'publish' | 'discard'): Promise<void> {
  const fn = httpsCallable<{ wrappedId: string; decision: 'publish' | 'discard' }>(
    getFirebaseFunctions(),
    'respondToVillageWrapped',
  );
  await fn({ wrappedId: id, decision });
}

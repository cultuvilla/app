import { getVillageSlug } from './municipalityService';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  where,
  limit as fsLimit,
  startAfter,
  serverTimestamp,
  Timestamp,
} from '../firebase/sdk/firestore';
import { httpsCallable } from '../firebase/sdk/functions';
import { getDb, getFirebaseFunctions } from '../firebase';
import { newsCollection, newsDoc } from '../firebase/refs/client';
import {
  buildNewsPostData,
  type NewsPostData,
  type NewsPostCategory,
  type NewsPostImage,
  type NewsPostStatus,
  type NewsBlock,
} from '../models/news/NewsPostDataModel';
import { watchDoc, watchQuery, type Unwatch, type WatchError } from './watch';

// ────── input types ──────
export interface CreateNewsPostInput {
  municipalityId: string;
  createdBy: string;
  organizerUserIds: string[];
  organizerOrgIds?: string[];
  title: string;
  body: string;
  content?: NewsBlock[];
  category: NewsPostCategory;
  images?: NewsPostImage[];
  coverImage?: NewsPostImage | null;
}

export type UpdateNewsPostInput = Partial<
  Pick<
    NewsPostData,
    | 'title'
    | 'body'
    | 'content'
    | 'category'
    | 'images'
    | 'coverImage'
    | 'organizerUserIds'
    | 'organizerOrgIds'
  >
>;

// Authorship (organizerUserIds/organizerOrgIds) is editable post-creation: any
// current organizer may reattribute the article. It stays out of this set.
// `createdBy` remains immutable (the audit anchor) and the lifecycle fields
// (status/publishedAt) stay function-owned.
const FORBIDDEN_UPDATE_KEYS = new Set<string>([
  'status',
  'publishedAt',
  'municipalityId',
  'villageSlug',
  'createdAt',
  'createdBy',
  'readCount',
  'commentCount',
]);

// ────── post CRUD ──────
export async function createNewsPost(input: CreateNewsPostInput): Promise<string> {
  // doc() on a typed collection ref yields an auto-id typed doc ref.
  const ref = doc(newsCollection(getDb()));
  const now = new Date();
  const villageSlug = await getVillageSlug(input.municipalityId);
  // setDoc routes through the typed converter — createdAt/updatedAt must be
  // plain Dates (serverTimestamp sentinels are rejected by the schema).
  await setDoc(
    ref,
    buildNewsPostData({
      municipalityId: input.municipalityId,
      villageSlug,
      createdBy: input.createdBy,
      organizerUserIds: input.organizerUserIds,
      organizerOrgIds: input.organizerOrgIds ?? [],
      title: input.title,
      body: input.body,
      content: input.content ?? [],
      category: input.category,
      images: input.images ?? [],
      coverImage: input.coverImage ?? null,
      createdAt: now,
      updatedAt: now,
    }),
  );
  return ref.id;
}

export async function getNewsPost(
  id: string,
): Promise<(NewsPostData & { id: string }) | null> {
  const snap = await getDoc(newsDoc(getDb(), id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export function watchNewsPost(
  id: string,
  onNext: (post: (NewsPostData & { id: string }) | null) => void,
  onError: WatchError,
): Unwatch {
  return watchDoc(newsDoc(getDb(), id), onNext, onError);
}

export async function getNewsPostsByMunicipality(
  municipalityId: string,
  options: { status?: NewsPostStatus; limit?: number; afterPublishedAt?: Date } = {},
): Promise<(NewsPostData & { id: string })[]> {
  const constraints = [
    where('municipalityId', '==', municipalityId),
    ...(options.status ? [where('status', '==', options.status)] : []),
    orderBy('publishedAt', 'desc'),
    ...(options.afterPublishedAt
      ? [startAfter(Timestamp.fromDate(options.afterPublishedAt))]
      : []),
    ...(options.limit ? [fsLimit(options.limit)] : []),
  ];
  const q = query(newsCollection(getDb()), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

type NewsPostWithId = NewsPostData & { id: string };

/**
 * Posts where the user is a named organizer. `activeOnly` is the form that is
 * safe to run against ANOTHER user's uid, since the news read rule lets
 * non-members read only active posts (the read-only "other" profile).
 */
function organizerNewsQuery(userId: string, activeOnly: boolean) {
  return query(
    newsCollection(getDb()),
    where('organizerUserIds', 'array-contains', userId),
    ...(activeOnly ? [where('status', '==', 'active')] : []),
  );
}

// Sorted by createdAt desc in memory; a single user's article count is small.
function newestCreatedFirst(posts: NewsPostWithId[], max?: number): NewsPostWithId[] {
  const sorted = [...posts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return max ? sorted.slice(0, max) : sorted;
}

// All posts where the user is a named organizer, any status (incl. hidden)
// — for the profile "Artículos creados" scroll.
export async function getNewsPostsByOrganizer(
  userId: string,
  options: { limit?: number } = {},
): Promise<NewsPostWithId[]> {
  const snap = await getDocs(organizerNewsQuery(userId, false));
  return newestCreatedFirst(snap.docs.map((d) => ({ id: d.id, ...d.data() })), options.limit);
}

// Active-only variant of getNewsPostsByOrganizer.
export async function getApprovedNewsPostsByOrganizer(
  userId: string,
  options: { limit?: number } = {},
): Promise<NewsPostWithId[]> {
  const snap = await getDocs(organizerNewsQuery(userId, true));
  return newestCreatedFirst(snap.docs.map((d) => ({ id: d.id, ...d.data() })), options.limit);
}

export function watchNewsPostsByOrganizer(
  userId: string,
  options: { activeOnly: boolean },
  onNext: (posts: NewsPostWithId[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(
    organizerNewsQuery(userId, options.activeOnly),
    (posts) => {
      onNext(newestCreatedFirst(posts));
    },
    onError,
  );
}

export async function updateNewsPost(id: string, patch: UpdateNewsPostInput): Promise<void> {
  for (const k of Object.keys(patch)) {
    if (FORBIDDEN_UPDATE_KEYS.has(k)) {
      throw new Error(`updateNewsPost: cannot modify field "${k}" from the client`);
    }
  }
  // updateDoc bypasses the converter, so partial-update payloads (and the
  // serverTimestamp sentinel) go on the raw doc ref rather than the typed one.
  await updateDoc(doc(getDb(), 'news', id), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

/** Hard-delete a news post via the deleteNewsPost callable, which cascades
 * comments with the admin SDK. Authorization (author, village-admin,
 * or app-admin) is verified server-side. */
export async function deleteNewsPost(postId: string): Promise<void> {
  const fn = httpsCallable<{ postId: string }, { ok: true }>(
    getFirebaseFunctions(),
    'deleteNewsPost',
  );
  await fn({ postId });
}

// ────── feed queries ──────
function homeFeedQuery(
  homeMunicipalityId: string,
  options: { limit?: number; afterPublishedAt?: Date },
) {
  return query(
    newsCollection(getDb()),
    where('municipalityId', '==', homeMunicipalityId),
    where('status', '==', 'active'),
    orderBy('publishedAt', 'desc'),
    ...(options.afterPublishedAt
      ? [startAfter(Timestamp.fromDate(options.afterPublishedAt))]
      : []),
    ...(options.limit ? [fsLimit(options.limit)] : []),
  );
}

export async function getHomeFeed(
  homeMunicipalityId: string,
  options: { limit?: number; afterPublishedAt?: Date } = {},
): Promise<(NewsPostData & { id: string })[]> {
  const snap = await getDocs(homeFeedQuery(homeMunicipalityId, options));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function watchHomeFeed(
  homeMunicipalityId: string,
  options: { limit?: number },
  onNext: (posts: (NewsPostData & { id: string })[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(homeFeedQuery(homeMunicipalityId, options), onNext, onError);
}

// Cross-village feed: every active post regardless of municipality. Backs the
// Explora "all villages" view; callers narrow by village client-side.
function allVillagesFeedQuery(options: { limit?: number; afterPublishedAt?: Date }) {
  return query(
    newsCollection(getDb()),
    where('status', '==', 'active'),
    orderBy('publishedAt', 'desc'),
    ...(options.afterPublishedAt
      ? [startAfter(Timestamp.fromDate(options.afterPublishedAt))]
      : []),
    ...(options.limit ? [fsLimit(options.limit)] : []),
  );
}

export async function getAllVillagesFeed(
  options: { limit?: number; afterPublishedAt?: Date } = {},
): Promise<(NewsPostData & { id: string })[]> {
  const snap = await getDocs(allVillagesFeedQuery(options));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function watchAllVillagesFeed(
  options: { limit?: number },
  onNext: (posts: (NewsPostData & { id: string })[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(allVillagesFeedQuery(options), onNext, onError);
}

export async function getOtherVillagesFeed(
  homeMunicipalityId: string,
  options: { limit?: number; afterPublishedAt?: Date } = {},
): Promise<(NewsPostData & { id: string })[]> {
  // NOTE: Firestore requires that when using != on a field, the first orderBy
  // must be on that same field. The compound index (status ASC, municipalityId
  // ASC, publishedAt DESC) declared in firestore.indexes.json supports this.
  const constraints = [
    where('status', '==', 'active'),
    where('municipalityId', '!=', homeMunicipalityId),
    orderBy('municipalityId'),
    orderBy('publishedAt', 'desc'),
    ...(options.afterPublishedAt
      ? [startAfter(Timestamp.fromDate(options.afterPublishedAt))]
      : []),
    ...(options.limit ? [fsLimit(options.limit)] : []),
  ];
  const snap = await getDocs(query(newsCollection(getDb()), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

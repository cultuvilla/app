// packages/shared/src/services/municipalityService.ts
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
  startAfter,
  limit as firestoreLimit,
  type UpdateData,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from '../firebase/sdk/firestore';
import { z } from 'zod';
import { httpsCallable } from '../firebase/sdk/functions';
import { getDb, getFirebaseFunctions } from '../firebase';
import { FiestaBlockSchema, type FiestaBlock } from '../models/municipality/FiestaBlockModel';
import {
  municipalitiesCollection,
  municipalityDoc,
  municipalityBarriosCollection,
  municipalityBarrioDoc,
  municipalityPlacesCollection,
  municipalityPlaceDoc,
} from '../firebase/refs/client';
import type {
  MunicipalityData,
  MunicipalityDataInput,
  VillageCommunity,
  BarrioData,
  BarrioDataInput,
  PlaceData,
  PlaceDataInput,
  PlaceKind,
} from '../models/municipality';
import {
  municipalitySearchKey,
  buildMunicipalityData,
  buildBarrioData,
  buildPlaceData,
} from '../models/municipality/MunicipalityDataModel';
import { watchDoc, watchQuery, type Unwatch, type WatchError } from './watch';

// ── Municipality CRUD ────────────────────────────────────────────────────

export async function getMunicipality(id: string): Promise<(MunicipalityData & { id: string }) | null> {
  const snap = await getDoc(municipalityDoc(getDb(), id));
  if (!snap.exists()) return null;
  rememberVillageSlug(snap.id, snap.data().slug);
  return { id: snap.id, ...snap.data() };
}

export function watchMunicipality(
  id: string,
  onNext: (municipality: (MunicipalityData & { id: string }) | null) => void,
  onError: WatchError,
): Unwatch {
  return watchDoc(
    municipalityDoc(getDb(), id),
    (row) => {
      if (row) rememberVillageSlug(row.id, row.slug);
      onNext(row);
    },
    onError,
  );
}

// ── Slugs ────────────────────────────────────────────────────────────────
//
// A slug is permanent once assigned, so both directions are safe to cache for
// the life of the process: every village screen resolves its `/<pueblo>` route
// segment, and every create path stamps the slug onto the new doc.

const slugById = new Map<string, string>();
const idBySlug = new Map<string, string>();
const nameBySlug = new Map<string, string>();

/** Seed the cache from a municipality the caller already holds. */
export function rememberVillageSlug(municipalityId: string, slug: string): void {
  slugById.set(municipalityId, slug);
  idBySlug.set(slug, municipalityId);
}

/** The cached slug, if this process has already seen the municipality. */
export function peekVillageSlug(municipalityId: string): string | undefined {
  return slugById.get(municipalityId);
}

export async function getVillageSlug(municipalityId: string): Promise<string> {
  const cached = slugById.get(municipalityId);
  if (cached) return cached;
  const municipality = await getMunicipality(municipalityId);
  if (!municipality) throw new Error(`getVillageSlug: municipality ${municipalityId} not found`);
  return municipality.slug;
}

export async function getMunicipalityBySlug(
  slug: string,
): Promise<(MunicipalityData & { id: string }) | null> {
  const snap = await getDocs(
    query(municipalitiesCollection(getDb()), where('slug', '==', slug), firestoreLimit(1)),
  );
  const found = snap.docs.at(0);
  if (!found) return null;
  const data = found.data();
  rememberVillageSlug(found.id, slug);
  nameBySlug.set(slug, data.name);
  return { id: found.id, ...data };
}

/**
 * The village behind a `/<pueblo>` route segment, or null when no village has
 * it. The name rides along with the id because screens title themselves after
 * the pueblo ("Diccionario de Matabuena") and would otherwise re-read the
 * municipality doc for one string.
 */
export async function resolveVillageRoute(
  slug: string,
): Promise<{ id: string; name: string } | null> {
  const cachedId = idBySlug.get(slug);
  const cachedName = nameBySlug.get(slug);
  if (cachedId && cachedName) return { id: cachedId, name: cachedName };
  const municipality = await getMunicipalityBySlug(slug);
  return municipality ? { id: municipality.id, name: municipality.name } : null;
}

/**
 * Prefix-search municipalities by name. Matches against the indexed
 * `searchPrefixes` array (accent-stripped, lowercased) so "avila" finds
 * "Ávila", "manzanas" finds "Villanueva de las Manzanas", and "donostia"
 * finds "San Sebastián".
 *
 * The match is per-*word*, not just on the start of the full name: Spanish
 * municipality names overwhelmingly lead with a shared generic ("Villanueva
 * de las…"), and residents type the distinctive word. A `nameLower` range
 * scan required the generic and returned nothing without it.
 *
 * An empty query returns the first `limit` municipalities alphabetically.
 *
 * Cost: O(limit) doc reads regardless of collection size — safe to call
 * on every keystroke (debounce in caller for UX).
 */
export async function searchMunicipalities(
  searchQuery: string,
  limit = 50,
): Promise<(MunicipalityData & { id: string })[]> {
  const key = municipalitySearchKey(searchQuery.trim());
  if (key.length === 0) {
    const q = query(
      municipalitiesCollection(getDb()),
      orderBy('nameLower', 'asc'),
      firestoreLimit(limit),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  // One array-contains on the prefix index replaces the old nameLower range
  // scan: same accent-insensitive prefix behaviour, but it matches any word of
  // the name (and any official-language alias), not just the leading one.
  const q = query(
    municipalitiesCollection(getDb()),
    where('searchPrefixes', 'array-contains', key),
    orderBy('nameLower', 'asc'),
    firestoreLimit(limit),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getActiveCommunities(): Promise<(MunicipalityData & { id: string })[]> {
  const q = query(
    municipalitiesCollection(getDb()),
    where('communityActive', '==', true),
    orderBy('name', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Pueblos where `userId` holds the Embajador title (`community.organizerId`).
 * Public read: the title is a public role, shown on the user's profile.
 */
export async function getVillagesWhereAmbassador(
  userId: string,
): Promise<(MunicipalityData & { id: string })[]> {
  const q = query(
    municipalitiesCollection(getDb()),
    where('community.organizerId', '==', userId),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export interface MunicipalitiesPage {
  items: (MunicipalityData & { id: string })[];
  nextCursor: QueryDocumentSnapshot | null;
}

/**
 * One cursor-paginated page of municipalities ordered by `nameLower`.
 *
 * - `search` (optional) applies the same accent-stripped prefix match as
 *   `searchMunicipalities` so the active-group filter and the full-list search
 *   agree.
 * - `cursor` is the opaque `nextCursor` from the previous page (omit/`null`
 *   for the first page). Pages with `startAfter`.
 * - `nextCursor` is the last snapshot of a full page, or `null` once fewer than
 *   `limit` rows come back (list exhausted).
 */
export async function listMunicipalitiesPage(opts: {
  search?: string;
  cursor?: QueryDocumentSnapshot | null;
  limit?: number;
}): Promise<MunicipalitiesPage> {
  const pageSize = opts.limit ?? 20;
  const key = municipalitySearchKey((opts.search ?? '').trim());
  const constraints: QueryConstraint[] = [orderBy('nameLower', 'asc')];
  if (key.length > 0) {
    constraints.push(where('searchPrefixes', 'array-contains', key));
  }
  if (opts.cursor) constraints.push(startAfter(opts.cursor));
  constraints.push(firestoreLimit(pageSize));

  const snap = await getDocs(query(municipalitiesCollection(getDb()), ...constraints));
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  // The cursor is opaque to callers (handed straight back to startAfter), so we
  // erase the converter's model generic to the public QueryDocumentSnapshot.
  const nextCursor =
    snap.docs.length === pageSize
      ? (snap.docs[snap.docs.length - 1] as QueryDocumentSnapshot)
      : null;
  return { items, nextCursor };
}

export async function createMunicipality(input: MunicipalityDataInput): Promise<string> {
  const newRef = doc(municipalitiesCollection(getDb()));
  await setDoc(newRef, buildMunicipalityData(input));
  return newRef.id;
}

export async function updateMunicipality(
  id: string,
  data: Partial<
    Pick<
      MunicipalityData,
      | 'name'
      | 'province'
      | 'comunidadAutonoma'
      | 'codigoINE'
      | 'coordinates'
      | 'locationLabel'
      | 'mapZoom'
      | 'escudoManualUrl'
    >
  >,
): Promise<void> {
  // updateDoc bypasses the converter; use untyped doc + UpdateData<DocumentData>
  // so partial payloads (no required fields, plain values) typecheck.
  const updates: UpdateData<DocumentData> = { ...data };
  await updateDoc(doc(getDb(), 'municipalities', id), updates);
}

export async function deleteMunicipality(id: string): Promise<void> {
  await deleteDoc(municipalityDoc(getDb(), id));
}

// ── Community lifecycle ──────────────────────────────────────────────────
//
// A dormant municipality's community is *activated* by the `startVillage`
// callable (any villager — organizerId starts null). Basic info is edited via
// the `updateVillageInfo` callable, which enforces the wiki-phase rule
// server-side. The organizer role is granted separately by
// respondToOrganizerRequest. The direct-write helpers below only apply once the
// caller is a village admin (the admin community-edit screen).

interface StartVillagePayload {
  municipalityId: string;
  description?: string;
  /** URL of an escudo uploaded during activation; set server-side only when
   *  the village has no escudo yet (admin-only field on the client). */
  escudoManualUrl?: string;
}

/** Activate a dormant municipality's community and join it as the first member. */
export async function startVillage(payload: StartVillagePayload): Promise<void> {
  const fn = httpsCallable<StartVillagePayload, { ok: true }>(
    getFirebaseFunctions(),
    'startVillage',
  );
  await fn(payload);
}

interface UpdateVillageInfoPayload {
  municipalityId: string;
  description?: string;
}

/** Edit a village's basic info. Allowed for any member during the wiki phase
 *  (no organizer yet), and for admins afterwards — enforced server-side. */
export async function updateVillageInfo(payload: UpdateVillageInfoPayload): Promise<void> {
  const fn = httpsCallable<UpdateVillageInfoPayload, { ok: true }>(
    getFirebaseFunctions(),
    'updateVillageInfo',
  );
  await fn(payload);
}

/**
 * Refuse malformed fiesta data at the write boundary.
 *
 * This write goes through a bare `doc()` ref — no converter — while every read
 * of a municipality parses strictly. A single invalid block (an empty name from
 * a cleared input, say) therefore makes the village document unreadable for
 * EVERY user, not just its author. Validating here is what keeps a UI slip from
 * bricking a village, and it covers callers the editor doesn't own.
 *
 * Block ids must also be unique: the id keys the per-block Wrapped document, so
 * a duplicate would silently make two blocks share one summary.
 */
function assertValidFiestas(fiestas: FiestaBlock[]): FiestaBlock[] {
  const parsed = z.array(FiestaBlockSchema).parse(fiestas);
  const ids = new Set(parsed.map((b) => b.id));
  if (ids.size !== parsed.length) throw new Error('fiesta blocks must have unique ids');
  return parsed;
}

export async function updateCommunity(
  municipalityId: string,
  data: Partial<Pick<VillageCommunity, 'description' | 'fiestas'>>,
): Promise<void> {
  const updates: UpdateData<DocumentData> = {};
  if (data.description !== undefined) updates['community.description'] = data.description;
  if (data.fiestas !== undefined) updates['community.fiestas'] = assertValidFiestas(data.fiestas);
  await updateDoc(doc(getDb(), 'municipalities', municipalityId), updates);
}

export async function deactivateCommunity(municipalityId: string): Promise<void> {
  await updateDoc(doc(getDb(), 'municipalities', municipalityId), {
    community: null,
    communityActive: false,
  });
}

// ── Barrios ──────────────────────────────────────────────────────────────
//
// Any village member may create a barrio; it lands `active` and is visible to
// everyone immediately. Village/app admins can hide it afterward via
// `moderationService`. Enforcement lives in firestore.rules.

function activeBarriosQuery(municipalityId: string) {
  return query(
    municipalityBarriosCollection(getDb(), municipalityId),
    where('status', '==', 'active'),
    orderBy('name', 'asc'),
  );
}

export async function getBarrios(municipalityId: string): Promise<(BarrioData & { id: string })[]> {
  const snap = await getDocs(activeBarriosQuery(municipalityId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function watchBarrios(
  municipalityId: string,
  onNext: (barrios: (BarrioData & { id: string })[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(activeBarriosQuery(municipalityId), onNext, onError);
}

/** Mint a barrio doc id up front, so images can be uploaded to its storage
 * path before `createBarrio` writes the doc (with images). */
export function newBarrioId(municipalityId: string): string {
  return doc(municipalityBarriosCollection(getDb(), municipalityId)).id;
}

export async function createBarrio(
  municipalityId: string,
  input: BarrioDataInput,
  id: string = newBarrioId(municipalityId),
): Promise<string> {
  const newRef = municipalityBarrioDoc(getDb(), municipalityId, id);
  await setDoc(newRef, buildBarrioData({ ...input, municipalityId }));
  return newRef.id;
}

export async function updateBarrio(
  municipalityId: string,
  barrioId: string,
  data: Partial<Omit<BarrioData, 'createdAt'>>,
): Promise<void> {
  const updates: UpdateData<DocumentData> = { ...data };
  await updateDoc(doc(getDb(), 'municipalities', municipalityId, 'barrios', barrioId), updates);
}

export async function deleteBarrio(municipalityId: string, barrioId: string): Promise<void> {
  await deleteDoc(municipalityBarrioDoc(getDb(), municipalityId, barrioId));
}

/** Fetch a single barrio document, or `null` if it does not exist. */
export async function getBarrio(
  municipalityId: string,
  barrioId: string,
): Promise<(BarrioData & { id: string }) | null> {
  const snap = await getDoc(municipalityBarrioDoc(getDb(), municipalityId, barrioId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function watchBarrio(
  municipalityId: string,
  barrioId: string,
  onNext: (barrio: (BarrioData & { id: string }) | null) => void,
  onError: WatchError,
): Unwatch {
  return watchDoc(municipalityBarrioDoc(getDb(), municipalityId, barrioId), onNext, onError);
}

// ── Places (cemeteries, churches, …) ───────────────────────────────────────
//
// Any village member may create a place; it lands `active` and is visible to
// everyone immediately. Village/app admins can hide it afterward via
// `moderationService`. Enforcement lives in firestore.rules.

// Returns all active places for a municipality ordered by name. Pass `kind` to
// filter in memory — a village has few places, so we avoid a composite index.
export async function getPlaces(
  municipalityId: string,
  kind?: PlaceKind,
): Promise<(PlaceData & { id: string })[]> {
  const snap = await getDocs(activePlacesQuery(municipalityId));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return kind ? rows.filter((r) => r.kind === kind) : rows;
}

function activePlacesQuery(municipalityId: string) {
  return query(
    municipalityPlacesCollection(getDb(), municipalityId),
    where('status', '==', 'active'),
    orderBy('name', 'asc'),
  );
}

export function watchPlaces(
  municipalityId: string,
  onNext: (places: (PlaceData & { id: string })[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(activePlacesQuery(municipalityId), onNext, onError);
}

/** Mint a place doc id up front, so images can be uploaded to its storage
 * path before `createPlace` writes the doc (with images). */
export function newPlaceId(municipalityId: string): string {
  return doc(municipalityPlacesCollection(getDb(), municipalityId)).id;
}

export async function createPlace(
  municipalityId: string,
  input: PlaceDataInput,
  id: string = newPlaceId(municipalityId),
): Promise<string> {
  const newRef = municipalityPlaceDoc(getDb(), municipalityId, id);
  await setDoc(newRef, buildPlaceData({ ...input, municipalityId }));
  return newRef.id;
}

export async function updatePlace(
  municipalityId: string,
  placeId: string,
  data: Partial<Omit<PlaceData, 'createdAt'>>,
): Promise<void> {
  const updates: UpdateData<DocumentData> = { ...data };
  await updateDoc(doc(getDb(), 'municipalities', municipalityId, 'places', placeId), updates);
}

export async function deletePlace(municipalityId: string, placeId: string): Promise<void> {
  await deleteDoc(municipalityPlaceDoc(getDb(), municipalityId, placeId));
}

/** Fetch a single place document, or `null` if it does not exist. */
export async function getPlace(
  municipalityId: string,
  placeId: string,
): Promise<(PlaceData & { id: string }) | null> {
  const snap = await getDoc(municipalityPlaceDoc(getDb(), municipalityId, placeId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function watchPlace(
  municipalityId: string,
  placeId: string,
  onNext: (place: (PlaceData & { id: string }) | null) => void,
  onError: WatchError,
): Unwatch {
  return watchDoc(municipalityPlaceDoc(getDb(), municipalityId, placeId), onNext, onError);
}

// keep export so other code can call setDoc directly for seed-style work
export { setDoc };

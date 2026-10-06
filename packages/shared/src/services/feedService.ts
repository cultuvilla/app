import {
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  startAfter,
  getDocs,
  Timestamp,
  type QueryDocumentSnapshot,
} from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import { eventsCollection } from '../firebase/refs/client';
import type { EventData } from '../models/event/EventDataModel';
import type { LatLng } from '../models/core/LocationDataModel';
import { forbiddenAsEmpty, watchMerged, watchQuery, type Unwatch, type WatchError } from './watch';

export interface FeedPage {
  events: (EventData & { id: string })[];
  cursor: QueryDocumentSnapshot<EventData> | null;
}

function startOfToday(): Date {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  return day;
}

function upcomingFeedQuery(pageSize: number, cursor: QueryDocumentSnapshot<EventData> | null) {
  const ref = eventsCollection(getDb());
  // Range on `endBoundary` (endDate ?? startDate), not `startDate`: an event
  // stays in the feed for the whole of its (last) day, so one that started
  // earlier today or a multi-day event mid-run still shows. The lower bound is
  // the start of today, not `now` — completeExpiredEvents flips genuinely-past
  // events to `completed`, so the status filter drops them. Firestore requires
  // the first orderBy to match the inequality field, hence orderBy(endBoundary).
  const baseConstraints = [
    where('status', '==', 'published'),
    // Rules do not filter a list — an unpinned query either leaks the private
    // rows or fails outright — so the global feed asks only for public events.
    // Private ones reach the feed through getPrivateUpcomingFeed, one org at a
    // time.
    where('visibility', '==', 'public'),
    where('endBoundary', '>=', Timestamp.fromDate(startOfToday())),
    orderBy('endBoundary', 'asc'),
    firestoreLimit(pageSize),
  ];
  return cursor
    ? query(ref, ...baseConstraints, startAfter(cursor))
    : query(ref, ...baseConstraints);
}

export async function getUpcomingFeed(
  pageSize: number = 20,
  cursor: QueryDocumentSnapshot<EventData> | null = null,
): Promise<FeedPage> {
  const snap = await getDocs(upcomingFeedQuery(pageSize, cursor));
  const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const lastDoc = snap.docs.length > 0 ? (snap.docs[snap.docs.length - 1] ?? null) : null;
  return { events, cursor: lastDoc };
}

/**
 * The private companion to `getUpcomingFeed`: upcoming events restricted to the
 * organizations the viewer belongs to. Unpaginated on purpose — an org's own
 * calendar is small, and merging two cursors into one infinite list would make
 * the feed's ordering depend on which page each half happened to be on.
 *
 * One query per org, never an `in` over several: the read rule resolves a
 * membership document per returned event, and keeping a page to a single org
 * keeps that to one (cached) lookup instead of one per document.
 */
export async function getPrivateUpcomingFeed(
  orgIds: string[],
): Promise<(EventData & { id: string })[]> {
  if (orgIds.length === 0) return [];
  const pages = await Promise.all(
    orgIds.map(async (orgId) => {
      const snap = await getDocs(orgUpcomingQuery(orgId));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }),
  );
  return byEndBoundary(pages.flat());
}

function orgUpcomingQuery(orgId: string) {
  return query(
    eventsCollection(getDb()),
    where('visibilityOrgId', '==', orgId),
    where('status', '==', 'published'),
    where('endBoundary', '>=', Timestamp.fromDate(startOfToday())),
    orderBy('endBoundary', 'asc'),
  );
}

function byEndBoundary(events: (EventData & { id: string })[]) {
  return [...events].sort((a, b) => a.endBoundary.getTime() - b.endBoundary.getTime());
}

/**
 * The feed's first page, live. The day boundary is fixed when the listener
 * opens, so a caller should key the subscription by date to roll it over.
 */
export function watchUpcomingFeed(
  pageSize: number,
  onNext: (events: (EventData & { id: string })[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(upcomingFeedQuery(pageSize, null), onNext, onError);
}

/**
 * Private events of every org the viewer belongs to. Only members of an
 * `approval` org may read its private events, so the rules refuse the query
 * for an open org outright; that org contributes nothing rather than blanking
 * the private events of every other org (docs/decisions/org-join-policy.md).
 */
export function watchPrivateUpcomingFeed(
  orgIds: string[],
  onNext: (events: (EventData & { id: string })[]) => void,
  onError: WatchError,
): Unwatch {
  return watchMerged<EventData & { id: string }>(
    orgIds.map((orgId) =>
      forbiddenAsEmpty<EventData & { id: string }>((next, error) =>
        watchQuery(orgUpcomingQuery(orgId), next, error),
      ),
    ),
    byEndBoundary,
    onNext,
    onError,
  );
}

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two coordinates in kilometers.
 * Pure function; no Firebase calls.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

export function filterByDistanceKm<T extends { villageCoordinates: LatLng | null }>(
  events: T[],
  reference: LatLng,
  maxKm: number,
): T[] {
  return events.filter(
    (e) => e.villageCoordinates !== null && haversineKm(reference, e.villageCoordinates) <= maxKm,
  );
}

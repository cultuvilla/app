// packages/shared/src/services/eventService.ts
import { getVillageSlug } from './municipalityService';
import {
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  Timestamp,
  doc,
  type UpdateData,
  type DocumentData,
} from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import {
  eventsCollection,
  eventDoc,
} from '../firebase/refs/client';
import {
  buildEventData,
  eventEndBoundary,
  type EventData,
  type EventDataInput,
  type EventStatus,
} from '../models/event/EventDataModel';
import {
  forbiddenAsEmpty,
  watchDoc,
  watchDocsByIds,
  watchMerged,
  watchQuery,
  type Unwatch,
  type WatchError,
} from './watch';

type EventWithId = EventData & { id: string };

/**
 * Every list query over `events` MUST constrain visibility itself. Firestore
 * rules are not a filter: a `list` rule that turns on a field the query leaves
 * unconstrained is evaluated against what the query *could* return, so an
 * unpinned query is not reliably denied — it can hand back the private rows.
 * Where the rule *can* prove the denial it fails the whole page instead. Both
 * outcomes are wrong for a feed, and both are avoided the same way: ask only
 * for what the viewer may read.
 */
const publicOnly = () => where('visibility', '==', 'public');

export async function getEvent(eventId: string): Promise<(EventData & { id: string }) | null> {
  const snap = await getDoc(eventDoc(getDb(), eventId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function watchEvent(
  eventId: string,
  onNext: (event: (EventData & { id: string }) | null) => void,
  onError: WatchError,
): Unwatch {
  return watchDoc(eventDoc(getDb(), eventId), onNext, onError);
}

// A status array becomes an `in` filter (e.g. the pueblo tab wants
// 'published' + 'completed' so past events survive the completion job);
// a single status stays an equality filter. Both reuse the
// municipalityId + status + startDate composite index.
function statusConstraints(status?: EventStatus | EventStatus[]) {
  return Array.isArray(status)
    ? [where('status', 'in', status)]
    : status
      ? [where('status', '==', status)]
      : [];
}

function municipalityEventsQuery(municipalityId: string, status?: EventStatus | EventStatus[]) {
  return query(
    eventsCollection(getDb()),
    where('municipalityId', '==', municipalityId),
    publicOnly(),
    ...statusConstraints(status),
    orderBy('startDate', 'asc'),
  );
}

export async function getEventsByMunicipality(
  municipalityId: string,
  status?: EventStatus | EventStatus[],
): Promise<(EventData & { id: string })[]> {
  const snap = await getDocs(municipalityEventsQuery(municipalityId, status));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function watchEventsByMunicipality(
  municipalityId: string,
  status: EventStatus | EventStatus[] | undefined,
  onNext: (events: EventWithId[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(municipalityEventsQuery(municipalityId, status), onNext, onError);
}

/**
 * The private half of `getEventsByMunicipality`: the events restricted to one
 * of the caller's own organizations. Queried per org — never with an `in` over
 * several — so that every document a page returns shares one membership
 * document, keeping the read rule's `get()` inside its per-request budget.
 *
 * Orgs belong to exactly one municipality, so the village filter is applied in
 * memory rather than costing a fourth index field.
 */
export async function getPrivateEventsByMunicipality(
  municipalityId: string,
  orgIds: string[],
  status?: EventStatus | EventStatus[],
): Promise<EventWithId[]> {
  if (orgIds.length === 0) return [];
  const pages = await Promise.all(
    orgIds.map(async (orgId) => {
      const snap = await getDocs(orgPrivateEventsQuery(orgId, status));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }),
  );
  return inMunicipalityByStart(municipalityId, pages.flat());
}

function orgPrivateEventsQuery(orgId: string, status?: EventStatus | EventStatus[]) {
  return query(
    eventsCollection(getDb()),
    where('visibilityOrgId', '==', orgId),
    ...statusConstraints(status),
    orderBy('startDate', 'asc'),
  );
}

function inMunicipalityByStart(municipalityId: string, events: EventWithId[]): EventWithId[] {
  return events
    .filter((e) => e.municipalityId === municipalityId)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

/**
 * One listener per org (rules do not filter a list); merged as the get does.
 * An org whose private events the rules refuse (an open one) contributes
 * nothing rather than blanking every other org's — see watchPrivateUpcomingFeed.
 */
export function watchPrivateEventsByMunicipality(
  municipalityId: string,
  orgIds: string[],
  status: EventStatus | EventStatus[] | undefined,
  onNext: (events: EventWithId[]) => void,
  onError: WatchError,
): Unwatch {
  return watchMerged<EventWithId>(
    orgIds.map((orgId) =>
      forbiddenAsEmpty<EventWithId>('events:watchPrivateEventsByMunicipality', (next, error) =>
        watchQuery(orgPrivateEventsQuery(orgId, status), next, error),
      ),
    ),
    (rows) => inMunicipalityByStart(municipalityId, rows),
    onNext,
    onError,
  );
}

const LISTED_STATUSES: EventStatus[] = ['published', 'completed'];

function organizationPublicEventsQuery(organizationId: string) {
  return query(
    eventsCollection(getDb()),
    where('organizerOrgIds', 'array-contains', organizationId),
    publicOnly(),
    orderBy('startDate', 'asc'),
  );
}

/**
 * The events an organization has organized, for its detail screen: published
 * and completed, never cancelled, in start order.
 *
 * The private half is its own query pinned on `visibilityOrgId` (rules do not
 * filter a list), asked only when `includePrivate` — a vetted member. A refusal
 * there answers empty rather than costing the public half.
 */
export function watchEventsByOrganization(
  organizationId: string,
  { includePrivate }: { includePrivate: boolean },
  onNext: (events: EventWithId[]) => void,
  onError: WatchError,
): Unwatch {
  const publicPart = (next: (rows: EventWithId[]) => void, error: WatchError) =>
    watchQuery(organizationPublicEventsQuery(organizationId), next, error);
  const privatePart = forbiddenAsEmpty<EventWithId>('events:watchEventsByOrganization', (next, error) =>
    watchQuery(orgPrivateEventsQuery(organizationId, LISTED_STATUSES), next, error),
  );
  return watchMerged<EventWithId>(
    includePrivate ? [publicPart, privatePart] : [publicPart],
    // Status is filtered here rather than in the public query, which would
    // otherwise need a status + array-contains composite index.
    (rows) =>
      rows
        .filter((e) => LISTED_STATUSES.includes(e.status))
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime()),
    onNext,
    onError,
  );
}

export async function createEvent(input: Omit<EventDataInput, 'villageSlug'>): Promise<string> {
  const newRef = doc(eventsCollection(getDb()));
  const villageSlug = await getVillageSlug(input.municipalityId);
  await setDoc(newRef, buildEventData({ ...input, villageSlug }));
  return newRef.id;
}

export async function updateEvent(
  eventId: string,
  data: Partial<Omit<EventData, 'createdAt' | 'createdBy' | 'municipalityId' | 'villageSlug'>>,
): Promise<void> {
  // updateDoc bypasses the converter's toFirestore, so partial-update payloads
  // still need explicit Timestamp conversion for Date fields. Use the untyped
  // doc ref here since the converter type would require Date, not Timestamp.
  const updates: UpdateData<DocumentData> = { ...data, updatedAt: serverTimestamp() };
  if (data.startDate instanceof Date) {
    updates['startDate'] = Timestamp.fromDate(data.startDate);
  }
  if (data.endDate instanceof Date) {
    updates['endDate'] = Timestamp.fromDate(data.endDate);
  }
  // Keep the derived feed key in sync. The edit form always sends startDate and
  // endDate together, so recompute the boundary whenever startDate is patched;
  // a stale endBoundary would silently hide (or wrongly surface) the event.
  if (data.startDate instanceof Date) {
    const boundary = eventEndBoundary({ startDate: data.startDate, endDate: data.endDate ?? null });
    updates['endBoundary'] = Timestamp.fromDate(boundary);
  }
  await updateDoc(doc(getDb(), 'events', eventId), updates);
}

export async function updateEventStatus(eventId: string, status: EventStatus): Promise<void> {
  await updateDoc(doc(getDb(), 'events', eventId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteEvent(eventId: string): Promise<void> {
  await deleteDoc(eventDoc(getDb(), eventId));
}

function organizerEventsQuery(userId: string) {
  return query(
    eventsCollection(getDb()),
    where('organizerUserIds', 'array-contains', userId),
    orderBy('createdAt', 'desc'),
  );
}

// A "deleted" event is soft-cancelled (status -> 'cancelled'); the profile's
// managed-events list must not resurface it. Filtered here rather than in the
// query to avoid a status+array-contains composite index.
const notCancelled = (rows: EventWithId[]) => rows.filter((e) => e.status !== 'cancelled');

export async function getEventsByOrganizer(
  userId: string,
): Promise<(EventData & { id: string })[]> {
  const snap = await getDocs(organizerEventsQuery(userId));
  return notCancelled(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

export function watchEventsByOrganizer(
  userId: string,
  onNext: (events: EventWithId[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(
    organizerEventsQuery(userId),
    (rows) => {
      onNext(notCancelled(rows));
    },
    onError,
  );
}

/** Several events by id, in the order given; an id with no event is dropped. */
export function watchEventsByIds(
  eventIds: string[],
  onNext: (events: EventWithId[]) => void,
  onError: WatchError,
): Unwatch {
  return watchDocsByIds(eventIds, watchEvent, onNext, onError);
}

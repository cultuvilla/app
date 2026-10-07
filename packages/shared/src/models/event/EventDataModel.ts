import { z } from 'zod';
import { LocationDataSchema, LatLngSchema, type LatLng } from '../core/LocationDataModel';
import { SignupFieldsSchema, type SignupFieldSpec } from './SignupFieldModel';

/**
 * Upper bound on `signupGroupSize`. Groups are seated atomically, so a large
 * group would make the capacity edge of a popular event mostly unusable (a
 * group of 8 needs 8 free seats or it waits); 4 covers parejas, tríos and
 * coches/mesas, which is the whole of the observed demand.
 * Re-checked in firestore.rules — keep the two in step.
 */
export const MAX_SIGNUP_GROUP_SIZE = 4;

// Events publish on create — there is no `draft` state.
export const EventStatusSchema = z.enum(['published', 'cancelled', 'completed']);
export type EventStatus = z.infer<typeof EventStatusSchema>;

// Who may read the event's attendee roster. `members` = anyone who has joined
// the event's pueblo (the default: seeing who is going is what drives sign-ups
// in a village); `organizers` = only the organizer set + village/app admins,
// for events where a visible list would be inappropriate. Never world-readable
// — a roster names real people, and a guest-readable one would put dependent
// personas (typically children) on an open URL.
export const AttendeesVisibilitySchema = z.enum(['members', 'organizers']);
export type AttendeesVisibility = z.infer<typeof AttendeesVisibilitySchema>;

// Who may see the event at all. `public` = the whole app (the historical and
// default behaviour); `organization` = only members of `visibilityOrgId`, the
// event's own organizer set, and app admins. Village admins are deliberately
// NOT on that list: a private event is private from the pueblo's leadership too,
// which is the entire point of a peña organizing something for its own members.
// Enforced in firestore.rules (read), in registerToEvent / claimSeat (sign-up),
// and in the OG renderer (link previews).
export const EventVisibilitySchema = z.enum(['public', 'organization']);
export type EventVisibility = z.infer<typeof EventVisibilitySchema>;

export const EventDataSchema = z.object({
  title: z.string(),
  description: z.string(),
  startDate: z.date(),
  // Optional end of a multi-day event. `null` means single-day: the event runs
  // for the rest of its Europe/Madrid start day (see isEventOngoing). When set,
  // it must be >= startDate (enforced in firestore.rules and the create form).
  // `.default(null)`: events created during the single-date era have no endDate
  // field at all, so reads of those legacy docs normalize the absent field to
  // null instead of throwing. New docs always carry it (buildEventData + rules).
  endDate: z.date().nullable().default(null),
  location: LocationDataSchema,
  imageURL: z.string().nullable(),
  maxAttendees: z.number().int().nullable(),
  telephoneRequired: z.boolean(),
  // True when money is collected for the event; the organizer marks who paid
  // per-attendee via registration.paidAt. `.default(false)` so reads of event
  // docs created before this field parse instead of throwing the strict
  // converter (existing dev docs are backfilled to false in this same change).
  requiresPayment: z.boolean().default(false),
  // Creator-defined per-attendee questions asked at sign-up (t-shirt size, DNI,
  // …). Answers never land here or on the public registration doc — they go to
  // the organizer-gated registrationPrivate doc. `.default([])` so events
  // created before this field parse through the strict converter (existing dev
  // docs are backfilled to [] in this same change).
  signupFields: SignupFieldsSchema,
  // False for events that simply happen — a verbena you walk into, or one whose
  // sign-up is run off-app (at the ayuntamiento, by phone, on a paper list).
  // The detail screen then hides the sign-up FAB and registerToEvent refuses,
  // so the roster stays empty except for organizer-added walk-ins. `.default(true)`
  // so events created before this field parse through the strict converter
  // (existing docs are backfilled in this same change).
  signupEnabled: z.boolean().default(true),
  // Free-text line shown in place of the sign-up button when signupEnabled is
  // false ("Entrada libre", "Inscripciones en el bar Paco", a URL). Null means
  // the UI falls back to a generic "no requiere inscripción" string.
  signupInfo: z.string().nullable().default(null),
  // `.default('members')` so events created before this field parse through
  // the strict converter (existing docs are backfilled in this same change).
  // firestore.rules reads the same default via `data.get(...)`, so the stored
  // and enforced meaning of an absent field agree.
  attendeesVisibility: AttendeesVisibilitySchema.default('members'),
  // How many people must sign up together: 1 = ordinary individual sign-up,
  // 2 = parejas, 3-4 = small teams. A group is seated atomically — every seat
  // is confirmed or every seat waits — so capacity can never split a pareja.
  // A seat the creator does not fill with a persona of their own is an *open
  // seat*: a real, held registration carrying a single-use claim token, which
  // a friend turns into their own registration by following the link.
  // `.default(1)` so events created before this field parse instead of
  // throwing the strict converter (existing docs are backfilled to 1 in this
  // same change).
  signupGroupSize: z.number().int().min(1).max(MAX_SIGNUP_GROUP_SIZE).default(1),
  // Optional birth-year eligibility window the organizer advertises: a
  // children's taller sets minBirthYear, a mayores merienda sets maxBirthYear,
  // a quinta event sets both to the same year. Either end may be null (open).
  // This is ADVISORY, not enforced: the sign-up sheet warns and asks the user
  // to confirm, and nothing server-side rejects an out-of-range attendee —
  // organizers add walk-ins and guests claim open seats, and a hard gate would
  // strand both. `.default(null)` so events created before this field parse
  // through the strict converter (existing docs are backfilled in this same
  // change).
  minBirthYear: z.number().int().nullable().default(null),
  maxBirthYear: z.number().int().nullable().default(null),
  // `.default('public')` so events created before this field parse through the
  // strict converter (existing docs are backfilled to 'public' in this same
  // change). firestore.rules reads the same default via `data.get(...)`, so the
  // stored and enforced meaning of an absent field agree.
  visibility: EventVisibilitySchema.default('public'),
  // The organization whose members may see and join the event. Non-null iff
  // `visibility` is 'organization' — the pairing is enforced by buildEventData,
  // by firestore.rules on create/update, and by isPrivateEvent below, which
  // reads the id rather than the enum so a half-written doc fails closed.
  visibilityOrgId: z.string().nullable().default(null),
  status: EventStatusSchema,
  organizerUserIds: z.array(z.string()),
  organizerOrgIds: z.array(z.string()),
  createdBy: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // Physical-layer foreign key: which municipality doc this event belongs to.
  municipalityId: z.string(),
  // Community-layer denormalized display fields, copied from the village
  // (the activated municipality) by syncVillageDenormalization for flat feed
  // reads. See docs/architecture/municipality-vs-village.md.
  villageName: z.string(),
  // The village's permanent URL slug — see municipalitySlug.ts. Never synced:
  // slugs do not move when a municipality is renamed.
  villageSlug: z.string(),
  villageCoverImage: z.string().nullable(),
  villageCoordinates: LatLngSchema.nullable(),
  // Denormalized attendee counters, maintained server-side by the
  // registerToEvent / waitlistPromotion functions. Initialized to 0 at create
  // so every event doc carries them — never absent.
  confirmedCount: z.number().int(),
  totalCount: z.number().int(),
  // Denormalized interaction counters, maintained server-side by the comments
  // Cloud Function trigger / the detail-screen view tracker. Initialized to 0
  // at create.
  commentCount: z.number().int(),
  readCount: z.number().int(),
  // Derived from `endDate ?? startDate` (see eventEndBoundary): the instant an
  // event stops being current. The Explora feed queries on this — not on
  // `startDate` — so a same-day event that already started, or a multi-day
  // event mid-run, still surfaces (it drops out only once completeExpiredEvents
  // flips its status). Written by buildEventData on create and recomputed in
  // updateEvent whenever the dates change; kept a stored field (not computed at
  // read) because Firestore can only range-filter/order on a persisted field.
  endBoundary: z.date(),
});
export type EventData = z.infer<typeof EventDataSchema>;

export interface EventDataInput {
  title: string;
  description: string;
  startDate: Date;
  endDate?: Date | null;
  location: z.infer<typeof LocationDataSchema>;
  imageURL?: string | null;
  maxAttendees?: number | null;
  telephoneRequired?: boolean;
  requiresPayment?: boolean;
  signupFields?: SignupFieldSpec[];
  signupEnabled?: boolean;
  signupInfo?: string | null;
  attendeesVisibility?: AttendeesVisibility;
  signupGroupSize?: number;
  minBirthYear?: number | null;
  maxBirthYear?: number | null;
  visibility?: EventVisibility;
  visibilityOrgId?: string | null;
  status?: EventStatus;
  organizerUserIds: string[];
  organizerOrgIds: string[];
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
  municipalityId: string;
  villageName: string;
  villageSlug: string;
  villageCoverImage?: string | null;
  villageCoordinates: LatLng | null;
}

export function buildEventData(input: EventDataInput): EventData {
  const now = new Date();
  const endDate = input.endDate ?? null;
  // The pair is normalized here rather than trusted from the caller: a
  // `visibility: 'organization'` with no org would be an event nobody — not
  // even its creator — could ever read back, and an orphan `visibilityOrgId`
  // on a public event would make the feed's private query surface it twice.
  const visibilityOrgId = input.visibility === 'organization' ? (input.visibilityOrgId ?? null) : null;
  const visibility = visibilityOrgId === null ? 'public' : 'organization';
  return {
    title: input.title,
    description: input.description,
    startDate: input.startDate,
    endDate,
    location: input.location,
    imageURL: input.imageURL ?? null,
    maxAttendees: input.maxAttendees ?? null,
    telephoneRequired: input.telephoneRequired ?? false,
    requiresPayment: input.requiresPayment ?? false,
    signupFields: input.signupFields ?? [],
    signupEnabled: input.signupEnabled ?? true,
    signupInfo: input.signupInfo ?? null,
    attendeesVisibility: input.attendeesVisibility ?? 'members',
    signupGroupSize: input.signupGroupSize ?? 1,
    minBirthYear: input.minBirthYear ?? null,
    maxBirthYear: input.maxBirthYear ?? null,
    visibility,
    visibilityOrgId,
    status: input.status ?? 'published',
    organizerUserIds: input.organizerUserIds,
    organizerOrgIds: input.organizerOrgIds,
    createdBy: input.createdBy,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    municipalityId: input.municipalityId,
    villageName: input.villageName,
    villageSlug: input.villageSlug,
    villageCoverImage: input.villageCoverImage ?? null,
    villageCoordinates: input.villageCoordinates,
    confirmedCount: 0,
    totalCount: 0,
    commentCount: 0,
    readCount: 0,
    endBoundary: eventEndBoundary({ startDate: input.startDate, endDate }),
  };
}

/**
 * True when the event is restricted to one organization's members.
 * Reads `visibilityOrgId`, not the enum: a doc that somehow carries
 * `visibility: 'organization'` with no org id is unreadable by anyone, so
 * treating it as public would be the only failure mode worse than hiding it.
 */
export function isPrivateEvent(
  event: Pick<EventData, 'visibility' | 'visibilityOrgId'>,
): boolean {
  return event.visibility === 'organization' && event.visibilityOrgId !== null;
}

/** Everything about a viewer that decides whether a private event is theirs to see. */
export interface EventViewer {
  userId: string | null;
  /** Organizations the viewer belongs to. */
  orgIds: string[];
  isAppAdmin?: boolean;
}

/**
 * The client-side mirror of the `events` read rule. Firestore is the authority
 * — this exists so screens can hide what the rules would deny instead of
 * rendering a card that 404s on tap.
 *
 * Village admins are absent on purpose (see EventVisibilitySchema): they
 * moderate the pueblo's public square, and a peña's internal event is not it.
 */
export function canViewEvent(
  event: Pick<EventData, 'visibility' | 'visibilityOrgId' | 'organizerUserIds'>,
  viewer: EventViewer,
): boolean {
  if (!isPrivateEvent(event)) return true;
  if (viewer.isAppAdmin === true) return true;
  if (viewer.userId !== null && event.organizerUserIds.includes(viewer.userId)) return true;
  return event.visibilityOrgId !== null && viewer.orgIds.includes(event.visibilityOrgId);
}

/** True when the event seats people in groups rather than one by one. */
export function isGroupSignupEvent(event: Pick<EventData, 'signupGroupSize'>): boolean {
  return event.signupGroupSize > 1;
}

export function isEventFull(event: EventData, confirmedCount: number): boolean {
  if (event.maxAttendees === null) return false;
  return confirmedCount >= event.maxAttendees;
}

export function isEventSignupOpen(
  event: Pick<EventData, 'status' | 'signupEnabled'>,
): boolean {
  return event.status === 'published' && event.signupEnabled;
}

/** The wall clock every event date is authored and displayed in. */
export const EVENT_TZ = 'Europe/Madrid';
/** `YYYY-MM-DD` for the Europe/Madrid calendar day containing `d`. */
export function madridDayKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: EVENT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** True once `now` is a later Europe/Madrid calendar day than `start`. */
export function isStartDayOver(start: Date, now: Date): boolean {
  return madridDayKey(now) > madridDayKey(start);
}

/**
 * The day an event stops being "ongoing": its `endDate` for multi-day events,
 * or its `startDate` when single-day (`endDate` null). Both `isEventOngoing`
 * and the completeExpiredEvents scheduler key their day-boundary check off this.
 */
export function eventEndBoundary(event: Pick<EventData, 'startDate' | 'endDate'>): Date {
  return event.endDate ?? event.startDate;
}

/**
 * How an event list reads left to right: upcoming first (soonest first), then
 * past (most recent first). Split on the end boundary, so a multi-day event
 * still running counts as upcoming.
 */
export function upcomingThenPast<E extends Pick<EventData, 'startDate' | 'endDate'>>(
  events: readonly E[],
  now: Date,
): E[] {
  const byStart = [...events].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const isPast = (e: E) => isStartDayOver(eventEndBoundary(e), now);
  return [...byStart.filter((e) => !isPast(e)), ...byStart.filter(isPast).reverse()];
}

export function isEventOngoing(
  event: Pick<EventData, 'status' | 'startDate' | 'endDate'>,
  now: Date,
): boolean {
  if (event.status !== 'published') return false;
  if (event.startDate > now) return false;
  return !isStartDayOver(eventEndBoundary(event), now);
}

/** The birth-year window an event advertises; both ends optional. */
export type BirthYearWindow = Pick<EventData, 'minBirthYear' | 'maxBirthYear'>;

/** True when the event advertises any birth-year restriction at all. */
export function hasBirthYearWindow(event: BirthYearWindow): boolean {
  return event.minBirthYear !== null || event.maxBirthYear !== null;
}

/**
 * Whether a persona's birth year sits inside the event's advertised window.
 *
 * `'unknown'` is deliberately NOT `'out-of-range'`: every persona created in
 * the app carries a full birthday (PersonForm requires it), so a null year
 * means a legacy or seeded doc, and nagging about those would put a modal in
 * front of a sign-up we have no evidence to question.
 */
export function birthYearEligibility(
  event: BirthYearWindow,
  birthYear: number | null | undefined,
): 'ok' | 'unknown' | 'too-old' | 'too-young' {
  if (!hasBirthYearWindow(event)) return 'ok';
  if (birthYear == null) return 'unknown';
  // minBirthYear is the EARLIEST year allowed, so falling below it means the
  // persona was born before the window — i.e. too old for the event.
  if (event.minBirthYear !== null && birthYear < event.minBirthYear) return 'too-old';
  if (event.maxBirthYear !== null && birthYear > event.maxBirthYear) return 'too-young';
  return 'ok';
}

/** True when the sign-up sheet should ask the user to confirm anyway. */
export function needsBirthYearConfirm(
  event: BirthYearWindow,
  birthYear: number | null | undefined,
): boolean {
  const verdict = birthYearEligibility(event, birthYear);
  return verdict === 'too-old' || verdict === 'too-young';
}

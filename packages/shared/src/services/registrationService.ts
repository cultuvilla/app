import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  where,
  collectionGroup,
  limit as fsLimit,
  serverTimestamp,
  type QueryDocumentSnapshot,
} from '../firebase/sdk/firestore';
import { httpsCallable } from '../firebase/sdk/functions';
import { getDb, getFirebaseFunctions } from '../firebase';
import {
  eventRegistrationsCollection,
  eventRegistrationPrivateDoc,
  eventSeatTokensCollection,
  eventRegistrationEventsCollection,
} from '../firebase/refs/client';
import { registrationConverterClient } from '../firebase/converters/registrationConverter.client';
import type {
  RegistrationData,
  RegistrationStatus,
} from '../models/event/RegistrationDataModel';
import {
  tallyRegistrationsByEvent,
  type RegistrationTally,
} from '../models/event/RegistrationRibbonModel';
import type { RegistrationEventData } from '../models/event/RegistrationEventDataModel';
import type { SignupAnswers } from '../models/event/SignupFieldModel';
import { PartialDateSchema, type PartialDate } from '../models/person/PersonDataModel';
import { watchQueryWith, type Unwatch, type WatchError } from './watch';

export interface RegisterInput {
  personId: string;
  name: string;
  /** Collected when the event has `telephoneRequired`. */
  phone?: string;
  /** Answers to the event's custom `signupFields`, keyed by field id. */
  answers?: SignupAnswers;
}

/**
 * The organizer-only half of a registration. Both the phone and the custom
 * answers are PII, so they live in `registrationPrivate/{regId}` rather than on
 * the world-readable registration doc.
 */
export interface RegistrationPrivateData {
  phone: string | null;
  answers: SignupAnswers;
  /**
   * The attendee's birth date, copied from `persons/{personId}` at sign-up. A
   * point-in-time denormalization like the roster's photo/name, but PII, so it
   * lives here rather than on the world-readable registration doc. `null` for a
   * walk-in (no person doc) or a persona that never recorded one.
   */
  birthday: PartialDate | null;
}

export interface RegistrationSummary {
  id: string;
  status: RegistrationStatus;
  position: number;
  isMember: boolean;
}

// Kept for callers that want a quick local prediction (e.g., showing "se irá a
// lista de espera" hints in the sign-up modal). The actual confirmed/waitlisted
// decision is made by the `registerToEvent` Cloud Function in a transaction.
export function determineRegistrationStatus(
  maxAttendees: number | null,
  currentConfirmedCount: number,
): RegistrationStatus {
  if (maxAttendees === null) return 'confirmed';
  return currentConfirmedCount < maxAttendees ? 'confirmed' : 'waitlisted';
}

// Ordered by sign-up moment rather than `position`: `position` is derived from
// the registration count at write time, so a cancellation frees a number that a
// later sign-up reuses, and waitlist promotion never renumbers. `registeredAt`
// is the honest queue order and needs no composite index (single-field sort on
// a subcollection).
export async function getEventRegistrations(
  eventId: string,
): Promise<(RegistrationData & { id: string })[]> {
  const q = query(eventRegistrationsCollection(getDb(), eventId), orderBy('registeredAt', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export type RegistrationEventWithId = RegistrationEventData & { id: string };

/**
 * The event's roster audit log, newest first: who joined, who left, and who
 * removed them. `firestore.rules` limits reads to `isEventOrganizer(eventId)`
 * — the organizer set, the village's admins and app admins — so a plain
 * villager reading the public roster never sees it.
 *
 * Reads only. Entries are written exclusively by the registration callables
 * via the admin SDK; there is no client write path.
 */
export async function getRegistrationEvents(
  eventId: string,
): Promise<RegistrationEventWithId[]> {
  const q = query(eventRegistrationEventsCollection(getDb(), eventId), orderBy('at', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getUserRegistrations(
  eventId: string,
  userId: string,
): Promise<(RegistrationData & { id: string })[]> {
  const q = query(eventRegistrationsCollection(getDb(), eventId), where('userId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Every seat of every group the caller booked on this event — including seats a
 * guest has since claimed, where `userId` is now the guest's. Rules scope the
 * read to `groupOwnerId`, so that filter is load-bearing rather than a
 * convenience: an unfiltered query is rejected.
 */
export async function getGroupRegistrations(
  eventId: string,
  userId: string,
): Promise<(RegistrationData & { id: string })[]> {
  const q = query(eventRegistrationsCollection(getDb(), eventId), where('groupOwnerId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

interface RegisterToEventCallableData {
  eventId: string;
  registrants: RegisterInput[];
  openSeats?: number;
}

/** A held seat nobody has taken yet, plus the secret that lets someone take it. */
export interface OpenSeatSummary {
  registrationId: string;
  token: string;
}

export interface RegisterToEventResult {
  registrations: RegistrationSummary[];
  openSeats: OpenSeatSummary[];
}

/**
 * `openSeats` only applies to an event with `signupGroupSize > 1`, where
 * `registrants.length + openSeats` must equal that size exactly — one group per
 * call. Each open seat comes back with a single-use claim token to share.
 */
export async function registerToEvent(
  eventId: string,
  registrants: RegisterInput[],
  openSeats = 0,
): Promise<RegisterToEventResult> {
  const callable = httpsCallable<RegisterToEventCallableData, RegisterToEventResult>(
    getFirebaseFunctions(),
    'registerToEvent',
  );
  const res = await callable({ eventId, registrants, openSeats });
  return res.data;
}

export interface CancelRegistrationResult {
  /**
   * `delete-group` when the whole group went with it (the group owner or an
   * organizer cancelled); `release-seat` when a guest handed their seat back
   * and it is claimable again; `delete-solo` for an ordinary registration.
   */
  action: 'delete-solo' | 'delete-group' | 'release-seat';
  removedRegistrationIds: string[];
}

/**
 * Cancels a registration. Goes through a callable rather than a direct delete
 * because a group is atomic — see functions/src/events/cancelRegistration.ts.
 * `firestore.rules` denies client deletes on registrations outright.
 */
export async function cancelRegistration(
  eventId: string,
  regId: string,
): Promise<CancelRegistrationResult> {
  const callable = httpsCallable<
    { eventId: string; registrationId: string },
    CancelRegistrationResult
  >(getFirebaseFunctions(), 'cancelRegistration');
  const res = await callable({ eventId, registrationId: regId });
  return res.data;
}

export interface ClaimSeatInput {
  personId: string;
  name: string;
  phone?: string;
  answers?: SignupAnswers;
}

export interface ClaimSeatResult {
  registrationId: string;
  status: RegistrationStatus;
  eventId: string;
}

/** Turns a held open seat into the caller's own registration. */
export async function claimEventSeat(
  eventId: string,
  token: string,
  input: ClaimSeatInput,
): Promise<ClaimSeatResult> {
  const callable = httpsCallable<
    { eventId: string; token: string } & ClaimSeatInput,
    ClaimSeatResult
  >(getFirebaseFunctions(), 'claimEventSeat');
  const res = await callable({ eventId, token, ...input });
  return res.data;
}

/**
 * The caller's own outstanding claim links for an event, so the sign-up sheet
 * can re-offer a link after the app is closed and reopened. Rules scope reads
 * to the token's creator, so the `createdBy` filter is load-bearing, not a
 * convenience — an unfiltered query is rejected outright.
 */
export async function getMySeatTokens(
  eventId: string,
  userId: string,
): Promise<{ token: string; registrationId: string; consumed: boolean }[]> {
  const q = query(eventSeatTokensCollection(getDb(), eventId), where('createdBy', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    token: d.id,
    registrationId: d.data().registrationId,
    consumed: d.data().consumedAt !== null,
  }));
}

// Organizer toggles attendance. updateDoc bypasses the converter, so the
// serverTimestamp() sentinel is fine. Gated by firestore.rules (event organizer).
export async function setRegistrationCheckIn(
  eventId: string,
  regId: string,
  checkedIn: boolean,
): Promise<void> {
  // Converter-less ref: updateDoc on the typed (converter-wrapped) ref rejects
  // the serverTimestamp()/null union. The raw path write is fine here.
  await updateDoc(doc(getDb(), 'events', eventId, 'registrations', regId), {
    checkedInAt: checkedIn ? serverTimestamp() : null,
  });
}

// Organizer marks/unmarks an attendee as paid (events with requiresPayment).
// updateDoc bypasses the converter, so the serverTimestamp()/null union is fine
// on the raw path ref. Gated by firestore.rules: any write touching paidAt
// requires the event organizer.
export async function setRegistrationPaid(
  eventId: string,
  regId: string,
  paid: boolean,
): Promise<void> {
  await updateDoc(doc(getDb(), 'events', eventId, 'registrations', regId), {
    paidAt: paid ? serverTimestamp() : null,
  });
}

interface AddWalkInCallableData {
  eventId: string;
  name: string;
  phone?: string;
  answers?: SignupAnswers;
}
interface AddWalkInCallableResult {
  registration: RegistrationSummary;
}

// Organizer adds an attendee who isn't a registered user (walk-in). Goes
// through a callable so the same capacity/waitlist logic and counter updates
// apply; the registration carries an empty userId/personId.
export async function addWalkInRegistration(
  eventId: string,
  name: string,
  phone?: string,
  answers?: SignupAnswers,
): Promise<RegistrationSummary> {
  const callable = httpsCallable<AddWalkInCallableData, AddWalkInCallableResult>(
    getFirebaseFunctions(),
    'addWalkInRegistration',
  );
  const res = await callable({ eventId, name, phone, answers });
  return res.data.registration;
}

// Organizer-only read of a registrant's private data (phone, custom answers,
// birth date). Returns null when the registration carried none of them — the
// doc is only written when there is something to put in it.
export async function getRegistrationPrivate(
  eventId: string,
  regId: string,
): Promise<RegistrationPrivateData | null> {
  const snap = await getDoc(eventRegistrationPrivateDoc(getDb(), eventId, regId));
  if (!snap.exists()) return null;
  const data = snap.data() as {
    phone?: string | null;
    answers?: SignupAnswers;
    birthday?: unknown;
  };
  // No converter on this collection (the answer map is shaped by the event's
  // field specs, not a fixed model), so the one sub-object with a real shape is
  // parsed here rather than trusted.
  const birthday = PartialDateSchema.safeParse(data.birthday);
  return {
    phone: data.phone ?? null,
    answers: data.answers ?? {},
    birthday: birthday.success ? birthday.data : null,
  };
}

/**
 * `max` caps how far back the query reads. Registrations accumulate for the
 * life of the account while every surface that consumes them only cares about
 * upcoming events, so an unbounded read grows the bill for data nothing
 * renders. Omit it to read the whole history.
 */
export type UserRegistration = RegistrationData & { id: string; eventPath: string };

function userRegistrationsQuery(userId: string, max?: number) {
  // collectionGroup doesn't carry the per-collection converter from the ref
  // factory, so we attach it explicitly here.
  const cg = collectionGroup(getDb(), 'registrations').withConverter(registrationConverterClient);
  return query(
    cg,
    where('userId', '==', userId),
    orderBy('registeredAt', 'desc'),
    ...(max != null ? [fsLimit(max)] : []),
  );
}

function userRegistrationRow(d: QueryDocumentSnapshot<RegistrationData>): UserRegistration {
  const eventPath = d.ref.path.split('/').slice(0, 2).join('/');
  return { id: d.id, ...d.data(), eventPath };
}

export async function getUserRegistrationsAcrossEvents(
  userId: string,
  max?: number,
): Promise<UserRegistration[]> {
  const snap = await getDocs(userRegistrationsQuery(userId, max));
  return snap.docs.map(userRegistrationRow);
}

export function watchUserRegistrationsAcrossEvents(
  userId: string,
  onNext: (registrations: UserRegistration[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQueryWith(
    userRegistrationsQuery(userId),
    (docs) => docs.map(userRegistrationRow),
    onNext,
    onError,
  );
}

/**
 * How many of the user's registrations sit in each status, per event — the one
 * read behind the "apuntado" ribbon on feed cards.
 *
 * Deliberately a single collection-group query for the whole feed rather than
 * a per-card lookup: the caller holds the result for the session and does a
 * synchronous map lookup per card.
 */
export async function getUserRegistrationTallies(
  userId: string,
  max = 100,
): Promise<Map<string, RegistrationTally>> {
  const rows = await getUserRegistrationsAcrossEvents(userId, max);
  return tallyRegistrationsByEvent(
    rows.map((r) => ({ eventId: r.eventPath.split('/')[1] ?? '', status: r.status })),
  );
}

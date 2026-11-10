// packages/shared/src/services/cosatecaService.ts
import { deleteDoc, doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from '../firebase/sdk/firestore';
import { httpsCallable } from '../firebase/sdk/functions';
import { getDb, getFirebaseFunctions } from '../firebase';
import {
  cosaDoc,
  cosaRequestChatCollection,
  cosaRequestChatWriteCollection,
  cosaRequestDoc,
  cosaRequestsCollection,
  cosasCollection,
  cosaSlotsCollection,
  cosatecaWriteDoc,
} from '../firebase/refs/client';
import {
  buildCosaData,
  CosaDataSchema,
  CosaEditSchema,
  type CosaData,
  type CosaEdit,
  type CosaInput,
  type CosaSlotData,
} from '../models/organization/CosaDataModel';
import {
  buildCosaRequestData,
  CosaRequestDataSchema,
  type CosaRequestData,
  type CosaRequestInput,
  type CosaRequestStatus,
} from '../models/organization/CosaRequestDataModel';
import type { CosaRequestAction } from '../models/organization/cosatecaLogic';
import { isAwaitingAnswer } from '../models/organization/reservaLogic';
import { GroupChatBodySchema, type GroupChatMessageData } from '../models/organization/GroupChatDataModel';
import { forbiddenAsEmpty, watchDoc, watchMerged, watchQuery, type Unwatch, type WatchError } from './watch';

export type Cosa = CosaData & { id: string };
export type CosaRequest = CosaRequestData & { id: string };
export type CosaRequestChatMessage = GroupChatMessageData & { id: string };
/** A taken slot of a reserva; `id` is its start as an ISO instant. */
export type CosaSlot = CosaSlotData & { id: string };

// =============================================================================
// COSAS
// =============================================================================

/** A group's cosateca, for its integrantes. */
export function watchGroupCosas(orgId: string, onNext: (rows: Cosa[]) => void, onError: WatchError): Unwatch {
  return watchQuery(query(cosasCollection(getDb()), where('orgId', '==', orgId)), onNext, onError);
}

/** Every cosa of the village's cosatecas open to the pueblo — for any village member. */
export function watchVillageCosas(municipalityId: string, onNext: (rows: Cosa[]) => void, onError: WatchError): Unwatch {
  return watchQuery(
    query(cosasCollection(getDb()), where('municipalityId', '==', municipalityId), where('audience', '==', 'pueblo')),
    onNext,
    onError,
  );
}

/** One cosa — its own screen. */
export function watchCosa(cosaId: string, onNext: (cosa: Cosa | null) => void, onError: WatchError): Unwatch {
  return watchDoc(cosaDoc(getDb(), cosaId), onNext, onError);
}

/**
 * An integrante offers something (`ownerUid` their uid), or an admin offers it
 * for the group (`ownerUid` null, `ownerName` the group's name). `audience` is
 * the group's effective one (`effectiveCosaAudience`): the rules refuse any
 * other, and `ownerName` must be the owner's public name. Returns the new id.
 */
export async function createCosa(input: Omit<CosaInput, 'createdAt'>): Promise<string> {
  const data = CosaDataSchema.parse(buildCosaData(input));
  const id = doc(cosasCollection(getDb())).id;
  await setDoc(cosatecaWriteDoc(getDb(), 'cosas', id), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return id;
}

/** Its manager (the owner, or an admin of the group): change what it is, or pause it. */
export async function updateCosa(cosaId: string, edit: CosaEdit): Promise<void> {
  const data = CosaEditSchema.parse({
    ...edit,
    title: edit.title.trim(),
    description: edit.description?.trim() ? edit.description.trim() : null,
    conditions: edit.conditions?.trim() ? edit.conditions.trim() : null,
  });
  await updateDoc(cosatecaWriteDoc(getDb(), 'cosas', cosaId), { ...data, updatedAt: serverTimestamp() });
}

/** Its manager, or an admin of the group. Its requests stay, as the record. */
export async function deleteCosa(cosaId: string): Promise<void> {
  await deleteDoc(cosatecaWriteDoc(getDb(), 'cosas', cosaId));
}

// =============================================================================
// REQUESTS
// =============================================================================

/**
 * Ask for a cosa. The copied fields (`orgId`, `cosaTitle`, `cosaKind`,
 * `ownerUid`, `municipalityId`) must match the cosa, and `requesterName` must be
 * the requester's public name; the rules check both. Returns the new id.
 */
export async function requestCosa(input: Omit<CosaRequestInput, 'createdAt'>): Promise<string> {
  const data = CosaRequestDataSchema.parse(buildCosaRequestData(input));
  const id = doc(cosaRequestsCollection(getDb())).id;
  await setDoc(cosatecaWriteDoc(getDb(), 'cosaRequests', id), { ...data, createdAt: serverTimestamp() });
  return id;
}

/** One request — its own screen. */
export function watchCosaRequest(requestId: string, onNext: (req: CosaRequest | null) => void, onError: WatchError): Unwatch {
  return watchDoc(cosaRequestDoc(getDb(), requestId), onNext, onError);
}

/** What I have asked for, newest first. */
export function watchMyCosaRequests(uid: string, onNext: (rows: CosaRequest[]) => void, onError: WatchError): Unwatch {
  return watchQuery(
    query(cosaRequestsCollection(getDb()), where('requesterUid', '==', uid), orderBy('createdAt', 'desc')),
    onNext,
    onError,
  );
}

/** What others have asked of my own cosas, newest first. */
export function watchCosaRequestsToMe(uid: string, onNext: (rows: CosaRequest[]) => void, onError: WatchError): Unwatch {
  return watchQuery(
    query(cosaRequestsCollection(getDb()), where('ownerUid', '==', uid), orderBy('createdAt', 'desc')),
    onNext,
    onError,
  );
}

/** Admins: every request of the group, newest first — the group's cosas and the backstop for the rest. */
export function watchGroupCosaRequests(orgId: string, onNext: (rows: CosaRequest[]) => void, onError: WatchError): Unwatch {
  return watchQuery(
    query(cosaRequestsCollection(getDb()), where('orgId', '==', orgId), orderBy('createdAt', 'desc')),
    onNext,
    onError,
  );
}

function newestFirst(rows: CosaRequest[]): CosaRequest[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return [...byId.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * The Buzón's *Necesita tu acción*: the requests still waiting for this user's
 * answer — for their own cosas, and for the group's own cosas of every group
 * they administer — newest first. A group whose admin rights have just gone
 * answers empty rather than blanking the rest. A booking whose slot has started
 * is past answering and left out, until the hourly run declines it.
 */
export function watchCosaRequestsToAnswer(
  uid: string,
  adminOrgIds: readonly string[],
  onNext: (rows: CosaRequest[]) => void,
  onError: WatchError,
): Unwatch {
  const db = getDb();
  const mine = (next: (rows: CosaRequest[]) => void, error: WatchError) =>
    watchQuery(query(cosaRequestsCollection(db), where('ownerUid', '==', uid), where('status', '==', 'pending')), next, error);
  const groups = adminOrgIds.map((orgId) =>
    forbiddenAsEmpty<CosaRequest>('cosateca:watchCosaRequestsToAnswer', (next, error) =>
      watchQuery(
        query(
          cosaRequestsCollection(db),
          where('orgId', '==', orgId),
          where('ownerUid', '==', null),
          where('status', '==', 'pending'),
        ),
        next,
        error,
      ),
    ),
  );
  return watchMerged([mine, ...groups], (rows) => newestFirst(rows).filter((r) => isAwaitingAnswer(r, new Date())), onNext, onError);
}

/** What I asked for that has no answer yet — the Buzón's "esperando" rows. */
export async function getMyPendingCosaRequests(uid: string): Promise<CosaRequest[]> {
  const snap = await getDocs(
    query(cosaRequestsCollection(getDb()), where('requesterUid', '==', uid), where('status', '==', 'pending')),
  );
  const now = new Date();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => isAwaitingAnswer(r, now));
}

/**
 * Accept, decline, cancel, lend, return, mark done or give, through the
 * `respondToCosaRequest` callable: it holds the transition table, refuses an
 * overlapping loan and keeps the cosa's `heldBy`.
 */
export async function respondToCosaRequest(requestId: string, action: CosaRequestAction): Promise<CosaRequestStatus> {
  const fn = httpsCallable<{ requestId: string; action: CosaRequestAction }, { status: CosaRequestStatus }>(
    getFirebaseFunctions(),
    'respondToCosaRequest',
  );
  return (await fn({ requestId, action })).data.status;
}

// =============================================================================
// RESERVAS — the pádel court, booked by time slot
// =============================================================================

/**
 * A reserva's taken slots starting in [from, to): what the grid greys out.
 * Names no one; who booked is on the booking, which only its parties read.
 */
export function watchCosaSlots(
  cosaId: string,
  from: Date,
  to: Date,
  onNext: (rows: CosaSlot[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(
    query(cosaSlotsCollection(getDb(), cosaId), where('startAt', '>=', from), where('startAt', '<', to)),
    onNext,
    onError,
  );
}

/**
 * Book a slot (`startAt`, a slot of the cosa's grid) through the
 * `bookReservaSlot` callable: it claims the slot's lock in a transaction, holds
 * the per-person cap and the horizon, and books it as accepted, or pending when
 * the cosa asks for approval. Returns the booking's id and status.
 */
export async function bookReservaSlot(
  cosaId: string,
  startAt: Date,
  message: string | null = null,
): Promise<{ requestId: string; status: CosaRequestStatus }> {
  const fn = httpsCallable<
    { cosaId: string; startAt: string; message: string | null },
    { requestId: string; status: CosaRequestStatus }
  >(getFirebaseFunctions(), 'bookReservaSlot');
  return (await fn({ cosaId, startAt: startAt.toISOString(), message: message?.trim() ? message.trim() : null })).data;
}

/**
 * Its manager closes days (`YYYY-MM-DD`) through the `setReservaBlackouts`
 * callable, which cancels the bookings on newly closed days and tells their
 * bookers. Returns how many it cancelled.
 */
export async function setReservaBlackouts(cosaId: string, blackouts: string[]): Promise<{ cancelled: number }> {
  const fn = httpsCallable<{ cosaId: string; blackouts: string[] }, { cancelled: number }>(
    getFirebaseFunctions(),
    'setReservaBlackouts',
  );
  return (await fn({ cosaId, blackouts })).data;
}

// =============================================================================
// A REQUEST'S CHAT — the handover, arranged without sharing a phone
// =============================================================================

/**
 * A request's latest `count` messages (start at GROUP_CHAT_PAGE_SIZE), newest
 * first. Its parties read it: the requester, the cosa's owner, the group's admins.
 */
export function watchCosaRequestChat(
  requestId: string,
  count: number,
  onNext: (rows: CosaRequestChatMessage[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(
    query(cosaRequestChatCollection(getDb(), requestId), orderBy('createdAt', 'desc'), limit(count)),
    onNext,
    onError,
  );
}

/**
 * Write in a request's chat. Throws on an empty or over-long body before
 * writing; `authorName` must be the author's public name. Returns the new id.
 */
export async function sendCosaRequestChatMessage(input: {
  requestId: string;
  uid: string;
  authorName: string;
  body: string;
}): Promise<string> {
  const body = GroupChatBodySchema.parse(input.body);
  const ref = doc(cosaRequestChatWriteCollection(getDb(), input.requestId));
  await setDoc(ref, { authorUid: input.uid, authorName: input.authorName, body, createdAt: serverTimestamp() });
  return ref.id;
}

/** The author removes their own message; the group's admins (and the village's and the app's) anyone's. */
export async function deleteCosaRequestChatMessage(requestId: string, chatId: string): Promise<void> {
  await deleteDoc(doc(cosaRequestChatWriteCollection(getDb(), requestId), chatId));
}

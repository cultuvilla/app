// packages/shared/src/firebase/refs/client.ts
//
// The client SDK's typed refs. Every collection is declared once in
// ./collections.ts; this file binds those entries to the client SDK (through
// the ../sdk/firestore seam) under the names the services import.
// Type-only and erased at runtime: gives declaration emit a portable name for
// the JS SDK types these refs return (TS2742 through the ../sdk re-export).
import type {} from 'firebase/firestore';
import {
  collection,
  collectionGroup,
  doc,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
  type FirestoreDataConverter,
  type Query,
} from '../sdk/firestore';
import { clientConverter } from '../converters/sdkAdapters.client';
import { censoAnswersId } from '../../models/municipality/CensoAnswersDataModel';
import { municipalityPersonDirectoryId } from '../../models/municipality/MunicipalityPersonDataModel';
import { NOTIFICATION_SETTINGS_DOC_ID } from '../../models/notification/NotificationSettingsDataModel';
import { PRIVACY_SETTINGS_DOC_ID } from '../../models/user/PrivacySettingsDataModel';
import { isGeneralChatThread } from '../../models/organization/GroupChatDataModel';
import {
  COLLECTIONS as C,
  collectionId,
  collectionSegments,
  type CollectionDef,
  type ModelOf,
  type PathParams,
  type TypedCollectionDef,
} from './collections';

// ── Binder ────────────────────────────────────────────────────────────────
// Server-only entries are rejected at compile time: their type is not a
// ClientDef.

type ClientDef = CollectionDef<string, CollectionDef['schema'], false>;
type DbModel = Record<string, unknown>;

function converterOf<D extends TypedCollectionDef<false>>(def: D) {
  return clientConverter(def.schema) as unknown as FirestoreDataConverter<ModelOf<D>, DbModel>;
}

function typedCollection<D extends TypedCollectionDef<false>>(
  db: Firestore,
  def: D,
  ...ids: PathParams<D['path']>
): CollectionReference<ModelOf<D>, DbModel> {
  const [first, ...rest] = collectionSegments(def.path, ids);
  return collection(db, first, ...rest).withConverter(converterOf(def));
}

function typedDoc<D extends TypedCollectionDef<false>>(
  db: Firestore,
  def: D,
  ...ids: [...PathParams<D['path']>, string]
): DocumentReference<ModelOf<D>, DbModel> {
  const docId = ids[ids.length - 1];
  const [first, ...rest] = collectionSegments(def.path, ids.slice(0, -1));
  return doc(db, first, ...rest, docId).withConverter(converterOf(def));
}

function typedGroup<D extends TypedCollectionDef<false>>(db: Firestore, def: D): Query<ModelOf<D>, DbModel> {
  return collectionGroup(db, collectionId(def.path)).withConverter(converterOf(def));
}

/**
 * Unconverted, for writes that stamp `serverTimestamp()`: rules compare it with
 * `request.time`, and the strict converter refuses the sentinel. The service
 * validates each payload with its schema first.
 */
function rawCollection<D extends ClientDef>(db: Firestore, def: D, ...ids: PathParams<D['path']>) {
  const [first, ...rest] = collectionSegments(def.path, ids);
  return collection(db, first, ...rest);
}

function rawDoc<D extends ClientDef>(db: Firestore, def: D, ...ids: [...PathParams<D['path']>, string]) {
  const docId = ids[ids.length - 1];
  const [first, ...rest] = collectionSegments(def.path, ids.slice(0, -1));
  return doc(db, first, ...rest, docId);
}

// ── Events ────────────────────────────────────────────────────────────────

export const eventsCollection = (db: Firestore) => typedCollection(db, C.events);

export const eventDoc = (db: Firestore, eventId: string) => typedDoc(db, C.events, eventId);

export const eventRegistrationsCollection = (db: Firestore, eventId: string) =>
  typedCollection(db, C.eventRegistrations, eventId);

export const eventRegistrationDoc = (db: Firestore, eventId: string, registrationId: string) =>
  typedDoc(db, C.eventRegistrations, eventId, registrationId);

// Organizer-only private data for one registration: the phone (when the event
// sets telephoneRequired) plus the answers to the event's custom signupFields.
// Both are PII the public registration doc must never carry. No converter: the
// answer map is shaped by the event's field specs, not by a fixed model. The
// factory exists so call sites stay off raw `doc(getDb(), …)`.
export const eventRegistrationPrivateDoc = (db: Firestore, eventId: string, registrationId: string) =>
  rawDoc(db, C.eventRegistrationPrivate, eventId, registrationId);

// Claim tokens for the event's open group seats. THE DOCUMENT ID IS THE SECRET
// — see SeatTokenModel. Rules limit reads to the group owner and the event's
// organizers, so the group owner can re-read their own tokens to re-share a
// link; writes are callable-only.
export const eventSeatTokensCollection = (db: Firestore, eventId: string) =>
  typedCollection(db, C.eventSeatTokens, eventId);

export const eventSeatTokenDoc = (db: Firestore, eventId: string, token: string) =>
  typedDoc(db, C.eventSeatTokens, eventId, token);

// Append-only audit log of the event's roster changes — see
// RegistrationEventDataModel. Readable by `isEventOrganizer(eventId)` only
// (organizers, village admins, app admins); every client write is denied.
export const eventRegistrationEventsCollection = (db: Firestore, eventId: string) =>
  typedCollection(db, C.eventRegistrationEvents, eventId);

// ── Municipality domain ────────────────────────────────────────────────────

export const municipalitiesCollection = (db: Firestore) => typedCollection(db, C.municipalities);

export const municipalityDoc = (db: Firestore, municipalityId: string) =>
  typedDoc(db, C.municipalities, municipalityId);

export const municipalityBarriosCollection = (db: Firestore, municipalityId: string) =>
  typedCollection(db, C.municipalityBarrios, municipalityId);

export const municipalityBarrioDoc = (db: Firestore, municipalityId: string, barrioId: string) =>
  typedDoc(db, C.municipalityBarrios, municipalityId, barrioId);

export const municipalityPlacesCollection = (db: Firestore, municipalityId: string) =>
  typedCollection(db, C.municipalityPlaces, municipalityId);

export const municipalityPlaceDoc = (db: Firestore, municipalityId: string, placeId: string) =>
  typedDoc(db, C.municipalityPlaces, municipalityId, placeId);

export const municipalityMembersCollection = (db: Firestore, municipalityId: string) =>
  typedCollection(db, C.municipalityMembers, municipalityId);

export const censoAnswersCollection = (db: Firestore) => typedCollection(db, C.censoAnswers);

export const censoAnswersDoc = (db: Firestore, municipalityId: string, userId: string) =>
  typedDoc(db, C.censoAnswers, censoAnswersId(municipalityId, userId));

export const municipalityMemberDoc = (db: Firestore, municipalityId: string, memberId: string) =>
  typedDoc(db, C.municipalityMembers, municipalityId, memberId);

export const municipalityPeopleCollection = (db: Firestore) => typedCollection(db, C.municipalityPeople);

export const municipalityPersonDoc = (db: Firestore, municipalityId: string, personId: string) =>
  typedDoc(db, C.municipalityPeople, municipalityPersonDirectoryId(municipalityId, personId));

// ── Organization domain ──────────────────────────────────────────────────

export const organizationsCollection = (db: Firestore) => typedCollection(db, C.organizations);

export const organizationDoc = (db: Firestore, organizationId: string) =>
  typedDoc(db, C.organizations, organizationId);

export const organizationMembersCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationMembers, organizationId);

export const organizationMemberDoc = (db: Firestore, organizationId: string, memberId: string) =>
  typedDoc(db, C.organizationMembers, organizationId, memberId);

// The socio roster and its admin-only contact half (see SocioDataModel).
export const organizationSociosCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationSocios, organizationId);

export const organizationSocioDoc = (db: Firestore, organizationId: string, socioId: string) =>
  typedDoc(db, C.organizationSocios, organizationId, socioId);

export const organizationSocioPrivateCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationSocioPrivate, organizationId);

export const organizationSocioPrivateDoc = (db: Firestore, organizationId: string, socioId: string) =>
  typedDoc(db, C.organizationSocioPrivate, organizationId, socioId);

export const organizationSocioPersonaLockDoc = (db: Firestore, organizationId: string, personId: string) =>
  typedDoc(db, C.organizationSocioPersonaLocks, organizationId, personId);

// The cuota de socios (see CuotaDataModel): settings, per-socio assignment,
// the append-only payment ledger, and the reminders the job sent.
export const organizationCuotaSettingsDoc = (db: Firestore, organizationId: string) =>
  typedDoc(db, C.organizationCuotaSettings, organizationId, 'current');

export const organizationCuotaAssignmentsCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationCuotaAssignments, organizationId);

export const organizationCuotaAssignmentDoc = (db: Firestore, organizationId: string, socioId: string) =>
  typedDoc(db, C.organizationCuotaAssignments, organizationId, socioId);

export const organizationCuotaPaymentsCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationCuotaPayments, organizationId);

export const organizationCuotaRemindersCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationCuotaReminders, organizationId);

const CUOTA_WRITE = {
  cuotaSettings: C.organizationCuotaSettings,
  cuotaAssignments: C.organizationCuotaAssignments,
  cuotaPayments: C.organizationCuotaPayments,
} as const;

/** Unconverted, for cuota writes only — see `rawDoc`. */
export const organizationCuotaWriteDoc = (
  db: Firestore,
  organizationId: string,
  collectionName: keyof typeof CUOTA_WRITE,
  id: string,
) => rawDoc(db, CUOTA_WRITE[collectionName], organizationId, id);

// The cosateca (see CosaDataModel, CosaRequestDataModel).
export const cosasCollection = (db: Firestore) => typedCollection(db, C.cosas);
export const cosaDoc = (db: Firestore, cosaId: string) => typedDoc(db, C.cosas, cosaId);
export const cosaSlotsCollection = (db: Firestore, cosaId: string) => typedCollection(db, C.cosaSlots, cosaId);
export const cosaRequestsCollection = (db: Firestore) => typedCollection(db, C.cosaRequests);
export const cosaRequestDoc = (db: Firestore, requestId: string) => typedDoc(db, C.cosaRequests, requestId);

const COSATECA_WRITE = { cosas: C.cosas, cosaRequests: C.cosaRequests } as const;

/** Unconverted, for cosa and request creates and cosa edits — see `rawDoc`. */
export const cosatecaWriteDoc = (db: Firestore, collectionName: keyof typeof COSATECA_WRITE, id: string) =>
  rawDoc(db, COSATECA_WRITE[collectionName], id);
export const cosaRequestChatCollection = (db: Firestore, requestId: string) =>
  typedCollection(db, C.cosaRequestChat, requestId);
/** Unconverted, for the client's writes — see `rawDoc`. */
export const cosaRequestChatWriteCollection = (db: Firestore, requestId: string) =>
  rawCollection(db, C.cosaRequestChat, requestId);

// Group tasks, shifts and checklist templates (see GroupTaskDataModel).
export const organizationTasksCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationTasks, organizationId);

export const organizationTaskDoc = (db: Firestore, organizationId: string, taskId: string) =>
  typedDoc(db, C.organizationTasks, organizationId, taskId);

export const organizationTaskTemplatesCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationTaskTemplates, organizationId);

const TASK_WRITE = { tasks: C.organizationTasks, taskTemplates: C.organizationTaskTemplates } as const;

/** Unconverted, for task and template writes only — see `rawDoc`. */
export const organizationTaskWriteDoc = (
  db: Firestore,
  organizationId: string,
  collectionName: keyof typeof TASK_WRITE,
  id: string,
) => rawDoc(db, TASK_WRITE[collectionName], organizationId, id);

// A group's messages (see GroupMessageDataModel) and their per-recipient halves.
export const organizationMessagesCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationMessages, organizationId);

export const organizationMessageDoc = (db: Firestore, organizationId: string, messageId: string) =>
  typedDoc(db, C.organizationMessages, organizationId, messageId);

export const organizationMessageDeliveriesCollection = (db: Firestore, organizationId: string, messageId: string) =>
  typedCollection(db, C.organizationMessageDeliveries, organizationId, messageId);

export const organizationMessageReadsCollection = (db: Firestore, organizationId: string, messageId: string) =>
  typedCollection(db, C.organizationMessageReads, organizationId, messageId);

export const organizationMessageReadDoc = (db: Firestore, organizationId: string, messageId: string, uid: string) =>
  typedDoc(db, C.organizationMessageReads, organizationId, messageId, uid);

export const organizationMessageVotesCollection = (db: Firestore, organizationId: string, messageId: string) =>
  typedCollection(db, C.organizationMessageVotes, organizationId, messageId);

export const organizationMessageVoteDoc = (db: Firestore, organizationId: string, messageId: string, uid: string) =>
  typedDoc(db, C.organizationMessageVotes, organizationId, messageId, uid);

const MESSAGE_WRITE = {
  reads: C.organizationMessageReads,
  votes: C.organizationMessageVotes,
  deliveries: C.organizationMessageDeliveries,
} as const;

/** Unconverted, for the message writes a client makes (a read, a vote, a WhatsApp tick) — see `rawDoc`. */
export const organizationMessageWriteDoc = (
  db: Firestore,
  organizationId: string,
  messageId: string,
  sub: keyof typeof MESSAGE_WRITE,
  id: string,
) => rawDoc(db, MESSAGE_WRITE[sub], organizationId, messageId, id);

// A group's chat (see GroupChatDataModel): the general thread at
// organizations/{orgId}/chat, an aviso's under its message.
export const organizationChatCollection = (db: Firestore, organizationId: string, threadId: string) =>
  isGeneralChatThread(threadId)
    ? typedCollection(db, C.organizationGeneralChat, organizationId)
    : typedCollection(db, C.organizationAvisoChat, organizationId, threadId);

/** Unconverted, for the client's writes — see `rawDoc`. */
export const organizationChatWriteCollection = (db: Firestore, organizationId: string, threadId: string) =>
  isGeneralChatThread(threadId)
    ? rawCollection(db, C.organizationGeneralChat, organizationId)
    : rawCollection(db, C.organizationAvisoChat, organizationId, threadId);

export const organizationChatWriteDoc = (db: Firestore, organizationId: string, threadId: string, chatId: string) =>
  isGeneralChatThread(threadId)
    ? rawDoc(db, C.organizationGeneralChat, organizationId, chatId)
    : rawDoc(db, C.organizationAvisoChat, organizationId, threadId, chatId);

export const organizationChatThreadDoc = (db: Firestore, organizationId: string, threadId: string) =>
  typedDoc(db, C.organizationChatThreads, organizationId, threadId);

export const organizationChatReadDoc = (db: Firestore, organizationId: string, threadId: string, uid: string) =>
  typedDoc(db, C.organizationChatReads, organizationId, threadId, uid);

export const organizationChatReadWriteDoc = (db: Firestore, organizationId: string, threadId: string, uid: string) =>
  rawDoc(db, C.organizationChatReads, organizationId, threadId, uid);

// A task's comments share the chat's message shape (see GroupChatDataModel).
export const organizationTaskCommentsCollection = (db: Firestore, organizationId: string, taskId: string) =>
  typedCollection(db, C.organizationTaskComments, organizationId, taskId);

/** Unconverted, for the client's writes — see `rawDoc`. */
export const organizationTaskCommentsWriteCollection = (db: Firestore, organizationId: string, taskId: string) =>
  rawCollection(db, C.organizationTaskComments, organizationId, taskId);

// The group's records (see RecordsDataModel): actas and the income/expense ledger.
export const organizationActasCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationActas, organizationId);

export const organizationLedgerEntriesCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationLedgerEntries, organizationId);

const RECORDS_WRITE = { actas: C.organizationActas, ledgerEntries: C.organizationLedgerEntries } as const;

/** Unconverted, for records writes only — see `rawDoc`. */
export const organizationRecordsWriteDoc = (
  db: Firestore,
  organizationId: string,
  collectionName: keyof typeof RECORDS_WRITE,
  id: string,
) => rawDoc(db, RECORDS_WRITE[collectionName], organizationId, id);

export const organizationJoinRequestsCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationJoinRequests, organizationId);

export const organizationJoinRequestDoc = (db: Firestore, organizationId: string, userId: string) =>
  typedDoc(db, C.organizationJoinRequests, organizationId, userId);

export const joinRequestsGroup = (db: Firestore) => typedGroup(db, C.organizationJoinRequests);

// ── Organizer requests ───────────────────────────────────────────────────

export const organizerRequestsCollection = (db: Firestore) => typedCollection(db, C.organizerRequests);

export const organizerRequestDoc = (db: Firestore, requestId: string) => typedDoc(db, C.organizerRequests, requestId);

// ── Person domain ────────────────────────────────────────────────────────

export const personsCollection = (db: Firestore) => typedCollection(db, C.persons);

export const personDoc = (db: Firestore, personId: string) => typedDoc(db, C.persons, personId);

// ── User + notifications domain ──────────────────────────────────────────

export const usersCollection = (db: Firestore) => typedCollection(db, C.users);

export const userDoc = (db: Firestore, userId: string) => typedDoc(db, C.users, userId);

export const publicProfileDoc = (db: Firestore, userId: string) => typedDoc(db, C.publicProfiles, userId);

export const userNotificationsCollection = (db: Firestore, userId: string) =>
  typedCollection(db, C.userNotifications, userId);

export const userNotificationDoc = (db: Firestore, userId: string, notificationId: string) =>
  typedDoc(db, C.userNotifications, userId, notificationId);

// Push-capable devices. THE DOCUMENT ID IS THE FCM REGISTRATION TOKEN — see
// DeviceTokenDataModel: that is what makes re-registering on every launch
// idempotent instead of accumulating a row per session.
export const userDevicesCollection = (db: Firestore, userId: string) => typedCollection(db, C.userDevices, userId);

export const userDeviceDoc = (db: Firestore, userId: string, token: string) =>
  typedDoc(db, C.userDevices, userId, token);

// Optional: absent means DEFAULT_NOTIFICATION_PREFS. Fixed doc id so there is
// exactly one preferences document per account.
export const NOTIFICATION_PREFS_DOC_ID = 'notifications';

// Optional, one per group: absent means the group's messages push.
export const userGroupPrefsDoc = (db: Firestore, userId: string, organizationId: string) =>
  typedDoc(db, C.userGroupPrefs, userId, organizationId);

export const userNotificationPrefsDoc = (db: Firestore, userId: string) =>
  typedDoc(db, C.userPreferences, userId, NOTIFICATION_PREFS_DOC_ID);

// Optional: absent means every topic pushes. Supersedes `preferences/notifications`.
export const userNotificationSettingsDoc = (db: Firestore, userId: string) =>
  typedDoc(db, C.userNotificationSettings, userId, NOTIFICATION_SETTINGS_DOC_ID);

// Optional: absent means the account was never asked about usage analytics.
export const userPrivacySettingsDoc = (db: Firestore, userId: string) =>
  typedDoc(db, C.userPrivacySettings, userId, PRIVACY_SETTINGS_DOC_ID);

// ── News domain (top-level collections) ──────────────────────────────────

export const newsCollection = (db: Firestore) => typedCollection(db, C.news);

export const newsDoc = (db: Firestore, postId: string) => typedDoc(db, C.news, postId);

// ── Comments (generic, entity-scoped, top-level) ────────────────────────

export const commentsCollection = (db: Firestore) => typedCollection(db, C.comments);

export const commentDoc = (db: Firestore, commentId: string) => typedDoc(db, C.comments, commentId);

export const festivalPostersCollection = (db: Firestore) => typedCollection(db, C.festivalPosters);

export const festivalPosterDoc = (db: Firestore, posterId: string) => typedDoc(db, C.festivalPosters, posterId);

// ── Occupation domain (top-level collections) ────────────────────────────

export const occupationsCollection = (db: Firestore) => typedCollection(db, C.occupations);

export const occupationDoc = (db: Firestore, occupationId: string) => typedDoc(db, C.occupations, occupationId);

// ── Membership audit log ─────────────────────────────────────────────────
// Append-only, top-level, scoped by `municipalityId`. Function-owned: clients
// only read (firestore.rules denies all client writes).

export const membershipEventsCollection = (db: Firestore) => typedCollection(db, C.membershipEvents);

export const membershipEventDoc = (db: Firestore, id: string) => typedDoc(db, C.membershipEvents, id);

// ── Admin domain ─────────────────────────────────────────────────────────

export const adminsCollection = (db: Firestore) => typedCollection(db, C.admins);

export const adminDoc = (db: Firestore, userId: string) => typedDoc(db, C.admins, userId);

// ── UGC safety: reports + per-user block lists ───────────────────────────

export const contentReportsCollection = (db: Firestore) => typedCollection(db, C.contentReports);

export const contentReportDoc = (db: Firestore, reportId: string) => typedDoc(db, C.contentReports, reportId);

export const userBlockedUsersCollection = (db: Firestore, userId: string) =>
  typedCollection(db, C.userBlockedUsers, userId);

export const userBlockedUserDoc = (db: Firestore, userId: string, blockedUserId: string) =>
  typedDoc(db, C.userBlockedUsers, userId, blockedUserId);

// ── Vocabulary domain (top-level collections) ────────────────────────────
// The term id is derived from `municipalityId` + slug (see `vocabularyTermId`),
// never minted — that is what makes two villagers adding the same word land on
// one shared doc instead of two.

export const vocabularyTermsCollection = (db: Firestore) => typedCollection(db, C.vocabularyTerms);

export const vocabularyTermDoc = (db: Firestore, termId: string) => typedDoc(db, C.vocabularyTerms, termId);

export const vocabularyDefinitionsCollection = (db: Firestore) => typedCollection(db, C.vocabularyDefinitions);

export const vocabularyDefinitionDoc = (db: Firestore, definitionId: string) =>
  typedDoc(db, C.vocabularyDefinitions, definitionId);

// ── Village history (top-level collection) ───────────────────────────────

export const historyEntriesCollection = (db: Firestore) => typedCollection(db, C.historyEntries);

export const historyEntryDoc = (db: Firestore, entryId: string) => typedDoc(db, C.historyEntries, entryId);

/** The shared word index — one doc per word across every village. Function-owned. */
export const vocabularyWordsCollection = (db: Firestore) => typedCollection(db, C.vocabularyWords);

export const vocabularyWordDoc = (db: Firestore, slug: string) => typedDoc(db, C.vocabularyWords, slug);

export const villageWrappedCollection = (db: Firestore) => typedCollection(db, C.villageWrapped);

export const villageWrappedDoc = (db: Firestore, wrappedId: string) => typedDoc(db, C.villageWrapped, wrappedId);

/** The nightly "most to show" ranking of active pueblos. Function-owned. */
export const villageRankingsCollection = (db: Firestore) => typedCollection(db, C.villageRankings);

export const villageRankingDoc = (db: Firestore, rankingId: string) => typedDoc(db, C.villageRankings, rankingId);

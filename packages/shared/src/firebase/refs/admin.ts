// packages/shared/src/firebase/refs/admin.ts
//
// The Admin SDK's typed refs. Every collection is declared once in
// ./collections.ts; this file binds those entries to the Admin SDK under the
// names functions and scripts import, and derives the conformance gate's
// targets from the same table.
//
// Admin refs are built with method calls on the `db` the caller passes, never
// an SDK import: functions/ is npm-installed with its own firebase-admin copy.
import type {
  CollectionGroup,
  CollectionReference,
  DocumentReference,
  Firestore,
  FirestoreDataConverter,
} from 'firebase-admin/firestore';
import { adminConverter } from '../converters/sdkAdapters.admin';
import { censoAnswersId } from '../../models/municipality/CensoAnswersDataModel';
import { municipalityPersonDirectoryId } from '../../models/municipality/MunicipalityPersonDataModel';
import { NOTIFICATION_SETTINGS_DOC_ID } from '../../models/notification/NotificationSettingsDataModel';
import { PRIVACY_SETTINGS_DOC_ID } from '../../models/user/PrivacySettingsDataModel';
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

function converterOf<D extends TypedCollectionDef>(def: D) {
  return adminConverter(def.schema) as unknown as FirestoreDataConverter<ModelOf<D>>;
}

function typedCollection<D extends TypedCollectionDef>(
  db: Firestore,
  def: D,
  ...ids: PathParams<D['path']>
): CollectionReference<ModelOf<D>> {
  return db.collection(collectionSegments(def.path, ids).join('/')).withConverter(converterOf(def));
}

function typedDoc<D extends TypedCollectionDef>(
  db: Firestore,
  def: D,
  ...ids: [...PathParams<D['path']>, string]
): DocumentReference<ModelOf<D>> {
  const docId = ids[ids.length - 1];
  return db.collection(collectionSegments(def.path, ids.slice(0, -1)).join('/')).doc(docId).withConverter(converterOf(def));
}

function typedGroup<D extends TypedCollectionDef>(db: Firestore, def: D): CollectionGroup<ModelOf<D>> {
  return db.collectionGroup(collectionId(def.path)).withConverter(converterOf(def));
}

/** Unconverted — for a collection no fixed model describes. */
function rawDoc<D extends CollectionDef>(db: Firestore, def: D, ...ids: [...PathParams<D['path']>, string]) {
  const docId = ids[ids.length - 1];
  return db.collection(collectionSegments(def.path, ids.slice(0, -1)).join('/')).doc(docId);
}

/**
 * What the conformance gate (scripts/check-dev-conformance.mjs) walks: every
 * collection with a schema, subcollections at any depth included, each with
 * the converter its readers use.
 */
export const conformanceTargets = Object.values(C)
  .filter((def): def is Extract<(typeof C)[keyof typeof C], TypedCollectionDef> => def.schema !== null)
  .map((def) => ({ path: def.path, converter: adminConverter(def.schema) }));

/** Every collection path declared in ./collections.ts, schema or not. */
export const collectionPaths: readonly string[] = Object.values(C).map((def) => def.path);

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
// factory exists so call sites stay off raw `db.doc(...)`.
export const eventRegistrationPrivateDoc = (db: Firestore, eventId: string, registrationId: string) =>
  rawDoc(db, C.eventRegistrationPrivate, eventId, registrationId);

// Claim tokens for the event's open group seats. THE DOCUMENT ID IS THE SECRET
// — see SeatTokenModel. Never fold this collection into a query whose results
// reach a client that isn't the group owner or an organizer.
export const eventSeatTokensCollection = (db: Firestore, eventId: string) =>
  typedCollection(db, C.eventSeatTokens, eventId);

export const eventSeatTokenDoc = (db: Firestore, eventId: string, token: string) =>
  typedDoc(db, C.eventSeatTokens, eventId, token);

// Append-only audit log of the event's roster changes — see
// RegistrationEventDataModel. Written only from `writeRegistrationEvent`, in
// the same transaction as the mutation it records.
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

export const organizationSocioPersonaLocksCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationSocioPersonaLocks, organizationId);

export const organizationSocioPersonaLockDoc = (db: Firestore, organizationId: string, personId: string) =>
  typedDoc(db, C.organizationSocioPersonaLocks, organizationId, personId);

// The socio-number counter (see SocioNumberingDataSchema). Function-owned.
export const organizationSocioNumberingDoc = (db: Firestore, organizationId: string) =>
  typedDoc(db, C.organizationSocioNumbering, organizationId, 'current');

export const organizationSocioNumberingCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationSocioNumbering, organizationId);

// The cuota de socios (see CuotaDataModel).
export const organizationCuotaSettingsDoc = (db: Firestore, organizationId: string) =>
  typedDoc(db, C.organizationCuotaSettings, organizationId, 'current');

export const organizationCuotaSettingsCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationCuotaSettings, organizationId);

/** Every org's cuota settings — the reminder job's starting point. */
export const cuotaSettingsGroup = (db: Firestore) => typedGroup(db, C.organizationCuotaSettings);

export const organizationCuotaAssignmentsCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationCuotaAssignments, organizationId);

export const organizationCuotaAssignmentDoc = (db: Firestore, organizationId: string, socioId: string) =>
  typedDoc(db, C.organizationCuotaAssignments, organizationId, socioId);

export const organizationCuotaPaymentsCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationCuotaPayments, organizationId);

export const organizationCuotaRemindersCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationCuotaReminders, organizationId);

export const organizationCuotaReminderDoc = (db: Firestore, organizationId: string, reminderId: string) =>
  typedDoc(db, C.organizationCuotaReminders, organizationId, reminderId);

// The cosateca (see CosaDataModel, CosaRequestDataModel).
export const cosasCollection = (db: Firestore) => typedCollection(db, C.cosas);
export const cosaDoc = (db: Firestore, cosaId: string) => typedDoc(db, C.cosas, cosaId);
export const cosaSlotsCollection = (db: Firestore, cosaId: string) => typedCollection(db, C.cosaSlots, cosaId);
export const cosaSlotDoc = (db: Firestore, cosaId: string, slotKey: string) => typedDoc(db, C.cosaSlots, cosaId, slotKey);
export const cosaRequestsCollection = (db: Firestore) => typedCollection(db, C.cosaRequests);
export const cosaRequestDoc = (db: Firestore, requestId: string) => typedDoc(db, C.cosaRequests, requestId);
export const cosaRequestChatCollection = (db: Firestore, requestId: string) =>
  typedCollection(db, C.cosaRequestChat, requestId);

// Group tasks, shifts and checklist templates (see GroupTaskDataModel).
export const organizationTasksCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationTasks, organizationId);

export const organizationTaskDoc = (db: Firestore, organizationId: string, taskId: string) =>
  typedDoc(db, C.organizationTasks, organizationId, taskId);

/** Every org's tasks — the reminder job's starting point. */
export const groupTasksGroup = (db: Firestore) => typedGroup(db, C.organizationTasks);

export const organizationTaskTemplatesCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationTaskTemplates, organizationId);

// The group's records (see RecordsDataModel).
export const organizationActasCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationActas, organizationId);

export const organizationLedgerEntriesCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationLedgerEntries, organizationId);

export const organizationTaskRemindersCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationTaskReminders, organizationId);

export const organizationTaskReminderDoc = (db: Firestore, organizationId: string, reminderId: string) =>
  typedDoc(db, C.organizationTaskReminders, organizationId, reminderId);

// A group's messages (see GroupMessageDataModel).
export const organizationMessagesCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationMessages, organizationId);

export const organizationMessageDoc = (db: Firestore, organizationId: string, messageId: string) =>
  typedDoc(db, C.organizationMessages, organizationId, messageId);

export const organizationMessageDeliveriesCollection = (db: Firestore, organizationId: string, messageId: string) =>
  typedCollection(db, C.organizationMessageDeliveries, organizationId, messageId);

export const organizationMessageReadsCollection = (db: Firestore, organizationId: string, messageId: string) =>
  typedCollection(db, C.organizationMessageReads, organizationId, messageId);

export const organizationMessageVotesCollection = (db: Firestore, organizationId: string, messageId: string) =>
  typedCollection(db, C.organizationMessageVotes, organizationId, messageId);

// A group's chat (see GroupChatDataModel). The general thread's messages; an
// aviso's live under its message.
export const organizationGeneralChatCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationGeneralChat, organizationId);

export const organizationAvisoChatCollection = (db: Firestore, organizationId: string, messageId: string) =>
  typedCollection(db, C.organizationAvisoChat, organizationId, messageId);

export const organizationChatThreadsCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationChatThreads, organizationId);

export const organizationChatThreadDoc = (db: Firestore, organizationId: string, threadId: string) =>
  typedDoc(db, C.organizationChatThreads, organizationId, threadId);

export const organizationChatReadsCollection = (db: Firestore, organizationId: string, threadId: string) =>
  typedCollection(db, C.organizationChatReads, organizationId, threadId);

export const organizationJoinRequestsCollection = (db: Firestore, organizationId: string) =>
  typedCollection(db, C.organizationJoinRequests, organizationId);

export const organizationJoinRequestDoc = (db: Firestore, organizationId: string, userId: string) =>
  typedDoc(db, C.organizationJoinRequests, organizationId, userId);

// ── Organizer requests ───────────────────────────────────────────────────

export const organizerRequestsCollection = (db: Firestore) => typedCollection(db, C.organizerRequests);

export const organizerRequestDoc = (db: Firestore, requestId: string) => typedDoc(db, C.organizerRequests, requestId);

// ── Person domain ────────────────────────────────────────────────────────

export const personsCollection = (db: Firestore) => typedCollection(db, C.persons);

export const personDoc = (db: Firestore, personId: string) => typedDoc(db, C.persons, personId);

// ── User + notifications domain ──────────────────────────────────────────

export const usersCollection = (db: Firestore) => typedCollection(db, C.users);

export const userDoc = (db: Firestore, userId: string) => typedDoc(db, C.users, userId);

export const publicProfilesCollection = (db: Firestore) => typedCollection(db, C.publicProfiles);

export const publicProfileDoc = (db: Firestore, userId: string) => typedDoc(db, C.publicProfiles, userId);

export const userNotificationsCollection = (db: Firestore, userId: string) =>
  typedCollection(db, C.userNotifications, userId);

export const userNotificationDoc = (db: Firestore, userId: string, notificationId: string) =>
  typedDoc(db, C.userNotifications, userId, notificationId);

// Push-capable devices. THE DOCUMENT ID IS THE FCM REGISTRATION TOKEN — see
// DeviceTokenDataModel. Dead tokens are pruned by path when FCM reports
// `registration-token-not-registered`, so the send site needs no lookup.
export const userDevicesCollection = (db: Firestore, userId: string) => typedCollection(db, C.userDevices, userId);

export const userDeviceDoc = (db: Firestore, userId: string, token: string) =>
  typedDoc(db, C.userDevices, userId, token);

export const userPreferencesCollection = (db: Firestore, userId: string) =>
  typedCollection(db, C.userPreferences, userId);

// Optional, one per group: absent means the group's messages push.
export const userGroupPrefsCollection = (db: Firestore, userId: string) =>
  typedCollection(db, C.userGroupPrefs, userId);

export const userGroupPrefsDoc = (db: Firestore, userId: string, organizationId: string) =>
  typedDoc(db, C.userGroupPrefs, userId, organizationId);

// Optional: absent means DEFAULT_NOTIFICATION_PREFS.
export const userNotificationPrefsDoc = (db: Firestore, userId: string) =>
  typedDoc(db, C.userPreferences, userId, 'notifications');

// Optional, and its own collection so the conformance gate reads it with its own
// schema: rules admit exactly one doc here (`account`).
export const userNotificationSettingsCollection = (db: Firestore, userId: string) =>
  typedCollection(db, C.userNotificationSettings, userId);

export const userNotificationSettingsDoc = (db: Firestore, userId: string) =>
  typedDoc(db, C.userNotificationSettings, userId, NOTIFICATION_SETTINGS_DOC_ID);

// Optional: absent means the account was never asked about usage analytics.
export const userPrivacySettingsDoc = (db: Firestore, userId: string) =>
  typedDoc(db, C.userPrivacySettings, userId, PRIVACY_SETTINGS_DOC_ID);

// Server-only push spool — see PushQueueDataModel for why the id is
// deterministic. `firestore.rules` denies clients both directions.
export const pushQueueCollection = (db: Firestore) => typedCollection(db, C.pushQueue);

export const pushQueueDoc = (db: Firestore, id: string) => typedDoc(db, C.pushQueue, id);

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

// ── Moderation audit log ─────────────────────────────────────────────────
// Append-only, top-level, scoped by `municipalityId`. Function-owned: clients
// only read (firestore.rules denies all client writes). Sibling of
// `membershipEvents` — one log per concern (roles vs content).

export const moderationEventsCollection = (db: Firestore) => typedCollection(db, C.moderationEvents);

export const moderationEventDoc = (db: Firestore, id: string) => typedDoc(db, C.moderationEvents, id);

export const ambassadorLeadsCollection = (db: Firestore) => typedCollection(db, C.ambassadorLeads);

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

/**
 * The OSM settlement reference data for one municipality, keyed by INE code.
 *
 * Under `_admin/**`, which is `allow read, write: if false` for every client —
 * no client reads this and the Admin SDK bypasses rules, so it needs no rules
 * of its own and cannot be edited into the barrios of every village activated
 * afterwards. (`_admin` paths need an EVEN number of segments to be a document;
 * this one is four.)
 */
export const settlementSeedDoc = (db: Firestore, codigoINE: string) =>
  rawDoc(db, C.settlementSeeds, 'settlements', codigoINE);

// ── Vocabulary domain (top-level collections) ────────────────────────────

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

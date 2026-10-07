// packages/shared/src/firebase/refs/client.ts
// Type-only and erased at runtime: gives declaration emit a portable name for
// the JS SDK types these refs return (TS2742 through the ../sdk re-export).
import type {} from 'firebase/firestore';
import { collection, collectionGroup, doc, type Firestore } from '../sdk/firestore';
import { eventConverterClient } from '../converters/eventConverter.client';
import { registrationConverterClient } from '../converters/registrationConverter.client';
import { municipalityConverterClient } from '../converters/municipalityConverter.client';
import { barrioConverterClient } from '../converters/barrioConverter.client';
import { placeConverterClient } from '../converters/placeConverter.client';
import { villageMemberConverterClient } from '../converters/villageMemberConverter.client';
import { censoAnswersConverterClient } from '../converters/censoAnswersConverter.client';
import { censoAnswersId } from '../../models/municipality/CensoAnswersDataModel';
import { seatTokenConverterClient } from '../converters/seatTokenConverter.client';
import { registrationEventConverterClient } from '../converters/registrationEventConverter.client';
import { organizationConverterClient } from '../converters/organizationConverter.client';
import { orgMemberConverterClient } from '../converters/orgMemberConverter.client';
import { orgJoinRequestConverterClient } from '../converters/orgJoinRequestConverter.client';
import { organizerRequestConverterClient } from '../converters/organizerRequestConverter.client';
import { personConverterClient } from '../converters/personConverter.client';
import { userConverterClient } from '../converters/userConverter.client';
import { publicProfileConverterClient } from '../converters/publicProfileConverter.client';
import { notificationConverterClient } from '../converters/notificationConverter.client';
import { deviceTokenConverterClient } from '../converters/deviceTokenConverter.client';
import { notificationPrefsConverterClient } from '../converters/notificationPrefsConverter.client';
import { newsPostConverterClient } from '../converters/newsPostConverter.client';
import { commentConverterClient } from '../converters/commentConverter.client';
import { occupationConverterClient } from '../converters/occupationConverter.client';
import { adminConverterClient } from '../converters/adminConverter.client';
import { membershipEventConverterClient } from '../converters/membershipEventConverter.client';
import { festivalPosterConverterClient } from '../converters/festivalPosterConverter.client';
import { villageWrappedConverterClient } from '../converters/villageWrappedConverter.client';
import { municipalityPersonConverterClient } from '../converters/municipalityPersonConverter.client';
import { contentReportConverterClient } from '../converters/contentReportConverter.client';
import { blockedUserConverterClient } from '../converters/blockedUserConverter.client';
import { vocabularyTermConverterClient } from '../converters/vocabularyTermConverter.client';
import { historyEntryConverterClient } from '../converters/historyEntryConverter.client';
import { vocabularyDefinitionConverterClient } from '../converters/vocabularyDefinitionConverter.client';
import { vocabularyWordConverterClient } from '../converters/vocabularyWordConverter.client';

export const eventsCollection = (db: Firestore) =>
  collection(db, 'events').withConverter(eventConverterClient);

export const eventDoc = (db: Firestore, eventId: string) =>
  doc(db, 'events', eventId).withConverter(eventConverterClient);

export const eventRegistrationsCollection = (db: Firestore, eventId: string) =>
  collection(db, 'events', eventId, 'registrations').withConverter(registrationConverterClient);

export const eventRegistrationDoc = (db: Firestore, eventId: string, registrationId: string) =>
  doc(db, 'events', eventId, 'registrations', registrationId).withConverter(registrationConverterClient);

// Organizer-only private data for one registration: the phone (when the event
// sets telephoneRequired) plus the answers to the event's custom signupFields.
// Both are PII the public registration doc must never carry. No converter: the
// answer map is shaped by the event's field specs, not by a fixed model. The
// factory exists so call sites stay off raw `doc(getDb(), …)`.
export const eventRegistrationPrivateDoc = (db: Firestore, eventId: string, registrationId: string) =>
  doc(db, 'events', eventId, 'registrationPrivate', registrationId);

// Claim tokens for the event's open group seats. THE DOCUMENT ID IS THE SECRET
// — see SeatTokenModel. Rules limit reads to the group owner and the event's
// organizers, so the group owner can re-read their own tokens to re-share a
// link; writes are callable-only.
export const eventSeatTokensCollection = (db: Firestore, eventId: string) =>
  collection(db, 'events', eventId, 'seatTokens').withConverter(seatTokenConverterClient);

export const eventSeatTokenDoc = (db: Firestore, eventId: string, token: string) =>
  doc(db, 'events', eventId, 'seatTokens', token).withConverter(seatTokenConverterClient);

// Append-only audit log of the event's roster changes — see
// RegistrationEventDataModel. Readable by `isEventOrganizer(eventId)` only
// (organizers, village admins, app admins); every client write is denied.
export const eventRegistrationEventsCollection = (db: Firestore, eventId: string) =>
  collection(db, 'events', eventId, 'registrationEvents').withConverter(registrationEventConverterClient);

// ── Municipality domain ────────────────────────────────────────────────────

export const municipalitiesCollection = (db: Firestore) =>
  collection(db, 'municipalities').withConverter(municipalityConverterClient);

export const municipalityDoc = (db: Firestore, municipalityId: string) =>
  doc(db, 'municipalities', municipalityId).withConverter(municipalityConverterClient);

export const municipalityBarriosCollection = (db: Firestore, municipalityId: string) =>
  collection(db, 'municipalities', municipalityId, 'barrios').withConverter(barrioConverterClient);

export const municipalityBarrioDoc = (db: Firestore, municipalityId: string, barrioId: string) =>
  doc(db, 'municipalities', municipalityId, 'barrios', barrioId).withConverter(barrioConverterClient);

export const municipalityPlacesCollection = (db: Firestore, municipalityId: string) =>
  collection(db, 'municipalities', municipalityId, 'places').withConverter(placeConverterClient);

export const municipalityPlaceDoc = (db: Firestore, municipalityId: string, placeId: string) =>
  doc(db, 'municipalities', municipalityId, 'places', placeId).withConverter(placeConverterClient);

export const municipalityMembersCollection = (db: Firestore, municipalityId: string) =>
  collection(db, 'municipalities', municipalityId, 'members').withConverter(villageMemberConverterClient);

export const censoAnswersCollection = (db: Firestore) =>
  collection(db, 'censoAnswers').withConverter(censoAnswersConverterClient);

export const censoAnswersDoc = (db: Firestore, municipalityId: string, userId: string) =>
  doc(db, 'censoAnswers', censoAnswersId(municipalityId, userId)).withConverter(censoAnswersConverterClient);

export const municipalityMemberDoc = (db: Firestore, municipalityId: string, memberId: string) =>
  doc(db, 'municipalities', municipalityId, 'members', memberId).withConverter(villageMemberConverterClient);

export const municipalityPeopleCollection = (db: Firestore) =>
  collection(db, 'municipalityPeople').withConverter(municipalityPersonConverterClient);

export const municipalityPersonDoc = (db: Firestore, municipalityId: string, personId: string) =>
  doc(db, 'municipalityPeople', `${municipalityId}_${personId}`).withConverter(municipalityPersonConverterClient);

// ── Organization domain ──────────────────────────────────────────────────

export const organizationsCollection = (db: Firestore) =>
  collection(db, 'organizations').withConverter(organizationConverterClient);

export const organizationDoc = (db: Firestore, organizationId: string) =>
  doc(db, 'organizations', organizationId).withConverter(organizationConverterClient);

export const organizationMembersCollection = (db: Firestore, organizationId: string) =>
  collection(db, 'organizations', organizationId, 'members').withConverter(orgMemberConverterClient);

export const organizationMemberDoc = (db: Firestore, organizationId: string, memberId: string) =>
  doc(db, 'organizations', organizationId, 'members', memberId).withConverter(orgMemberConverterClient);

export const organizationJoinRequestsCollection = (db: Firestore, organizationId: string) =>
  collection(db, 'organizations', organizationId, 'joinRequests').withConverter(orgJoinRequestConverterClient);

export const organizationJoinRequestDoc = (db: Firestore, organizationId: string, userId: string) =>
  doc(db, 'organizations', organizationId, 'joinRequests', userId).withConverter(orgJoinRequestConverterClient);

export const joinRequestsGroup = (db: Firestore) =>
  collectionGroup(db, 'joinRequests').withConverter(orgJoinRequestConverterClient);

// ── Organizer requests ───────────────────────────────────────────────────

export const organizerRequestsCollection = (db: Firestore) =>
  collection(db, 'organizerRequests').withConverter(organizerRequestConverterClient);

export const organizerRequestDoc = (db: Firestore, requestId: string) =>
  doc(db, 'organizerRequests', requestId).withConverter(organizerRequestConverterClient);

// ── Person domain ────────────────────────────────────────────────────────

export const personsCollection = (db: Firestore) =>
  collection(db, 'persons').withConverter(personConverterClient);

export const personDoc = (db: Firestore, personId: string) =>
  doc(db, 'persons', personId).withConverter(personConverterClient);

// ── User + notifications domain ──────────────────────────────────────────

export const usersCollection = (db: Firestore) =>
  collection(db, 'users').withConverter(userConverterClient);

export const userDoc = (db: Firestore, userId: string) =>
  doc(db, 'users', userId).withConverter(userConverterClient);

export const publicProfileDoc = (db: Firestore, userId: string) =>
  doc(db, 'publicProfiles', userId).withConverter(publicProfileConverterClient);

export const userNotificationsCollection = (db: Firestore, userId: string) =>
  collection(db, 'users', userId, 'notifications').withConverter(notificationConverterClient);

export const userNotificationDoc = (db: Firestore, userId: string, notificationId: string) =>
  doc(db, 'users', userId, 'notifications', notificationId).withConverter(notificationConverterClient);

// Push-capable devices. THE DOCUMENT ID IS THE FCM REGISTRATION TOKEN — see
// DeviceTokenDataModel: that is what makes re-registering on every launch
// idempotent instead of accumulating a row per session.
export const userDevicesCollection = (db: Firestore, userId: string) =>
  collection(db, 'users', userId, 'devices').withConverter(deviceTokenConverterClient);

export const userDeviceDoc = (db: Firestore, userId: string, token: string) =>
  doc(db, 'users', userId, 'devices', token).withConverter(deviceTokenConverterClient);

// Optional: absent means DEFAULT_NOTIFICATION_PREFS. Fixed doc id so there is
// exactly one preferences document per account.
export const NOTIFICATION_PREFS_DOC_ID = 'notifications';

export const userNotificationPrefsDoc = (db: Firestore, userId: string) =>
  doc(db, 'users', userId, 'preferences', NOTIFICATION_PREFS_DOC_ID)
    .withConverter(notificationPrefsConverterClient);

// ── News domain (top-level collections) ──────────────────────────────────

export const newsCollection = (db: Firestore) =>
  collection(db, 'news').withConverter(newsPostConverterClient);

export const newsDoc = (db: Firestore, postId: string) =>
  doc(db, 'news', postId).withConverter(newsPostConverterClient);

// ── Comments (generic, entity-scoped, top-level) ────────────────────────

export const commentsCollection = (db: Firestore) =>
  collection(db, 'comments').withConverter(commentConverterClient);

export const commentDoc = (db: Firestore, commentId: string) =>
  doc(db, 'comments', commentId).withConverter(commentConverterClient);

export const festivalPostersCollection = (db: Firestore) =>
  collection(db, 'festivalPosters').withConverter(festivalPosterConverterClient);

export const festivalPosterDoc = (db: Firestore, posterId: string) =>
  doc(db, 'festivalPosters', posterId).withConverter(festivalPosterConverterClient);

// ── Occupation domain (top-level collections) ────────────────────────────

export const occupationsCollection = (db: Firestore) =>
  collection(db, 'occupations').withConverter(occupationConverterClient);

export const occupationDoc = (db: Firestore, occupationId: string) =>
  doc(db, 'occupations', occupationId).withConverter(occupationConverterClient);

// ── Membership audit log ─────────────────────────────────────────────────
// Append-only, top-level, scoped by `municipalityId`. Function-owned: clients
// only read (firestore.rules denies all client writes).

export const membershipEventsCollection = (db: Firestore) =>
  collection(db, 'membershipEvents').withConverter(membershipEventConverterClient);

export const membershipEventDoc = (db: Firestore, id: string) =>
  doc(db, 'membershipEvents', id).withConverter(membershipEventConverterClient);

// ── Admin domain ─────────────────────────────────────────────────────────

export const adminsCollection = (db: Firestore) =>
  collection(db, 'admins').withConverter(adminConverterClient);

export const adminDoc = (db: Firestore, userId: string) =>
  doc(db, 'admins', userId).withConverter(adminConverterClient);

// ── UGC safety: reports + per-user block lists ───────────────────────────

export const contentReportsCollection = (db: Firestore) =>
  collection(db, 'contentReports').withConverter(contentReportConverterClient);

export const contentReportDoc = (db: Firestore, reportId: string) =>
  doc(db, 'contentReports', reportId).withConverter(contentReportConverterClient);

export const userBlockedUsersCollection = (db: Firestore, userId: string) =>
  collection(db, 'users', userId, 'blockedUsers').withConverter(blockedUserConverterClient);

export const userBlockedUserDoc = (db: Firestore, userId: string, blockedUserId: string) =>
  doc(db, 'users', userId, 'blockedUsers', blockedUserId).withConverter(blockedUserConverterClient);

// ── Vocabulary domain (top-level collections) ────────────────────────────
// The term id is derived from `municipalityId` + slug (see `vocabularyTermId`),
// never minted — that is what makes two villagers adding the same word land on
// one shared doc instead of two.

export const vocabularyTermsCollection = (db: Firestore) =>
  collection(db, 'vocabularyTerms').withConverter(vocabularyTermConverterClient);

export const vocabularyTermDoc = (db: Firestore, termId: string) =>
  doc(db, 'vocabularyTerms', termId).withConverter(vocabularyTermConverterClient);

export const vocabularyDefinitionsCollection = (db: Firestore) =>
  collection(db, 'vocabularyDefinitions').withConverter(vocabularyDefinitionConverterClient);

export const vocabularyDefinitionDoc = (db: Firestore, definitionId: string) =>
  doc(db, 'vocabularyDefinitions', definitionId).withConverter(vocabularyDefinitionConverterClient);

// ── Village history (top-level collection) ───────────────────────────────

export const historyEntriesCollection = (db: Firestore) =>
  collection(db, 'historyEntries').withConverter(historyEntryConverterClient);

export const historyEntryDoc = (db: Firestore, entryId: string) =>
  doc(db, 'historyEntries', entryId).withConverter(historyEntryConverterClient);

/** The shared word index — one doc per word across every village. Function-owned. */
export const vocabularyWordsCollection = (db: Firestore) =>
  collection(db, 'vocabularyWords').withConverter(vocabularyWordConverterClient);

export const vocabularyWordDoc = (db: Firestore, slug: string) =>
  doc(db, 'vocabularyWords', slug).withConverter(vocabularyWordConverterClient);

export const villageWrappedCollection = (db: Firestore) =>
  collection(db, 'villageWrapped').withConverter(villageWrappedConverterClient);

export const villageWrappedDoc = (db: Firestore, wrappedId: string) =>
  doc(db, 'villageWrapped', wrappedId).withConverter(villageWrappedConverterClient);

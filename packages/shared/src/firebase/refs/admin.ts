// packages/shared/src/firebase/refs/admin.ts
import type { Firestore } from 'firebase-admin/firestore';
import { eventConverterAdmin } from '../converters/eventConverter.admin';
import { registrationConverterAdmin } from '../converters/registrationConverter.admin';
import { seatTokenConverterAdmin } from '../converters/seatTokenConverter.admin';
import { registrationEventConverterAdmin } from '../converters/registrationEventConverter.admin';
import { municipalityConverterAdmin } from '../converters/municipalityConverter.admin';
import { barrioConverterAdmin } from '../converters/barrioConverter.admin';
import { placeConverterAdmin } from '../converters/placeConverter.admin';
import { villageMemberConverterAdmin } from '../converters/villageMemberConverter.admin';
import { censoAnswersConverterAdmin } from '../converters/censoAnswersConverter.admin';
import { censoAnswersId } from '../../models/municipality/CensoAnswersDataModel';
import { organizationConverterAdmin } from '../converters/organizationConverter.admin';
import { orgMemberConverterAdmin } from '../converters/orgMemberConverter.admin';
import { orgJoinRequestConverterAdmin } from '../converters/orgJoinRequestConverter.admin';
import { organizerRequestConverterAdmin } from '../converters/organizerRequestConverter.admin';
import { personConverterAdmin } from '../converters/personConverter.admin';
import { userConverterAdmin } from '../converters/userConverter.admin';
import { publicProfileConverterAdmin } from '../converters/publicProfileConverter.admin';
import { notificationConverterAdmin } from '../converters/notificationConverter.admin';
import { deviceTokenConverterAdmin } from '../converters/deviceTokenConverter.admin';
import { notificationPrefsConverterAdmin } from '../converters/notificationPrefsConverter.admin';
import { pushQueueConverterAdmin } from '../converters/pushQueueConverter.admin';
import { newsPostConverterAdmin } from '../converters/newsPostConverter.admin';
import { commentConverterAdmin } from '../converters/commentConverter.admin';
import { occupationConverterAdmin } from '../converters/occupationConverter.admin';
import { adminConverterAdmin } from '../converters/adminConverter.admin';
import { membershipEventConverterAdmin } from '../converters/membershipEventConverter.admin';
import { moderationEventConverterAdmin } from '../converters/moderationEventConverter.admin';
import { ambassadorLeadConverterAdmin } from '../converters/ambassadorLeadConverter.admin';
import { festivalPosterConverterAdmin } from '../converters/festivalPosterConverter.admin';
import { villageWrappedConverterAdmin } from '../converters/villageWrappedConverter.admin';
import { municipalityPersonConverterAdmin } from '../converters/municipalityPersonConverter.admin';
import { contentReportConverterAdmin } from '../converters/contentReportConverter.admin';
import { blockedUserConverterAdmin } from '../converters/blockedUserConverter.admin';
import { vocabularyTermConverterAdmin } from '../converters/vocabularyTermConverter.admin';
import { historyEntryConverterAdmin } from '../converters/historyEntryConverter.admin';
import { vocabularyDefinitionConverterAdmin } from '../converters/vocabularyDefinitionConverter.admin';
import { vocabularyWordConverterAdmin } from '../converters/vocabularyWordConverter.admin';

export const eventsCollection = (db: Firestore) =>
  db.collection('events').withConverter(eventConverterAdmin);

export const eventDoc = (db: Firestore, eventId: string) =>
  db.collection('events').doc(eventId).withConverter(eventConverterAdmin);

export const eventRegistrationsCollection = (db: Firestore, eventId: string) =>
  db.collection('events').doc(eventId).collection('registrations').withConverter(registrationConverterAdmin);

export const eventRegistrationDoc = (db: Firestore, eventId: string, registrationId: string) =>
  db.collection('events').doc(eventId).collection('registrations').doc(registrationId).withConverter(registrationConverterAdmin);

// Organizer-only private data for one registration: the phone (when the event
// sets telephoneRequired) plus the answers to the event's custom signupFields.
// Both are PII the public registration doc must never carry. No converter: the
// answer map is shaped by the event's field specs, not by a fixed model. The
// factory exists so call sites stay off raw `db.doc(...)`.
export const eventRegistrationPrivateDoc = (db: Firestore, eventId: string, registrationId: string) =>
  db.collection('events').doc(eventId).collection('registrationPrivate').doc(registrationId);

// Claim tokens for the event's open group seats. THE DOCUMENT ID IS THE SECRET
// — see SeatTokenModel. Never fold this collection into a query whose results
// reach a client that isn't the group owner or an organizer.
export const eventSeatTokensCollection = (db: Firestore, eventId: string) =>
  db.collection('events').doc(eventId).collection('seatTokens').withConverter(seatTokenConverterAdmin);

export const eventSeatTokenDoc = (db: Firestore, eventId: string, token: string) =>
  db.collection('events').doc(eventId).collection('seatTokens').doc(token).withConverter(seatTokenConverterAdmin);

// Append-only audit log of the event's roster changes — see
// RegistrationEventDataModel. Written only from `writeRegistrationEvent`, in
// the same transaction as the mutation it records.
export const eventRegistrationEventsCollection = (db: Firestore, eventId: string) =>
  db.collection('events').doc(eventId).collection('registrationEvents').withConverter(registrationEventConverterAdmin);

// ── Municipality domain ────────────────────────────────────────────────────

export const municipalitiesCollection = (db: Firestore) =>
  db.collection('municipalities').withConverter(municipalityConverterAdmin);

export const municipalityDoc = (db: Firestore, municipalityId: string) =>
  db.collection('municipalities').doc(municipalityId).withConverter(municipalityConverterAdmin);

export const municipalityBarriosCollection = (db: Firestore, municipalityId: string) =>
  db.collection('municipalities').doc(municipalityId).collection('barrios').withConverter(barrioConverterAdmin);

export const municipalityBarrioDoc = (db: Firestore, municipalityId: string, barrioId: string) =>
  db.collection('municipalities').doc(municipalityId).collection('barrios').doc(barrioId).withConverter(barrioConverterAdmin);

export const municipalityPlacesCollection = (db: Firestore, municipalityId: string) =>
  db.collection('municipalities').doc(municipalityId).collection('places').withConverter(placeConverterAdmin);

export const municipalityPlaceDoc = (db: Firestore, municipalityId: string, placeId: string) =>
  db.collection('municipalities').doc(municipalityId).collection('places').doc(placeId).withConverter(placeConverterAdmin);

export const municipalityMembersCollection = (db: Firestore, municipalityId: string) =>
  db.collection('municipalities').doc(municipalityId).collection('members').withConverter(villageMemberConverterAdmin);

export const censoAnswersCollection = (db: Firestore) =>
  db.collection('censoAnswers').withConverter(censoAnswersConverterAdmin);

export const censoAnswersDoc = (db: Firestore, municipalityId: string, userId: string) =>
  db.collection('censoAnswers').doc(censoAnswersId(municipalityId, userId)).withConverter(censoAnswersConverterAdmin);

export const municipalityMemberDoc = (db: Firestore, municipalityId: string, memberId: string) =>
  db.collection('municipalities').doc(municipalityId).collection('members').doc(memberId).withConverter(villageMemberConverterAdmin);

export const municipalityPeopleCollection = (db: Firestore) =>
  db.collection('municipalityPeople').withConverter(municipalityPersonConverterAdmin);

export const municipalityPersonDoc = (db: Firestore, municipalityId: string, personId: string) =>
  db.collection('municipalityPeople').doc(`${municipalityId}_${personId}`).withConverter(municipalityPersonConverterAdmin);

// ── Organization domain ──────────────────────────────────────────────────

export const organizationsCollection = (db: Firestore) =>
  db.collection('organizations').withConverter(organizationConverterAdmin);

export const organizationDoc = (db: Firestore, organizationId: string) =>
  db.collection('organizations').doc(organizationId).withConverter(organizationConverterAdmin);

export const organizationMembersCollection = (db: Firestore, organizationId: string) =>
  db.collection('organizations').doc(organizationId).collection('members').withConverter(orgMemberConverterAdmin);

export const organizationMemberDoc = (db: Firestore, organizationId: string, memberId: string) =>
  db.collection('organizations').doc(organizationId).collection('members').doc(memberId).withConverter(orgMemberConverterAdmin);

export const organizationJoinRequestsCollection = (db: Firestore, organizationId: string) =>
  db.collection('organizations').doc(organizationId).collection('joinRequests').withConverter(orgJoinRequestConverterAdmin);

export const organizationJoinRequestDoc = (db: Firestore, organizationId: string, userId: string) =>
  db.collection('organizations').doc(organizationId).collection('joinRequests').doc(userId).withConverter(orgJoinRequestConverterAdmin);

// ── Organizer requests ───────────────────────────────────────────────────

export const organizerRequestsCollection = (db: Firestore) =>
  db.collection('organizerRequests').withConverter(organizerRequestConverterAdmin);

export const organizerRequestDoc = (db: Firestore, requestId: string) =>
  db.collection('organizerRequests').doc(requestId).withConverter(organizerRequestConverterAdmin);

// ── Person domain ────────────────────────────────────────────────────────

export const personsCollection = (db: Firestore) =>
  db.collection('persons').withConverter(personConverterAdmin);

export const personDoc = (db: Firestore, personId: string) =>
  db.collection('persons').doc(personId).withConverter(personConverterAdmin);

// ── User + notifications domain ──────────────────────────────────────────

export const usersCollection = (db: Firestore) =>
  db.collection('users').withConverter(userConverterAdmin);

export const userDoc = (db: Firestore, userId: string) =>
  db.collection('users').doc(userId).withConverter(userConverterAdmin);

export const publicProfilesCollection = (db: Firestore) =>
  db.collection('publicProfiles').withConverter(publicProfileConverterAdmin);

export const publicProfileDoc = (db: Firestore, userId: string) =>
  db.collection('publicProfiles').doc(userId).withConverter(publicProfileConverterAdmin);

export const userNotificationsCollection = (db: Firestore, userId: string) =>
  db.collection('users').doc(userId).collection('notifications').withConverter(notificationConverterAdmin);

export const userNotificationDoc = (db: Firestore, userId: string, notificationId: string) =>
  db.collection('users').doc(userId).collection('notifications').doc(notificationId).withConverter(notificationConverterAdmin);

// Push-capable devices. THE DOCUMENT ID IS THE FCM REGISTRATION TOKEN — see
// DeviceTokenDataModel. Dead tokens are pruned by path when FCM reports
// `registration-token-not-registered`, so the send site needs no lookup.
export const userDevicesCollection = (db: Firestore, userId: string) =>
  db.collection('users').doc(userId).collection('devices').withConverter(deviceTokenConverterAdmin);

export const userDeviceDoc = (db: Firestore, userId: string, token: string) =>
  db.collection('users').doc(userId).collection('devices').doc(token).withConverter(deviceTokenConverterAdmin);

// Rules admit exactly one doc here (`notifications`), so the whole collection
// shares its schema — which is what lets the conformance gate walk it.
export const userPreferencesCollection = (db: Firestore, userId: string) =>
  db.collection('users').doc(userId).collection('preferences')
    .withConverter(notificationPrefsConverterAdmin);

// Optional: absent means DEFAULT_NOTIFICATION_PREFS.
export const userNotificationPrefsDoc = (db: Firestore, userId: string) =>
  userPreferencesCollection(db, userId).doc('notifications');

// Server-only push spool — see PushQueueDataModel for why the id is
// deterministic. `firestore.rules` denies clients both directions.
export const pushQueueCollection = (db: Firestore) =>
  db.collection('pushQueue').withConverter(pushQueueConverterAdmin);

export const pushQueueDoc = (db: Firestore, id: string) =>
  db.collection('pushQueue').doc(id).withConverter(pushQueueConverterAdmin);

// ── News domain (top-level collections) ──────────────────────────────────

export const newsCollection = (db: Firestore) =>
  db.collection('news').withConverter(newsPostConverterAdmin);

export const newsDoc = (db: Firestore, postId: string) =>
  db.collection('news').doc(postId).withConverter(newsPostConverterAdmin);

// ── Comments (generic, entity-scoped, top-level) ────────────────────────

export const commentsCollection = (db: Firestore) =>
  db.collection('comments').withConverter(commentConverterAdmin);

export const commentDoc = (db: Firestore, commentId: string) =>
  db.collection('comments').doc(commentId).withConverter(commentConverterAdmin);

export const festivalPostersCollection = (db: Firestore) =>
  db.collection('festivalPosters').withConverter(festivalPosterConverterAdmin);

export const festivalPosterDoc = (db: Firestore, posterId: string) =>
  db.collection('festivalPosters').doc(posterId).withConverter(festivalPosterConverterAdmin);

// ── Occupation domain (top-level collections) ────────────────────────────

export const occupationsCollection = (db: Firestore) =>
  db.collection('occupations').withConverter(occupationConverterAdmin);

export const occupationDoc = (db: Firestore, occupationId: string) =>
  db.collection('occupations').doc(occupationId).withConverter(occupationConverterAdmin);

// ── Membership audit log ─────────────────────────────────────────────────
// Append-only, top-level, scoped by `municipalityId`. Function-owned: clients
// only read (firestore.rules denies all client writes).

export const membershipEventsCollection = (db: Firestore) =>
  db.collection('membershipEvents').withConverter(membershipEventConverterAdmin);

export const membershipEventDoc = (db: Firestore, id: string) =>
  db.collection('membershipEvents').doc(id).withConverter(membershipEventConverterAdmin);

// ── Moderation audit log ─────────────────────────────────────────────────
// Append-only, top-level, scoped by `municipalityId`. Function-owned: clients
// only read (firestore.rules denies all client writes). Sibling of
// `membershipEvents` — one log per concern (roles vs content).

export const moderationEventsCollection = (db: Firestore) =>
  db.collection('moderationEvents').withConverter(moderationEventConverterAdmin);

export const moderationEventDoc = (db: Firestore, id: string) =>
  db.collection('moderationEvents').doc(id).withConverter(moderationEventConverterAdmin);

export const ambassadorLeadsCollection = (db: Firestore) =>
  db.collection('ambassadorLeads').withConverter(ambassadorLeadConverterAdmin);

// ── Admin domain ─────────────────────────────────────────────────────────

export const adminsCollection = (db: Firestore) =>
  db.collection('admins').withConverter(adminConverterAdmin);

export const adminDoc = (db: Firestore, userId: string) =>
  db.collection('admins').doc(userId).withConverter(adminConverterAdmin);

// ── UGC safety: reports + per-user block lists ───────────────────────────

export const contentReportsCollection = (db: Firestore) =>
  db.collection('contentReports').withConverter(contentReportConverterAdmin);

export const contentReportDoc = (db: Firestore, reportId: string) =>
  db.collection('contentReports').doc(reportId).withConverter(contentReportConverterAdmin);

export const userBlockedUsersCollection = (db: Firestore, userId: string) =>
  db.collection('users').doc(userId).collection('blockedUsers').withConverter(blockedUserConverterAdmin);

export const userBlockedUserDoc = (db: Firestore, userId: string, blockedUserId: string) =>
  db.collection('users').doc(userId).collection('blockedUsers').doc(blockedUserId).withConverter(blockedUserConverterAdmin);

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
  db.collection('_admin').doc('settlements').collection('seeds').doc(codigoINE);

// ── Vocabulary domain (top-level collections) ────────────────────────────

export const vocabularyTermsCollection = (db: Firestore) =>
  db.collection('vocabularyTerms').withConverter(vocabularyTermConverterAdmin);

export const vocabularyTermDoc = (db: Firestore, termId: string) =>
  db.collection('vocabularyTerms').doc(termId).withConverter(vocabularyTermConverterAdmin);

export const vocabularyDefinitionsCollection = (db: Firestore) =>
  db.collection('vocabularyDefinitions').withConverter(vocabularyDefinitionConverterAdmin);

export const vocabularyDefinitionDoc = (db: Firestore, definitionId: string) =>
  db.collection('vocabularyDefinitions').doc(definitionId).withConverter(vocabularyDefinitionConverterAdmin);

// ── Village history (top-level collection) ───────────────────────────────

export const historyEntriesCollection = (db: Firestore) =>
  db.collection('historyEntries').withConverter(historyEntryConverterAdmin);

export const historyEntryDoc = (db: Firestore, entryId: string) =>
  db.collection('historyEntries').doc(entryId).withConverter(historyEntryConverterAdmin);

/** The shared word index — one doc per word across every village. Function-owned. */
export const vocabularyWordsCollection = (db: Firestore) =>
  db.collection('vocabularyWords').withConverter(vocabularyWordConverterAdmin);

export const vocabularyWordDoc = (db: Firestore, slug: string) =>
  db.collection('vocabularyWords').doc(slug).withConverter(vocabularyWordConverterAdmin);

export const villageWrappedCollection = (db: Firestore) =>
  db.collection('villageWrapped').withConverter(villageWrappedConverterAdmin);

export const villageWrappedDoc = (db: Firestore, wrappedId: string) =>
  db.collection('villageWrapped').doc(wrappedId).withConverter(villageWrappedConverterAdmin);

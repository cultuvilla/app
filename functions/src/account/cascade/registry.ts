import type { CollectionKey } from '@cultuvilla/shared/firebase/refs/admin';
import {
  anonymiseBarrios,
  anonymiseEvents,
  anonymiseFestivalPosters,
  anonymiseFiestaEditions,
  anonymiseHistoryEntries,
  anonymiseNews,
  anonymisePlaces,
  anonymiseVocabularyDefinitions,
  anonymiseVocabularyTerms,
  clearSocioContacts,
  deleteAdminGrant,
  deleteBlockedUsers,
  deleteCensoAnswers,
  deleteChatMessages,
  deleteComments,
  deleteCosateca,
  deleteJoinRequests,
  deletePresenceRequests,
  deleteNotifications,
  deleteOrganizerRequests,
  deletePersons,
  deletePushData,
  deleteRegistrations,
  deleteSeatTokens,
  deleteStoragePhotos,
  deleteUserDoc,
  nullOrganizerPointers,
  removeMemberships,
} from './effects';
import type { CascadeEntry } from './types';

const AUDIT_LOG =
  'An audit record: kept for the legally required period with restricted access, as docs/legal/politica-de-privacidad.md §7 states. The uid is the actor or subject of the logged action, and it resolves to nobody once the account and its profile are gone.';

const GROUP_RECORD =
  "The group's own record (the group is the controller of its socio data, policy §2c): who was sent, assigned, recorded or configured something. The bare uid resolves to nobody once the account, its profile and its persona are gone; rewriting it would rewrite the group's history.";

/**
 * Where a uid lives and what deleting the account does with it, in the order
 * the deletion runs. A collection in COLLECTIONS that is neither here nor in
 * UID_FREE fails `accountDeletionCoverage.test.ts`, and so does a field that
 * looks like a uid on a covered collection's schema but no entry names.
 *
 * Order matters in three places: authored content is anonymised before
 * anything is deleted (a mid-way failure then leaves the user's own data, not
 * a half-credited village); push data goes before the rest so nothing reaches
 * a phone while the account is torn down; and the profile doc goes last.
 */
export const UID_CASCADE: readonly CascadeEntry[] = [
  // ── Authored content that stays the village's, without the author ─────────
  { id: 'news', action: 'anonymise', targets: [{ collection: 'news', fields: ['createdBy', 'organizerUserIds'] }], run: anonymiseNews },
  { id: 'events', action: 'anonymise', targets: [{ collection: 'events', fields: ['createdBy', 'organizerUserIds'] }], run: anonymiseEvents },
  {
    id: 'places',
    action: 'anonymise',
    targets: [{ collection: 'municipalityPlaces', fields: ['proposedBy', 'contributorUserIds'] }],
    run: anonymisePlaces,
  },
  { id: 'barrios', action: 'anonymise', targets: [{ collection: 'municipalityBarrios', fields: ['proposedBy'] }], run: anonymiseBarrios },
  {
    id: 'festival-posters',
    action: 'anonymise',
    targets: [{ collection: 'festivalPosters', fields: ['proposedBy', 'contributorUserIds'] }],
    run: anonymiseFestivalPosters,
  },
  { id: 'fiesta-editions', action: 'anonymise', targets: [{ collection: 'fiestaEditions', fields: ['proposedBy'] }], run: anonymiseFiestaEditions },
  {
    id: 'vocabulary-terms',
    action: 'anonymise',
    targets: [{ collection: 'vocabularyTerms', fields: ['createdBy', 'contributorUserIds'] }],
    run: anonymiseVocabularyTerms,
  },
  {
    id: 'vocabulary-definitions',
    action: 'anonymise',
    targets: [{ collection: 'vocabularyDefinitions', fields: ['createdBy', 'contributorUserIds'] }],
    run: anonymiseVocabularyDefinitions,
  },
  { id: 'history-entries', action: 'anonymise', targets: [{ collection: 'historyEntries', fields: ['createdBy'] }], run: anonymiseHistoryEntries },

  // ── Free text they wrote ──────────────────────────────────────────────────
  { id: 'comments', action: 'delete', targets: [{ collection: 'comments', fields: ['authorUserId'] }], run: deleteComments },
  {
    id: 'chat-messages',
    action: 'delete',
    targets: [
      { collection: 'organizationGeneralChat', fields: ['authorUid', 'replyTo.authorUid'] },
      { collection: 'organizationAvisoChat', fields: ['authorUid', 'replyTo.authorUid'] },
      { collection: 'organizationTaskComments', fields: ['authorUid', 'replyTo.authorUid'] },
      { collection: 'cosaRequestChat', fields: ['authorUid', 'replyTo.authorUid'] },
    ],
    run: deleteChatMessages,
  },
  {
    id: 'cosateca',
    action: 'delete',
    targets: [
      { collection: 'cosas', fields: ['ownerUid', 'createdBy', 'heldBy.uid'] },
      { collection: 'cosaSlots', fields: [] },
      { collection: 'cosaRequests', fields: ['ownerUid', 'requesterUid', 'holderUid'] },
    ],
    run: deleteCosateca,
  },

  // ── Personal data ─────────────────────────────────────────────────────────
  {
    id: 'push-data',
    action: 'delete',
    targets: [
      { collection: 'userDevices', fields: ['path'] },
      { collection: 'pushQueue', fields: ['userId'] },
      { collection: 'userGroupPrefs', fields: ['path'] },
      { collection: 'userPreferences', fields: ['path'] },
      { collection: 'userNotificationSettings', fields: ['path'] },
      { collection: 'userPrivacySettings', fields: ['path'] },
    ],
    run: deletePushData,
  },
  { id: 'socio-contacts', action: 'anonymise', targets: [{ collection: 'organizationSocioPrivate', fields: [] }], run: clearSocioContacts },
  {
    id: 'memberships',
    action: 'delete',
    targets: [
      { collection: 'municipalityMembers', fields: ['userId', 'id'] },
      { collection: 'organizationMembers', fields: ['userId', 'id'] },
    ],
    run: removeMemberships,
  },
  { id: 'join-requests', action: 'delete', targets: [{ collection: 'organizationJoinRequests', fields: ['userId', 'id'] }], run: deleteJoinRequests },
  {
    id: 'presence-requests',
    action: 'delete',
    targets: [{ collection: 'organizationPresenceRequests', fields: ['requestedBy'] }],
    run: deletePresenceRequests,
  },
  { id: 'persons', action: 'delete', targets: [{ collection: 'persons', fields: ['userId', 'createdBy'] }], run: deletePersons },
  {
    id: 'registrations',
    action: 'delete',
    targets: [
      { collection: 'eventRegistrations', fields: ['userId', 'personUserId'] },
      { collection: 'eventRegistrationPrivate', fields: [] },
    ],
    run: deleteRegistrations,
  },
  { id: 'seat-tokens', action: 'delete', targets: [{ collection: 'eventSeatTokens', fields: ['createdBy'] }], run: deleteSeatTokens },
  { id: 'notifications', action: 'delete', targets: [{ collection: 'userNotifications', fields: ['path'] }], run: deleteNotifications },
  { id: 'organizer-requests', action: 'delete', targets: [{ collection: 'organizerRequests', fields: ['userId'] }], run: deleteOrganizerRequests },
  {
    id: 'embajador-pointer',
    action: 'anonymise',
    targets: [{ collection: 'municipalities', fields: ['community.organizerId'] }],
    run: nullOrganizerPointers,
  },
  { id: 'censo-answers', action: 'delete', targets: [{ collection: 'censoAnswers', fields: ['userId'] }], run: deleteCensoAnswers },
  { id: 'blocked-users', action: 'delete', targets: [{ collection: 'userBlockedUsers', fields: ['path'] }], run: deleteBlockedUsers },
  { id: 'admin-grant', action: 'delete', targets: [{ collection: 'admins', fields: ['id'] }], run: deleteAdminGrant },
  { id: 'storage-photos', action: 'delete', targets: [], run: deleteStoragePhotos },
  { id: 'user-doc', action: 'delete', targets: [{ collection: 'users', fields: ['id'] }], run: deleteUserDoc },

  // ── Left to the projection that follows its source ────────────────────────
  {
    id: 'public-profile',
    action: 'trigger',
    targets: [{ collection: 'publicProfiles', fields: ['id'] }],
    reason: 'syncPublicProfile deletes publicProfiles/{uid} when users/{uid} is deleted.',
  },
  {
    id: 'village-people',
    action: 'trigger',
    targets: [{ collection: 'municipalityPeople', fields: ['userId'] }],
    reason: "syncMunicipalityPeople deletes a person's directory rows when the person is deleted.",
  },

  // ── Kept on purpose ───────────────────────────────────────────────────────
  {
    id: 'audit-logs',
    action: 'retain',
    targets: [
      { collection: 'membershipEvents', fields: ['actorUserId', 'targetUserId'] },
      { collection: 'eventRegistrationEvents', fields: ['actorUserId', 'subjectUserId'] },
      { collection: 'moderationEvents', fields: ['actorUserId'] },
    ],
    reason: AUDIT_LOG,
  },
  {
    id: 'moderation-and-review',
    action: 'retain',
    targets: [
      { collection: 'organizerRequests', fields: ['reviewedBy'] },
      { collection: 'organizations', fields: ['reviewedBy'] },
      { collection: 'news', fields: ['hiddenBy'] },
      { collection: 'municipalityBarrios', fields: ['hiddenBy'] },
      { collection: 'municipalityPlaces', fields: ['hiddenBy'] },
      { collection: 'festivalPosters', fields: ['hiddenBy'] },
      { collection: 'vocabularyTerms', fields: ['hiddenBy'] },
      { collection: 'vocabularyDefinitions', fields: ['hiddenBy'] },
      { collection: 'historyEntries', fields: ['hiddenBy'] },
    ],
    reason: `Who approved, rejected or hid someone else's content — a moderation decision, not the user's own data. ${AUDIT_LOG}`,
  },
  {
    id: 'content-reports',
    action: 'retain',
    targets: [{ collection: 'contentReports', fields: ['reporterUserId', 'targetAuthorUserId'] }],
    reason: `A report is the moderation team's case file, read only by app admins. ${AUDIT_LOG}`,
  },
  {
    id: 'libro-de-socios',
    action: 'retain',
    targets: [{ collection: 'organizationSocios', fields: ['uid', 'responsibleUid', 'createdBy'] }],
    reason:
      "Policy §7: the socio row (name, number, alta and baja) stays in the group's libro de socios, marked as baja — syncOrgSocioRoster sets bajaAt when the membership goes. Only the shared contact is erased (socio-contacts).",
  },
  {
    id: 'group-records',
    action: 'retain',
    targets: [
      { collection: 'organizations', fields: ['requestedBy'] },
      { collection: 'organizationTasks', fields: ['assigneeUids', 'claimedUids', 'waitlistUids', 'declinedUids', 'doneBy', 'createdBy'] },
      { collection: 'organizationTaskTemplates', fields: ['updatedBy'] },
      { collection: 'organizationTaskReminders', fields: ['recipientUid'] },
      { collection: 'organizationActas', fields: ['createdBy', 'updatedBy'] },
      { collection: 'organizationLedgerEntries', fields: ['recordedBy'] },
      { collection: 'organizationLedgerCategories', fields: ['createdBy'] },
      { collection: 'organizationCuotaSettings', fields: ['configuredBy'] },
      { collection: 'organizationCuotaAssignments', fields: ['updatedBy'] },
      { collection: 'organizationCuotaPayments', fields: ['recordedBy'] },
      { collection: 'organizationCuotaReminders', fields: ['recipientUid'] },
      { collection: 'organizationMessages', fields: ['recipientUids', 'sentBy'] },
      { collection: 'organizationMessageDeliveries', fields: ['uid', 'whatsappSentBy'] },
      { collection: 'organizationMessageReads', fields: ['id'] },
      { collection: 'organizationMessageVotes', fields: ['id'] },
      { collection: 'organizationChatThreads', fields: ['lastAuthorUid'] },
      { collection: 'organizationChatReads', fields: ['id'] },
    ],
    reason: GROUP_RECORD,
  },
  {
    id: 'chat-reactions',
    action: 'retain',
    targets: [
      { collection: 'organizationGeneralChat', fields: ['reactions'] },
      { collection: 'organizationAvisoChat', fields: ['reactions'] },
      { collection: 'organizationTaskComments', fields: ['reactions'] },
      { collection: 'cosaRequestChat', fields: ['reactions'] },
    ],
    reason:
      "A reaction on someone else's message is a map key (uid → emoji): no query finds a document by a map key, and the bare uid resolves to nobody once the account is gone.",
  },
  {
    id: 'other-peoples-data',
    action: 'retain',
    targets: [
      { collection: 'userNotifications', fields: ['requesterUid'] },
      { collection: 'userBlockedUsers', fields: ['blockedUserId'] },
      { collection: 'eventRegistrations', fields: ['groupOwnerId'] },
      { collection: 'eventSeatTokens', fields: ['consumedBy'] },
    ],
    reason:
      "Another user's own record that points at this one: their inbox, their block list, their registration in a group this user booked, a seat they claimed. Deleting it would erase their data; the pointer resolves to nobody.",
  },
  {
    id: 'village-wrapped',
    action: 'retain',
    targets: [{ collection: 'villageWrapped', fields: ['topOrganizers.[].userId'] }],
    reason:
      "A published post-fiestas summary of the village, computed once. Its top-organizer card names the organizer as of that fiesta; whether erasing an account should redact a past Wrapped is open (reported to the batch leader 2026-11-27).",
  },
];

/** A collection with no entry above, and why no uid can be in it. */
export const UID_FREE: Readonly<Partial<Record<CollectionKey, string>>> = {
  villageRankings: 'A computed ranking of villages: names and scores, no person.',
  organizationSocioPersonaLocks: "Keyed by persona id, holding a socio id; syncOrgSocioRoster removes it with the persona's socio row.",
  organizationSocioNumbering: "The group's last socio number.",
  occupations: 'The catalogue of occupation names and their counts.',
  vocabularyWords: 'The cross-village word index: words and village counts.',
  ambassadorLeads: 'The /embajadores web form: name and phone of someone without an account, never a uid.',
  config: 'App configuration (the force-update gate).',
  authEmailRateLimits: 'Keyed by a hash of the email or IP; holds a count and a window.',
  authOtpCodes: 'Keyed by a hash of the email; holds a code hash that expires in minutes.',
  settlementSeeds: 'OSM reference data per INE code.',
};

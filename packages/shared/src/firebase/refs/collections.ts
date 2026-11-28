// packages/shared/src/firebase/refs/collections.ts
//
// The one place a Firestore collection is declared: its path, the Zod schema
// its documents parse with, and whether any client may reach it. Imports
// neither SDK. `refs/client.ts` and `refs/admin.ts` bind these entries to their
// own SDK, and the conformance gate (scripts/check-dev-conformance.mjs) walks
// every entry with a schema, subcollections included — so a collection added
// here is gated before its first promotion, with nothing else to remember.
//
// A path is a template: literal segments, and `{name}` for each parent id, in
// order. The parent ids a factory takes are typed from it (`PathParams`).
import type { z } from 'zod';
import { EventDataSchema } from '../../models/event/EventDataModel';
import { RegistrationDataSchema } from '../../models/event/RegistrationDataModel';
import { RegistrationEventDataSchema } from '../../models/event/RegistrationEventDataModel';
import { SeatTokenDataSchema } from '../../models/event/SeatTokenModel';
import { BarrioDataSchema, MunicipalityDataSchema, PlaceDataSchema } from '../../models/municipality/MunicipalityDataModel';
import { VillageMemberDataSchema } from '../../models/municipality/VillageMemberDataModel';
import { CensoAnswersDataSchema } from '../../models/municipality/CensoAnswersDataModel';
import { MunicipalityPersonDataSchema } from '../../models/municipality/MunicipalityPersonDataModel';
import { OrganizerRequestDataSchema } from '../../models/municipality/OrganizerRequestDataModel';
import { VillageRankingDataSchema } from '../../models/municipality/VillageRankingDataModel';
import { OrganizationDataSchema } from '../../models/organization/OrganizationDataModel';
import { OrgMemberDataSchema } from '../../models/organization/OrgMemberDataModel';
import { OrgJoinRequestDataSchema } from '../../models/organization/OrgJoinRequestDataModel';
import { OrgPresenceRequestDataSchema } from '../../models/organization/OrgPresenceRequestDataModel';
import {
  SocioDataSchema,
  SocioNumberingDataSchema,
  SocioPersonaLockDataSchema,
  SocioPrivateDataSchema,
} from '../../models/organization/SocioDataModel';
import {
  CuotaAssignmentDataSchema,
  CuotaPaymentDataSchema,
  CuotaReminderDataSchema,
  CuotaSettingsDataSchema,
} from '../../models/organization/CuotaDataModel';
import { GroupTaskDataSchema, TaskReminderDataSchema, TaskTemplateDataSchema } from '../../models/organization/GroupTaskDataModel';
import { ActaDataSchema, LedgerEntryDataSchema } from '../../models/organization/RecordsDataModel';
import { LedgerCategoryDataSchema } from '../../models/organization/LedgerCategoryDataModel';
import {
  GroupMessageDataSchema,
  GroupMessageDeliveryDataSchema,
  GroupMessageReadDataSchema,
  GroupPollVoteDataSchema,
} from '../../models/organization/GroupMessageDataModel';
import {
  GroupChatMessageDataSchema,
  GroupChatReadDataSchema,
  GroupChatThreadDataSchema,
} from '../../models/organization/GroupChatDataModel';
import { CosaDataSchema, CosaSlotDataSchema } from '../../models/organization/CosaDataModel';
import { CosaRequestDataSchema } from '../../models/organization/CosaRequestDataModel';
import { PersonDataSchema } from '../../models/person/PersonDataModel';
import { UserDataSchema } from '../../models/user/UserDataModel';
import { PublicProfileDataSchema } from '../../models/user/PublicProfileDataModel';
import { BlockedUserDataSchema } from '../../models/user/BlockedUserDataModel';
import { PrivacySettingsDataSchema } from '../../models/user/PrivacySettingsDataModel';
import { NotificationDataSchema } from '../../models/notification/NotificationDataModel';
import { DeviceTokenDataSchema } from '../../models/notification/DeviceTokenDataModel';
import { GroupNotificationPrefsDataSchema, NotificationPrefsDataSchema } from '../../models/notification/NotificationPrefsDataModel';
import { NotificationSettingsDataSchema } from '../../models/notification/NotificationSettingsDataModel';
import { PushQueueDataSchema } from '../../models/notification/PushQueueDataModel';
import { NewsPostDataSchema } from '../../models/news/NewsPostDataModel';
import { CommentDataSchema } from '../../models/interaction/CommentDataModel';
import { FestivalPosterDataSchema } from '../../models/festivalPoster/FestivalPosterDataModel';
import { FiestaEditionDataSchema } from '../../models/fiesta/FiestaEditionModel';
import { OccupationDataSchema } from '../../models/occupation/OccupationDataModel';
import { MembershipEventDataSchema } from '../../models/membership/MembershipEventDataModel';
import { ModerationEventDataSchema } from '../../models/moderation/ModerationEventDataModel';
import { ContentReportDataSchema } from '../../models/moderation/ContentReportDataModel';
import { AmbassadorLeadDataSchema } from '../../models/ambassadorLead/AmbassadorLeadDataModel';
import { AdminDataSchema } from '../../models/admin/AdminDataModel';
import { VocabularyTermDataSchema } from '../../models/vocabulary/VocabularyTermDataModel';
import { VocabularyDefinitionDataSchema } from '../../models/vocabulary/VocabularyDefinitionDataModel';
import { VocabularyWordDataSchema } from '../../models/vocabulary/VocabularyWordDataModel';
import { HistoryEntryDataSchema } from '../../models/history/HistoryEntryDataModel';
import { WrappedDataSchema } from '../../models/wrapped/WrappedDataModel';
import { AppVersionConfigSchema } from '../../models/config/AppVersionConfigModel';
import { AuthEmailRateLimitDataSchema } from '../../models/auth/AuthEmailRateLimitDataModel';
import { AuthOtpCodeDataSchema } from '../../models/auth/AuthOtpCodeDataModel';

export interface CollectionDef<
  P extends string = string,
  S extends z.ZodType | null = z.ZodType | null,
  ServerOnly extends boolean = boolean,
> {
  readonly path: P;
  /** What every document parses with, or `null` for a collection whose shape no fixed model describes. */
  readonly schema: S;
  /** `firestore.rules` denies every client read and write: `refs/client.ts` cannot bind it. */
  readonly serverOnly: ServerOnly;
}

/** A collection whose documents parse with a schema — the ones a converter attaches to. */
export type TypedCollectionDef<ServerOnly extends boolean = boolean> = CollectionDef<string, z.ZodType, ServerOnly>;

/** The parent ids a path template takes, in order: `'a/{x}/b/{y}/c'` → `[string, string]`. */
export type PathParams<P extends string> = P extends `${string}{${string}}${infer Rest}`
  ? [string, ...PathParams<Rest>]
  : [];

/** The model a schema-bearing entry's documents parse into. */
export type ModelOf<D> = D extends CollectionDef<string, infer S>
  ? S extends z.ZodType ? z.infer<S> : never
  : never;

const def = <const P extends string, S extends z.ZodType | null>(path: P, schema: S): CollectionDef<P, S, false> =>
  ({ path, schema, serverOnly: false });

const serverOnly = <const P extends string, S extends z.ZodType | null>(path: P, schema: S): CollectionDef<P, S, true> =>
  ({ path, schema, serverOnly: true });

export const COLLECTIONS = {
  // ── Events ───────────────────────────────────────────────────────────────
  events: def('events', EventDataSchema),
  eventRegistrations: def('events/{eventId}/registrations', RegistrationDataSchema),
  // Organizer-only PII for one registration (phone, signup-field answers). Its
  // answer map is shaped by the event's field specs, so no fixed model.
  eventRegistrationPrivate: def('events/{eventId}/registrationPrivate', null),
  eventSeatTokens: def('events/{eventId}/seatTokens', SeatTokenDataSchema),
  eventRegistrationEvents: def('events/{eventId}/registrationEvents', RegistrationEventDataSchema),

  // ── Municipalities ───────────────────────────────────────────────────────
  municipalities: def('municipalities', MunicipalityDataSchema),
  municipalityBarrios: def('municipalities/{municipalityId}/barrios', BarrioDataSchema),
  municipalityPlaces: def('municipalities/{municipalityId}/places', PlaceDataSchema),
  municipalityMembers: def('municipalities/{municipalityId}/members', VillageMemberDataSchema),
  censoAnswers: def('censoAnswers', CensoAnswersDataSchema),
  municipalityPeople: def('municipalityPeople', MunicipalityPersonDataSchema),
  organizerRequests: def('organizerRequests', OrganizerRequestDataSchema),
  villageWrapped: def('villageWrapped', WrappedDataSchema),
  villageRankings: def('villageRankings', VillageRankingDataSchema),

  // ── Organizations ────────────────────────────────────────────────────────
  organizations: def('organizations', OrganizationDataSchema),
  organizationMembers: def('organizations/{organizationId}/members', OrgMemberDataSchema),
  organizationJoinRequests: def('organizations/{organizationId}/joinRequests', OrgJoinRequestDataSchema),
  organizationPresenceRequests: def('organizations/{organizationId}/presenceRequests', OrgPresenceRequestDataSchema),
  organizationSocios: def('organizations/{organizationId}/socios', SocioDataSchema),
  organizationSocioPrivate: def('organizations/{organizationId}/socioPrivate', SocioPrivateDataSchema),
  organizationSocioPersonaLocks: def('organizations/{organizationId}/socioPersonaLocks', SocioPersonaLockDataSchema),
  organizationSocioNumbering: serverOnly('organizations/{organizationId}/socioNumbering', SocioNumberingDataSchema),
  organizationCuotaSettings: def('organizations/{organizationId}/cuotaSettings', CuotaSettingsDataSchema),
  organizationCuotaAssignments: def('organizations/{organizationId}/cuotaAssignments', CuotaAssignmentDataSchema),
  organizationCuotaPayments: def('organizations/{organizationId}/cuotaPayments', CuotaPaymentDataSchema),
  organizationCuotaReminders: def('organizations/{organizationId}/cuotaReminders', CuotaReminderDataSchema),
  organizationTasks: def('organizations/{organizationId}/tasks', GroupTaskDataSchema),
  organizationTaskComments: def('organizations/{organizationId}/tasks/{taskId}/chat', GroupChatMessageDataSchema),
  organizationTaskTemplates: def('organizations/{organizationId}/taskTemplates', TaskTemplateDataSchema),
  organizationTaskReminders: def('organizations/{organizationId}/taskReminders', TaskReminderDataSchema),
  organizationActas: def('organizations/{organizationId}/actas', ActaDataSchema),
  organizationLedgerEntries: def('organizations/{organizationId}/ledgerEntries', LedgerEntryDataSchema),
  organizationLedgerCategories: def('organizations/{organizationId}/ledgerCategories', LedgerCategoryDataSchema),
  organizationMessages: def('organizations/{organizationId}/messages', GroupMessageDataSchema),
  organizationMessageDeliveries: def('organizations/{organizationId}/messages/{messageId}/deliveries', GroupMessageDeliveryDataSchema),
  organizationMessageReads: def('organizations/{organizationId}/messages/{messageId}/reads', GroupMessageReadDataSchema),
  organizationMessageVotes: def('organizations/{organizationId}/messages/{messageId}/votes', GroupPollVoteDataSchema),
  // The general thread's chat, and an aviso's under its message.
  organizationGeneralChat: def('organizations/{organizationId}/chat', GroupChatMessageDataSchema),
  organizationAvisoChat: def('organizations/{organizationId}/messages/{messageId}/chat', GroupChatMessageDataSchema),
  organizationChatThreads: def('organizations/{organizationId}/chatThreads', GroupChatThreadDataSchema),
  organizationChatReads: def('organizations/{organizationId}/chatThreads/{threadId}/reads', GroupChatReadDataSchema),

  // ── Cosateca ─────────────────────────────────────────────────────────────
  cosas: def('cosas', CosaDataSchema),
  cosaSlots: def('cosas/{cosaId}/slots', CosaSlotDataSchema),
  cosaRequests: def('cosaRequests', CosaRequestDataSchema),
  cosaRequestChat: def('cosaRequests/{requestId}/chat', GroupChatMessageDataSchema),

  // ── People and users ─────────────────────────────────────────────────────
  persons: def('persons', PersonDataSchema),
  users: def('users', UserDataSchema),
  publicProfiles: def('publicProfiles', PublicProfileDataSchema),
  userNotifications: def('users/{userId}/notifications', NotificationDataSchema),
  userDevices: def('users/{userId}/devices', DeviceTokenDataSchema),
  // Rules admit exactly one doc here (`notifications`), so the whole
  // collection shares its schema.
  userPreferences: def('users/{userId}/preferences', NotificationPrefsDataSchema),
  userNotificationSettings: def('users/{userId}/notificationSettings', NotificationSettingsDataSchema),
  userGroupPrefs: def('users/{userId}/groupPrefs', GroupNotificationPrefsDataSchema),
  userBlockedUsers: def('users/{userId}/blockedUsers', BlockedUserDataSchema),
  // Rules admit exactly one doc here (`account`); absent means "not asked yet".
  userPrivacySettings: def('users/{userId}/privacySettings', PrivacySettingsDataSchema),
  pushQueue: serverOnly('pushQueue', PushQueueDataSchema),

  // ── Content ──────────────────────────────────────────────────────────────
  news: def('news', NewsPostDataSchema),
  comments: def('comments', CommentDataSchema),
  festivalPosters: def('festivalPosters', FestivalPosterDataSchema),
  fiestaEditions: def('fiestaEditions', FiestaEditionDataSchema),
  occupations: def('occupations', OccupationDataSchema),
  vocabularyTerms: def('vocabularyTerms', VocabularyTermDataSchema),
  vocabularyDefinitions: def('vocabularyDefinitions', VocabularyDefinitionDataSchema),
  vocabularyWords: def('vocabularyWords', VocabularyWordDataSchema),
  historyEntries: def('historyEntries', HistoryEntryDataSchema),

  // ── Audit logs, moderation, admin ────────────────────────────────────────
  membershipEvents: def('membershipEvents', MembershipEventDataSchema),
  moderationEvents: def('moderationEvents', ModerationEventDataSchema),
  contentReports: def('contentReports', ContentReportDataSchema),
  ambassadorLeads: def('ambassadorLeads', AmbassadorLeadDataSchema),
  admins: def('admins', AdminDataSchema),
  // Public, read by every client, written only by scripts and the announce
  // poller. Its one doc is `appVersion` (the force-update gate), so the whole
  // collection shares that schema.
  config: def('config', AppVersionConfigSchema),

  // ── Sign-in (pre-auth infrastructure, functions only) ────────────────────
  authEmailRateLimits: serverOnly('authEmailRateLimits', AuthEmailRateLimitDataSchema),
  authOtpCodes: serverOnly('authOtpCodes', AuthOtpCodeDataSchema),

  // OSM settlement reference data per INE code, under `_admin/**` (denied to
  // every client). Raw OSM payload, so no model.
  settlementSeeds: serverOnly('_admin/{settlementsDoc}/seeds', null),
} as const;

export type CollectionKey = keyof typeof COLLECTIONS;

/**
 * Fill a path template's `{…}` segments with `ids`, in order. Throws on an
 * arity mismatch — the factories' types make that unreachable from TypeScript,
 * so it only guards JS callers.
 */
export function collectionSegments(path: string, ids: readonly string[]): [string, ...string[]] {
  const segments = path.split('/');
  const params = segments.filter((segment) => segment.startsWith('{')).length;
  if (params !== ids.length) {
    throw new Error(`Collection path ${path} takes ${String(params)} parent id(s), got ${String(ids.length)}`);
  }
  let next = 0;
  return segments.map((segment) => (segment.startsWith('{') ? ids[next++] : segment)) as [string, ...string[]];
}

/** The id a collection-group query over this collection uses: its last segment. */
export function collectionId(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

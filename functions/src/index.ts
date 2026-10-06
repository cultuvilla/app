// Must be the first import: initializes the Admin SDK before any handler module
// (which call getFirestore() at top-level) evaluates. See initApp.ts.
import './initApp';

// Events
export { registerToEvent } from './events/registerToEvent';
export { addWalkInRegistration } from './events/addWalkInRegistration';
export { claimEventSeat } from './events/claimEventSeat';
export { cancelRegistration } from './events/cancelRegistration';
export { completeExpiredEvents } from './events/eventCompletion';
export { onRegistrationDeleted } from './events/waitlistPromotion';
export { onEventUpdated } from './events/notificationTriggers';
export { sendEventReminders } from './events/eventReminders';

// Village (memberships, organizer requests, invites, denormalization)
export { startVillage } from './village/startVillage';
export { updateVillageInfo } from './village/updateVillageInfo';
export { requestOrganizeVillage } from './village/requestOrganizeVillage';
export { respondToOrganizerRequest } from './village/respondToOrganizerRequest';
export { changeVillageMemberRole } from './village/changeVillageMemberRole';
export { transferVillageAmbassador } from './village/transferVillageAmbassador';
export { syncVillageDenormalization } from './village/syncVillageDenormalization';
export { syncMemberBarrioToResidence } from './village/syncMemberBarrioToResidence';
export { purgeMemberCensoAnswers } from './village/purgeMemberCensoAnswers';
export { syncBarrioResidentCount } from './village/syncBarrioResidentCount';
export { syncPlaceBurialCount } from './village/syncPlaceBurialCount';
export { syncMunicipalityPeople } from './village/syncMunicipalityPeople';

// Organizations (ayuntamiento singleton enforcement)
export { requestAyuntamiento } from './organizations/requestAyuntamiento';
export { approveOrganization } from './organizations/approveOrganization';
export { changeOrgMemberRole } from './organizations/changeOrgMemberRole';
export { respondToOrgJoinRequest } from './organizations/respondToOrgJoinRequest';
export { onOrgJoinRequestCreated } from './organizations/onOrgJoinRequestCreated';
export { syncOrgMemberCount } from './organizations/syncOrgMemberCount';
export { onOrganizationUpdated } from './organizations/notificationTriggers';

// Push notifications. onNotificationCreated is the ONLY seam between the
// notification log and a device: every producer just writes a notification doc.
export { onNotificationCreated } from './push/onNotificationCreated';
export { flushPushQueue } from './push/flushPushQueue';

// "Something new appeared in your village" — one broadcast per entity kind.
export {
  onEventPublished,
  onNewsPublished,
  onHistoryEntryPublished,
  onFestivalPosterPublished,
  onPlacePublished,
  onBarrioPublished,
} from './village/entityPublishedTriggers';

// Census (censo)
export { updateCenso } from './census/updateCenso';

// Users (profile + persona denormalization)
export { syncPersonDenormalization } from './users/syncPersonDenormalization';
export { syncPublicProfile } from './users/syncPublicProfile';

// Account (deletion lifecycle)
export { checkAccountDeletable } from './account/checkAccountDeletable';
export { deleteAccount } from './account/deleteAccount';

// News (posts)
export { deleteNewsPost } from './news/deleteNewsPost';

// Content moderation (hide/unhide across news, festival posters, barrios, places)
export { setContentVisibility } from './moderation/setContentVisibility';

// Interaction (entity comment count sync + view count callable, entityKind-routed)
export { syncEntityCommentCount } from './interaction/syncEntityInteractionCounts';
export { syncVocabularyDefinitionCount } from './vocabulary/syncVocabularyDefinitionCount';
export { syncVocabularyWordIndex } from './vocabulary/syncVocabularyWordIndex';
export { recordEntityView } from './interaction/recordEntityView';

// Share-link Open Graph preview renderer (HTTPS function behind a Hosting rewrite).
export { sitemap } from './seo/sitemap';
export { readSite } from './web/readSite';

// Maps (Google Static Maps proxy + geocoding — key stays server-side)
export { staticMap } from './maps/staticMap';
export { geocodeSearch } from './maps/geocodeSearch';
export { reverseGeocode } from './maps/reverseGeocode';

// Auth (branded sign-in email delivery via Resend)
// sendAuthSignInEmail/completeReauth's link mechanism is used only by the
// changeEmail re-authentication step now — sign-in itself uses the OTP pair.
export { sendAuthSignInEmail } from './auth/sendAuthSignInEmail';
export { sendAuthOtpCode } from './auth/sendAuthOtpCode';
export { verifyAuthOtpCode } from './auth/verifyAuthOtpCode';

// Observability (client error ingestion + pseudonymized identity)
export { logClientError } from './observability/logClientError';
export { getBusinessSnapshot } from './business/getBusinessSnapshot';
export { getUserIdHash } from './observability/getUserIdHash';

// Image variants (downscaled WebP renditions written beside every upload, so
// cards fetch tens of kilobytes instead of the full-size original)
export { generateImageVariants } from './images/generateImageVariants';
export {
  cleanupRemovedBarrioImages,
  cleanupRemovedEventImages,
  cleanupRemovedFestivalPosterImages,
  cleanupRemovedHistoryEntryImages,
  cleanupRemovedNewsImages,
  cleanupRemovedOrganizationImages,
  cleanupRemovedPlaceImages,
} from './images/cleanupRemovedImages';

// Village Wrapped (post-fiestas summary cards: built and offered to the
// village admins when a fiestas block ends, published on a timer if nobody acts)
export { buildVillageWrapped } from './wrapped/buildVillageWrapped';
export { respondToVillageWrapped } from './wrapped/respondToVillageWrapped';
export { runVillageWrappedLifecycle } from './wrapped/wrappedScheduler';

// The routing table of the callable gateway: every callable `index.ts` exports
// that `isServedByCallableGateway` admits, keyed by the name a client calls it
// by. `callableGatewayRoutes.test.ts` holds this table, `index.ts` and the
// shared list to one answer.
//
// The imports are explicit on purpose: a registry filled as a side effect of
// `defineCallable` would make the gateway's bundle depend on import order, and
// a reader could not see what it serves.
import type { HttpsFunction } from 'firebase-functions/v2/https';

import { checkAccountDeletable } from '../account/checkAccountDeletable';
import { restoreLegacySession } from '../auth/restoreLegacySession';
import { sendAuthOtpCode } from '../auth/sendAuthOtpCode';
import { sendAuthSignInEmail } from '../auth/sendAuthSignInEmail';
import { verifyAuthOtpCode } from '../auth/verifyAuthOtpCode';
import { getBusinessSnapshot } from '../business/getBusinessSnapshot';
import { updateCenso } from '../census/updateCenso';
import { addWalkInRegistration } from '../events/addWalkInRegistration';
import { cancelRegistration } from '../events/cancelRegistration';
import { claimEventSeat } from '../events/claimEventSeat';
import { registerToEvent } from '../events/registerToEvent';
import { geocodeSearch } from '../maps/geocodeSearch';
import { reverseGeocode } from '../maps/reverseGeocode';
import { setContentVisibility } from '../moderation/setContentVisibility';
import { deleteNewsPost } from '../news/deleteNewsPost';
import { getUserIdHash } from '../observability/getUserIdHash';
import { approveOrganization } from '../organizations/approveOrganization';
import { bookReservaSlot } from '../organizations/bookReservaSlot';
import { changeOrgMemberRole } from '../organizations/changeOrgMemberRole';
import { getGroupTransparency } from '../organizations/getGroupTransparency';
import { linkSocioToMember } from '../organizations/linkSocioToMember';
import { nudgeGroupMessage } from '../organizations/nudgeGroupMessage';
import { requestAyuntamiento } from '../organizations/requestAyuntamiento';
import { respondToCosaRequest } from '../organizations/respondToCosaRequest';
import { respondToOrgJoinRequest } from '../organizations/respondToOrgJoinRequest';
import { respondToOrgPresenceRequest } from '../organizations/respondToOrgPresenceRequest';
import { removeOrgPresence } from '../organizations/removeOrgPresence';
import { respondToTaskShift } from '../organizations/respondToTaskShift';
import { setReservaBlackouts } from '../organizations/setReservaBlackouts';
import { approveStudioPairing, claimStudioPairing, createStudioPairing, inspectStudioPairing } from '../studio/studioPairing';
import { changeVillageMemberRole } from '../village/changeVillageMemberRole';
import { requestOrganizeVillage } from '../village/requestOrganizeVillage';
import { respondToOrganizerRequest } from '../village/respondToOrganizerRequest';
import { startVillage } from '../village/startVillage';
import { transferVillageAmbassador } from '../village/transferVillageAmbassador';
import { updateVillageInfo } from '../village/updateVillageInfo';
import { respondToVillageWrapped } from '../wrapped/respondToVillageWrapped';

const ROUTED_CALLABLES: Record<string, HttpsFunction> = {
  addWalkInRegistration,
  approveOrganization,
  approveStudioPairing,
  bookReservaSlot,
  cancelRegistration,
  changeOrgMemberRole,
  changeVillageMemberRole,
  checkAccountDeletable,
  claimEventSeat,
  claimStudioPairing,
  createStudioPairing,
  deleteNewsPost,
  geocodeSearch,
  getBusinessSnapshot,
  getGroupTransparency,
  getUserIdHash,
  inspectStudioPairing,
  linkSocioToMember,
  nudgeGroupMessage,
  registerToEvent,
  requestAyuntamiento,
  requestOrganizeVillage,
  respondToCosaRequest,
  respondToOrgJoinRequest,
  respondToOrgPresenceRequest,
  removeOrgPresence,
  respondToOrganizerRequest,
  respondToTaskShift,
  respondToVillageWrapped,
  restoreLegacySession,
  reverseGeocode,
  sendAuthOtpCode,
  sendAuthSignInEmail,
  setContentVisibility,
  setReservaBlackouts,
  startVillage,
  transferVillageAmbassador,
  updateCenso,
  updateVillageInfo,
  verifyAuthOtpCode,
};

export const CALLABLE_GATEWAY_ROUTES: ReadonlyMap<string, HttpsFunction> = new Map(Object.entries(ROUTED_CALLABLES));

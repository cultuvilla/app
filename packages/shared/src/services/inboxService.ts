// packages/shared/src/services/inboxService.ts
import { getMyOrganizerRequests, getPendingOrganizerRequests } from './organizerRequestService';
import {
  getMyOrganizations,
  getOrganizationsByMunicipality,
  getPendingOrganizations,
} from './organizationService';
import { getMyPendingOrgJoinRequests, getPendingOrgJoinRequests } from './orgJoinRequestService';
import { getOpenReports, getReportsByMunicipality, type ContentReport } from './contentReportService';
import { getMyPendingCosaRequests } from './cosatecaService';
import { observability } from './observability/observabilityService';
import type { NotificationData } from '../models/notification/NotificationDataModel';
import type { OrganizerRequestData } from '../models/municipality/OrganizerRequestDataModel';
import type { OrganizationData } from '../models/organization/OrganizationDataModel';
import type { OrgJoinRequestData } from '../models/organization/OrgJoinRequestDataModel';

export type PendingRequestType = 'organizer' | 'org' | 'orgJoin' | 'cosa';

export type ActivityItem =
  | { kind: 'notification'; id: string; notification: NotificationData & { id: string } }
  | { kind: 'pending-sent'; id: string; requestType: PendingRequestType; label: string; createdAt: Date };

export interface InboxFeed {
  activity: ActivityItem[];
}

export interface PendingSentRequest {
  requestType: PendingRequestType;
  id: string;
  label: string;
  createdAt: Date;
}

function activityTimestamp(item: ActivityItem): number {
  return item.kind === 'notification' ? item.notification.createdAt.getTime() : item.createdAt.getTime();
}

/**
 * Merges the notification log and the user's own still-pending sent requests
 * into one list, sorted by createdAt descending. Pure — no I/O.
 */
export function buildActivityFeed(
  notifications: (NotificationData & { id: string })[],
  pendingSent: PendingSentRequest[],
): ActivityItem[] {
  const notificationItems: ActivityItem[] = notifications.map((notification) => ({
    kind: 'notification',
    id: notification.id,
    notification,
  }));
  const pendingSentItems: ActivityItem[] = pendingSent.map((request) => ({
    kind: 'pending-sent',
    id: request.id,
    requestType: request.requestType,
    label: request.label,
    createdAt: request.createdAt,
  }));

  return [...notificationItems, ...pendingSentItems].sort(
    (a, b) => activityTimestamp(b) - activityTimestamp(a),
  );
}

/**
 * Fetches the user's own pending "sent" requests across the request types.
 * Labels use only fields already present on the request doc — no extra
 * name-resolution reads (the screen resolves ids to names): a municipalityId
 * for `organizer`, the org name for `org`, the orgId for `orgJoin`, the cosa's
 * title for `cosa`.
 */
export async function getMyPendingRequests(uid: string): Promise<PendingSentRequest[]> {
  const [organizerRequests, organizations, joinRequests, cosaRequests] = await Promise.all([
    getMyOrganizerRequests(uid),
    getMyOrganizations(uid),
    getMyPendingOrgJoinRequests(uid),
    // One unreadable list must not blank the rest of the Buzón — but it is reported.
    getMyPendingCosaRequests(uid).catch((err: unknown) => {
      observability.captureError(err, { operation: 'inbox:getMyPendingCosaRequests' });
      return [];
    }),
  ]);

  const pendingOrganizer: PendingSentRequest[] = organizerRequests
    .filter((r) => r.status === 'pending')
    .map((r) => ({
      requestType: 'organizer' as const,
      id: r.id,
      label: r.municipalityId,
      createdAt: r.requestedAt,
    }));

  const pendingOrg: PendingSentRequest[] = organizations
    .filter((r) => r.status === 'pending')
    .map((r) => ({
      requestType: 'org' as const,
      id: r.id,
      label: r.name,
      createdAt: r.createdAt,
    }));

  // A join request exists only while pending — resolving it deletes it.
  const pendingJoin: PendingSentRequest[] = joinRequests.map((r) => ({
    requestType: 'orgJoin' as const,
    id: `${r.orgId}_${r.userId}`,
    label: r.orgId,
    createdAt: r.createdAt,
  }));

  const pendingCosa: PendingSentRequest[] = cosaRequests.map((r) => ({
    requestType: 'cosa' as const,
    id: r.id,
    label: r.cosaTitle,
    createdAt: r.createdAt,
  }));

  return [...pendingOrganizer, ...pendingOrg, ...pendingJoin, ...pendingCosa];
}

// ─── Actionable queues ("Necesita tu acción") ─────────────────────────────────
//
// The one definition of which request queues an approver reads and how widely.
// The Buzón and the header bell's badge both go through it, so a new request
// type is added here once. The cosateca queue is deliberately not a kind: it
// is not an approver's queue (anyone who offered something answers it) and it
// is read live by `watchCosaRequestsToAnswer`.

export type ActionableKind = 'organizer' | 'orgs' | 'joins' | 'reports';

const ACTIONABLE_KINDS: readonly ActionableKind[] = ['organizer', 'orgs', 'joins', 'reports'];

/** Every village (`'all'`), or only the listed ones. */
export type VillageReach = 'all' | string[];

export interface ActionableScope {
  /** Organizer (Embajador) requests: super admins only. */
  organizer: boolean;
  /** Org-creation requests. */
  orgs: VillageReach;
  /** Join requests, per org the user administers. */
  joins: string[];
  /** Open content reports. */
  reports: VillageReach;
}

export interface ApproverRoles {
  isSuperAdmin: boolean;
  adminVillageIds: string[];
  adminOrgIds: string[];
}

export interface ActionableRequests {
  organizer: (OrganizerRequestData & { id: string })[];
  orgs: (OrganizationData & { id: string })[];
  joins: OrgJoinRequestData[];
  reports: ContentReport[];
}

/** Maps what a user administers to the queues they resolve. Pure — no I/O. */
export function actionableScope(roles: ApproverRoles): ActionableScope {
  const villages: VillageReach = roles.isSuperAdmin ? 'all' : [...roles.adminVillageIds];
  return {
    organizer: roles.isSuperAdmin,
    orgs: villages,
    joins: [...roles.adminOrgIds],
    reports: villages,
  };
}

async function readOrganizer(scope: ActionableScope): Promise<ActionableRequests['organizer']> {
  return scope.organizer ? getPendingOrganizerRequests() : [];
}

// One village's failed org-creation read fails the whole call, as it always has.
async function readOrgs(scope: ActionableScope): Promise<ActionableRequests['orgs']> {
  if (scope.orgs === 'all') return getPendingOrganizations();
  const perVillage = await Promise.all(
    scope.orgs.map((vid) => getOrganizationsByMunicipality(vid, 'pending')),
  );
  return perVillage.flat();
}

// Per org, each allowed to fail alone: one org's denied read must not hide
// every other org's requests.
async function readJoins(scope: ActionableScope): Promise<OrgJoinRequestData[]> {
  const perOrg = await Promise.all(
    scope.joins.map((oid) => getPendingOrgJoinRequests(oid).catch((): OrgJoinRequestData[] => [])),
  );
  return perOrg.flat();
}

async function readReports(scope: ActionableScope): Promise<ContentReport[]> {
  if (scope.reports === 'all') return getOpenReports();
  const perVillage = await Promise.all(
    scope.reports.map((vid) =>
      getReportsByMunicipality(vid, { status: 'open' }).catch((): ContentReport[] => []),
    ),
  );
  return perVillage.flat();
}

/**
 * Reads the actionable queues `scope` covers, limited to `kinds` (all of them
 * by default). A kind left out, or out of scope, comes back empty without a
 * read. An organizer, org-creation or app-wide reports read that fails
 * rejects the call; a single org's join read or a single village's reports
 * read that fails counts as empty.
 */
export async function getActionableRequests(
  scope: ActionableScope,
  kinds: readonly ActionableKind[] = ACTIONABLE_KINDS,
): Promise<ActionableRequests> {
  const wants = (kind: ActionableKind) => kinds.includes(kind);
  const [organizer, orgs, joins, reports] = await Promise.all([
    wants('organizer') ? readOrganizer(scope) : [],
    wants('orgs') ? readOrgs(scope) : [],
    wants('joins') ? readJoins(scope) : [],
    wants('reports') ? readReports(scope) : [],
  ]);
  return { organizer, orgs, joins, reports };
}

/**
 * How many requests need the user's action: one per request, one per open
 * report. The bell's badge and the Buzón's list both count this way, so the
 * number on the bell is what *Necesita tu acción* holds. Pure — no I/O.
 */
/** Only the queue lengths are read, so any list of each queue counts. */
export function actionableCount(requests: { readonly [K in keyof ActionableRequests]: readonly unknown[] }): number {
  return requests.organizer.length + requests.orgs.length + requests.joins.length + requests.reports.length;
}

// packages/shared/src/services/inboxService.ts
import { getMyOrganizerRequests } from './organizerRequestService';
import { getMyOrganizations } from './organizationService';
import { getMyPendingOrgJoinRequests } from './orgJoinRequestService';
import type { NotificationData } from '../models/notification/NotificationDataModel';

export type PendingRequestType = 'organizer' | 'org' | 'orgJoin';

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
 * for `organizer`, the org name for `org`, the orgId for `orgJoin`.
 */
export async function getMyPendingRequests(uid: string): Promise<PendingSentRequest[]> {
  const [organizerRequests, organizations, joinRequests] = await Promise.all([
    getMyOrganizerRequests(uid),
    getMyOrganizations(uid),
    getMyPendingOrgJoinRequests(uid),
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

  return [...pendingOrganizer, ...pendingOrg, ...pendingJoin];
}

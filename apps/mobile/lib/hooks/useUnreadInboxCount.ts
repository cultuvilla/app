import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { useApproverStatus } from '../auth/useApproverStatus';
import { useWatch } from './useWatch';
import { watchUnreadCount } from '@cultuvilla/shared/services/notificationService';
import { getPendingOrganizerRequests } from '@cultuvilla/shared/services/organizerRequestService';
import {
  getPendingOrganizations,
  getOrganizationsByMunicipality,
} from '@cultuvilla/shared/services/organizationService';

export type UseUnreadInboxCountResult = {
  count: number;
  refresh: () => void;
};

/**
 * Badge count for the header bell: unread notifications plus pending-actionable
 * rows (organizer requests, org-creation requests) for whatever role(s) this
 * user approves for — mirrors the role-branching in
 * apps/mobile/app/inbox/index.tsx so the badge and the Buzón screen never
 * disagree about what counts as "actionable".
 *
 * The unread part is a live listener, so it answers offline from the device
 * cache and moves the moment a notification lands or is read. The pending
 * requests stay a one-shot read that `refresh` re-runs (the header does on
 * focus): they are an approver's, and change when someone else acts.
 */
export function useUnreadInboxCount(): UseUnreadInboxCountResult {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { loading: approverLoading, isSuperAdmin, adminVillageIds, canApprove } =
    useApproverStatus();
  const [pending, setPending] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);

  const unread = useWatch<number>(
    'inbox:watchUnreadCount',
    uid,
    uid ? (next, error) => watchUnreadCount(uid, next, error) : null,
  );

  useEffect(() => {
    if (!uid) {
      setPending(0);
      return;
    }
    if (approverLoading) return;

    let cancelled = false;

    void (async () => {
      try {
        let pendingActionable = 0;
        if (canApprove) {
          if (isSuperAdmin) {
            const [organizerRows, orgRows] = await Promise.all([
              getPendingOrganizerRequests(),
              getPendingOrganizations(),
            ]);
            pendingActionable = organizerRows.length + orgRows.length;
          } else if (adminVillageIds.length > 0) {
            const orgRowsPerVillage = await Promise.all(
              adminVillageIds.map((vid) => getOrganizationsByMunicipality(vid, 'pending')),
            );
            pendingActionable = orgRowsPerVillage.flat().length;
          }
        }

        if (!cancelled) setPending(pendingActionable);
      } catch {
        if (!cancelled) setPending(0);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, approverLoading, canApprove, isSuperAdmin, adminVillageIds, refreshToken]);

  const refresh = useCallback(() => setRefreshToken((t) => t + 1), []);

  // A failed listener counts as nothing unread rather than breaking the bell.
  return { count: uid ? (unread.data ?? 0) + pending : 0, refresh };
}

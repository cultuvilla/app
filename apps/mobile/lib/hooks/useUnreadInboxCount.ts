import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { useApproverStatus } from '../auth/useApproverStatus';
import { useWatch } from './useWatch';
import { watchUnreadCount } from '@cultuvilla/shared/services/notificationService';
import {
  actionableScope,
  getActionableRequests,
  type ActionableKind,
} from '@cultuvilla/shared/services/inboxService';

export type UseUnreadInboxCountResult = {
  count: number;
  refresh: () => void;
};

/**
 * The actionable queues the badge counts. Deliberately a subset of what the
 * Buzón lists: join requests, open reports and cosateca requests are not
 * counted. Counting more is a product decision, and a change to this list.
 */
const BADGE_KINDS: readonly ActionableKind[] = ['organizer', 'orgs'];

/**
 * Badge count for the header bell: unread notifications plus the pending
 * requests in BADGE_KINDS that this user resolves. Which queues a role reads
 * is `actionableScope`'s, the same rule the Buzón uses.
 *
 * The unread part is a live listener, so it answers offline from the device
 * cache and moves the moment a notification lands or is read. The pending
 * requests stay a one-shot read that `refresh` re-runs (the header does on
 * focus): they are an approver's, and change when someone else acts.
 */
export function useUnreadInboxCount(): UseUnreadInboxCountResult {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { loading: approverLoading, isSuperAdmin, adminVillageIds, adminOrgIds, canApprove } =
    useApproverStatus();
  const scope = useMemo(
    () => actionableScope({ isSuperAdmin, adminVillageIds, adminOrgIds }),
    [isSuperAdmin, adminVillageIds, adminOrgIds],
  );
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
          const { organizer, orgs } = await getActionableRequests(scope, BADGE_KINDS);
          pendingActionable = organizer.length + orgs.length;
        }

        if (!cancelled) setPending(pendingActionable);
      } catch {
        if (!cancelled) setPending(0);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, approverLoading, canApprove, scope, refreshToken]);

  const refresh = useCallback(() => setRefreshToken((t) => t + 1), []);

  // A failed listener counts as nothing unread rather than breaking the bell.
  return { count: uid ? (unread.data ?? 0) + pending : 0, refresh };
}

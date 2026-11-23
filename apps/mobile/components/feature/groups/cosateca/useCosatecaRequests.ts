import { useMemo } from 'react';
import {
  watchCosaRequestsToMe,
  watchGroupCosaRequests,
  watchMyCosaRequests,
  type CosaRequest,
} from '@cultuvilla/shared/services/cosatecaService';
import { useWatch } from '../../../../lib/hooks/useWatch';
import { todayKey } from '../../../../lib/orgs/cuota';
import { cosatecaInbox, enMarcha, type EnMarcha } from './escaparate';

/**
 * Requests to answer in this group: those for the viewer's own cosas, and, for
 * an admin, those for the group's own cosas too. Newest first, each once.
 */
export function requestsToMe(
  orgId: string,
  toMe: readonly CosaRequest[],
  ofGroup: readonly CosaRequest[] | null,
): CosaRequest[] {
  const rows = new Map<string, CosaRequest>();
  for (const r of toMe) if (r.orgId === orgId) rows.set(r.id, r);
  for (const r of ofGroup ?? []) if (r.ownerUid === null) rows.set(r.id, r);
  return [...rows.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * The viewer's requests in one group's cosateca, both ways: what is going on
 * ("Te toca" and "En curso") and every request for "Todo". Shared by the
 * cosateca screen and the group home's badge. `enabled: false` reads nothing.
 */
export function useCosatecaRequests(
  orgId: string,
  uid: string,
  isAdmin: boolean,
  enabled = true,
): EnMarcha & { inbox: CosaRequest[] } {
  const on = enabled && uid !== '';
  const mine = useWatch<CosaRequest[]>('cosateca:watchMyCosaRequests', on ? uid : null, on ? (next, error) => watchMyCosaRequests(uid, next, error) : null);
  const toMe = useWatch<CosaRequest[]>('cosateca:watchCosaRequestsToMe', on ? uid : null, on ? (next, error) => watchCosaRequestsToMe(uid, next, error) : null);
  const ofGroup = useWatch<CosaRequest[]>(
    'cosateca:watchGroupCosaRequests',
    on && isAdmin ? orgId : null,
    on && isAdmin ? (next, error) => watchGroupCosaRequests(orgId, next, error) : null,
  );
  const today = todayKey();

  return useMemo(() => {
    const asked = (mine.data ?? []).filter((r) => r.orgId === orgId);
    const incoming = requestsToMe(orgId, toMe.data ?? [], isAdmin ? (ofGroup.data ?? []) : null);
    return { ...enMarcha(incoming, asked, uid, today), inbox: cosatecaInbox(incoming, asked) };
  }, [mine.data, toMe.data, ofGroup.data, orgId, isAdmin, uid, today]);
}

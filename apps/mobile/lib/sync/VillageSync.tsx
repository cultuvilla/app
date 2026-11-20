import { useEffect, useMemo } from 'react';
import { Image } from 'expo-image';
import { watchUserMemberships, type UserMembership } from '@cultuvilla/shared/services/villageMemberService';
import { useAuth } from '../auth/useAuth';
import { useMyOrgIds } from '../orgs/useMyOrgIds';
import { useActiveVillageId } from '../village/useActiveVillageId';
import { useWatch } from '../hooks/useWatch';
import { useAppForeground } from './useAppForeground';
import { syncVillage, villagesToSync } from './villageSync';

/** URLs already handed to expo-image this session; its disk cache keeps them across launches. */
const prefetched = new Set<string>();

function prefetchImages(urls: string[]): void {
  const fresh = urls.filter((url) => !prefetched.has(url));
  if (fresh.length === 0) return;
  for (const url of fresh) prefetched.add(url);
  // A variant not generated yet 404s here; the card falls back to the original on render.
  void Image.prefetch(fresh, 'disk').catch(() => undefined);
}

/**
 * Keeps the viewer's villages on the device: while the app is in the
 * foreground, every listener the village home reads is open for the active
 * village and each village the user belongs to; going to the background closes
 * them, and coming back reopens them, which syncs whatever changed meanwhile.
 * So any of those villages opens at once — offline too — from Firestore's
 * on-device cache (docs/plans/ongoing/offline-first-village.md, layer 3).
 *
 * Renders nothing. Sign-out clears the cache and restarts the app, so nothing
 * synced here outlives the session.
 */
export function VillageSync() {
  const { user, loading, profileChecked } = useAuth();
  const uid = user?.uid ?? null;
  const activeId = useActiveVillageId();
  const { orgIds, loading: orgsLoading } = useMyOrgIds();
  const foreground = useAppForeground();

  const memberships = useWatch<UserMembership[]>(
    'villageSync:watchUserMemberships',
    uid,
    uid ? (next, error) => watchUserMemberships(uid, next, error) : null,
  );
  const memberKey = (memberships.data ?? []).map((m) => m.municipalityId).join(',');

  // Wait until auth, the profile (the active village) and the viewer's orgs
  // (the private events) have settled, so the listeners open once rather than
  // once per answer.
  const settled = !loading && (uid === null || (profileChecked && !orgsLoading && memberships.status !== 'loading'));
  const villageKey = settled ? villagesToSync(activeId, memberKey ? memberKey.split(',') : []).join(',') : '';
  const orgKey = orgIds.join(',');
  const ids = useMemo(() => (villageKey ? villageKey.split(',') : []), [villageKey]);

  useEffect(() => {
    if (!foreground || ids.length === 0) return;
    const orgs = orgKey ? orgKey.split(',') : [];
    const unwatches = ids.map((id) => syncVillage(id, orgs, prefetchImages));
    return () => {
      for (const unwatch of unwatches) unwatch();
    };
  }, [foreground, ids, orgKey]);

  return null;
}

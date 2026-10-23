import { useEffect, useState } from 'react';
import { isVillageAdmin } from '@cultuvilla/shared/services/villageMemberService';
import { isOrgAdmin } from '@cultuvilla/shared/services/orgMemberService';
import { useAuth } from './useAuth';
import { useIsAppAdmin } from './useIsAppAdmin';

export interface OrgCapabilities {
  /** May edit the org (app admin, village admin of its municipality, or org admin). */
  canManage: boolean;
  /** May delete the org: app admin or village admin only — an org admin may
   * not (the organizations delete rule). */
  canDelete: boolean;
  uid: string | null;
  loading: boolean;
}

/**
 * Edit capability for a single organization. `municipalityId` is often unknown
 * on first render (the detail screen loads the org doc async); until it arrives
 * the village-admin axis resolves to false rather than blocking, and the
 * org-admin axis (keyed only on orgId) already applies.
 */
export function useOrgCapabilities(
  orgId: string | undefined,
  municipalityId: string | undefined,
): OrgCapabilities {
  const { user, loading: authLoading } = useAuth();
  const { isAppAdmin, loading: appAdminLoading } = useIsAppAdmin();
  const [orgAdmin, setOrgAdmin] = useState<boolean | null>(null);
  const [villageAdmin, setVillageAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user || !orgId) {
      setOrgAdmin(false);
      return;
    }
    let cancelled = false;
    setOrgAdmin(null);
    isOrgAdmin(orgId, user.uid).then((ok) => {
      if (!cancelled) setOrgAdmin(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [user, orgId]);

  useEffect(() => {
    if (!user || !municipalityId) {
      setVillageAdmin(false);
      return;
    }
    let cancelled = false;
    setVillageAdmin(null);
    isVillageAdmin(municipalityId, user.uid).then((ok) => {
      if (!cancelled) setVillageAdmin(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [user, municipalityId]);

  const loading =
    authLoading || appAdminLoading || orgAdmin === null || villageAdmin === null;
  const canManage = isAppAdmin || orgAdmin === true || villageAdmin === true;
  const canDelete = isAppAdmin || villageAdmin === true;
  return { canManage, canDelete, uid: user?.uid ?? null, loading };
}

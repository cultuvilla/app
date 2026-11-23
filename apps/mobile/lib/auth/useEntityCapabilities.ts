import { useEffect, useState } from 'react';
import { getVillageMemberRole } from '@cultuvilla/shared/services/villageMemberService';
import type { VillageMemberRole } from '@cultuvilla/shared/models';
import { can, type PolicyAction, type PolicyDoc, type PolicyKind } from '@cultuvilla/shared/policy';
import { useAuth } from './useAuth';
import { useIsAppAdmin } from './useIsAppAdmin';

/**
 * Role-driven capabilities for village-scoped entity surfaces. "Organizer" =
 * village admin or app admin: they can manage optimistic content directly and
 * approve/reject approval-gated organization requests.
 *
 * `can(action, kind, doc)` answers "may I edit / delete this doc?" from the
 * shared content policy (`@cultuvilla/shared/policy`), which a rules-emulator
 * test holds equal to `firestore.rules`. This hook only resolves who the viewer
 * is in this pueblo.
 */
export interface EntityCapabilities {
  /** Commit directly / edit live items (organizer). */
  canManage: boolean;
  /** Approve or reject pending org requests (same axis as canManage). */
  canApprove: boolean;
  /** The content policy, for a doc of this pueblo. Pass the doc itself. */
  can: (action: PolicyAction, kind: Exclude<PolicyKind, 'organization'>, doc: PolicyDoc) => boolean;
  /**
   * Joined the entity's pueblo (any role). Village-scoped reads that are open
   * to residents but not to the open web — the event attendee roster — gate on
   * this, matching the `isVillageMember` clause the Firestore rules use.
   */
  isMember: boolean;
  /** Current user's uid, for own-pending checks. `null` when signed out. */
  uid: string | null;
  loading: boolean;
}

export function useEntityCapabilities(municipalityId: string | undefined): EntityCapabilities {
  const { user, loading: authLoading } = useAuth();
  const { isAppAdmin, loading: appAdminLoading } = useIsAppAdmin();
  // One read answers both "is a member" and "is an admin" — `undefined` while
  // in flight, `null` once resolved to "not a member".
  const [role, setRole] = useState<VillageMemberRole | null | undefined>(undefined);

  useEffect(() => {
    if (!user || !municipalityId) {
      setRole(null);
      return;
    }
    let cancelled = false;
    setRole(undefined);
    getVillageMemberRole(municipalityId, user.uid).then((r) => {
      if (!cancelled) setRole(r);
    });
    return () => {
      cancelled = true;
    };
  }, [user, municipalityId]);

  const loading = authLoading || appAdminLoading || role === undefined;
  const canManage = isAppAdmin || role === 'admin';
  const uid = user?.uid ?? null;
  const actor = { uid, isAppAdmin, isVillageAdmin: role === 'admin' };

  return {
    canManage,
    canApprove: canManage,
    can: (action, kind, doc) => can(action, kind, actor, doc),
    // App admins act everywhere, so they count as members of every pueblo for
    // read purposes — the same equivalence canManage already makes.
    isMember: isAppAdmin || role != null,
    uid,
    loading,
  };
}

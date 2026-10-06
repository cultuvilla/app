import { userHref } from '../../lib/navigation/routes';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { VStack } from '../primitives/VStack';
import { HStack } from '../primitives/HStack';
import { Text } from '../primitives/Text';
import { Avatar } from '../primitives/Avatar';
import { Pressable } from '../primitives/Pressable';
import { DetailSectionHeading } from './DetailSectionHeading';
import { SectionEditToggle } from './SectionEditToggle';
import {
  getOrgMembers,
  setOrgMemberRole,
  removeOrgMember,
} from '@cultuvilla/shared/services/orgMemberService';
import { getPersonByUserId } from '@cultuvilla/shared/services/personService';
import { getPublicProfile } from '@cultuvilla/shared/services/userService';
import { buildNameWithNickname } from '@cultuvilla/shared/models/person';
import type { OrgMemberData } from '@cultuvilla/shared/models/organization/OrgMemberDataModel';
import { iconSizes } from '@cultuvilla/shared/design-system';
import { showConfirm, showAlert } from '../../lib/dialogs';
import { useT } from '../../lib/i18n';

type Row = OrgMemberData & { id: string; name: string; photoURL: string | null };

/**
 * Org member roster: circular profile photo (from the member's person,
 * initials fallback) + display name + an admin badge. Self-fetches, mirroring
 * EventAttendees. The caller decides whether to render this at all
 * (canViewOrgRoster) — this component does its own access control for the
 * management actions below.
 *
 * Tapping a member opens their profile, mirroring the village roster. The
 * management actions live behind the heading's "Editar" toggle: while editing,
 * each actionable row grows a promote/demote arrow (routed through the audited
 * `changeOrgMemberRole` callable via `setOrgMemberRole`) and a trash icon that
 * removes them from the org. Your own row is never actionable (avoids
 * self-lockout).
 */
export function OrgMembersList({
  orgId,
  canManage = false,
  currentUserId = null,
}: {
  orgId: string;
  canManage?: boolean;
  currentUserId?: string | null;
}) {
  const { t } = useT();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const members = await getOrgMembers(orgId);
    const resolved = await Promise.all(
      members.map(async (m): Promise<Row> => {
        // One hop per member: the person carries both photo and name parts.
        const person = await getPersonByUserId(m.userId).catch(() => null);
        if (person) {
          // Full name with the apodo in parentheses, matching the villager roster.
          const name = buildNameWithNickname(person).trim();
          return { ...m, name: name || m.userId, photoURL: person.photoURL ?? null };
        }
        const user = await getPublicProfile(m.userId).catch(() => null);
        return { ...m, name: user?.displayName || m.userId, photoURL: null };
      }),
    );
    // Admins first, then alphabetical.
    resolved.sort((a, b) =>
      a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'admin' ? -1 : 1,
    );
    setRows(resolved);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const isActionable = (m: Row) => canManage && m.userId !== currentUserId;

  const changeRole = (m: Row) => {
    const nextRole = m.role === 'admin' ? 'member' : 'admin';
    const promoting = nextRole === 'admin';
    showConfirm(
      t(promoting ? 'organization.membersList.confirmPromoteTitle' : 'organization.membersList.confirmDemoteTitle'),
      t(promoting ? 'organization.membersList.confirmPromoteBody' : 'organization.membersList.confirmDemoteBody', {
        name: m.name,
      }),
      () => {
        setPendingUserId(m.id);
        setOrgMemberRole(orgId, m.id, nextRole)
          .then(() => setRefreshKey((k) => k + 1))
          .catch((e: unknown) => {
            showAlert(e instanceof Error && e.message ? e.message : t('organization.membersList.roleChangeError'));
          })
          .finally(() => setPendingUserId(null));
      },
      { confirmText: t(promoting ? 'organization.membersList.promote' : 'organization.membersList.demote') },
    );
  };

  const removeMember = (m: Row) => {
    showConfirm(
      t('organization.membersList.confirmRemoveTitle'),
      t('organization.membersList.confirmRemoveBody', { name: m.name }),
      () => {
        setPendingUserId(m.id);
        removeOrgMember(orgId, m.id)
          .then(() => setRefreshKey((k) => k + 1))
          .catch((e: unknown) => {
            showAlert(e instanceof Error && e.message ? e.message : t('organization.membersList.removeError'));
          })
          .finally(() => setPendingUserId(null));
      },
      { confirmText: t('organization.membersList.remove') },
    );
  };

  // The caller hides the roster for an empty org; this covers removing the
  // last member from inside the list.
  if (rows && rows.length === 0) return null;

  return (
    <VStack gap={2}>
      <DetailSectionHeading
        action={
          canManage ? (
            <SectionEditToggle
              testID="org-members-edit-toggle"
              editing={editing}
              onToggle={() => setEditing((e) => !e)}
            />
          ) : undefined
        }
      >
        {t('organization.members')}
      </DetailSectionHeading>
      {(rows ?? []).map((r) => {
        const actionable = editing && isActionable(r);
        const pending = pendingUserId === r.id;
        return (
          <HStack key={r.id} gap={3} align="center" className="py-2">
            <Pressable
              testID={`org-member-profile-${r.id}`}
              onPress={() => router.push(userHref(r.userId))}
              accessibilityRole="button"
              accessibilityLabel={r.name}
              className="flex-1 flex-row items-center gap-3"
            >
              <Avatar uri={r.photoURL} size={36} initials={r.name.slice(0, 1).toUpperCase()} />
              <Text numberOfLines={1} className="flex-1">
                {r.name}
              </Text>
              {r.role === 'admin' ? (
                <Text tone="muted" variant="bodySm">
                  {t('organization.adminBadge')}
                </Text>
              ) : null}
            </Pressable>
            {actionable ? (
              pending ? (
                <ActivityIndicator size="small" />
              ) : (
                <>
                  <Pressable
                    testID={`org-member-row-${r.id}`}
                    disabled={pendingUserId != null}
                    onPress={() => changeRole(r)}
                    accessibilityLabel={t(
                      r.role === 'admin'
                        ? 'organization.membersList.demote'
                        : 'organization.membersList.promote',
                    )}
                    hitSlop={8}
                  >
                    <Ionicons
                      name={r.role === 'admin' ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                      size={iconSizes.sm}
                      color="#9ca3af"
                    />
                  </Pressable>
                  <Pressable
                    testID={`org-member-remove-${r.id}`}
                    disabled={pendingUserId != null}
                    onPress={() => removeMember(r)}
                    accessibilityLabel={t('organization.membersList.remove')}
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={iconSizes.sm} color="#9ca3af" />
                  </Pressable>
                </>
              )
            ) : null}
          </HStack>
        );
      })}
    </VStack>
  );
}

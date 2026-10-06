import { personHref, userHref } from '../../lib/navigation/routes';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  getVillageMembers,
  setVillageMemberRole,
  transferVillageAmbassador,
} from '@cultuvilla/shared/services/villageMemberService';
import { getMunicipalityPeople } from '@cultuvilla/shared/services/municipalityPersonService';
import { getMunicipality } from '@cultuvilla/shared/services/municipalityService';
import { iconSizes } from '@cultuvilla/shared/design-system';
import { villageTitle } from '@cultuvilla/shared/models/municipality';
import type { Sex } from '@cultuvilla/shared/models/core/SexModel';
import { VStack, HStack, Text, Avatar, Pressable, BottomSheet, Button } from '../primitives';
import { VillageTitleBadge } from './VillageTitleBadge';
import { showConfirm, showAlert } from '../../lib/dialogs';
import { useT } from '../../lib/i18n';

interface MemberRow {
  personId: string;
  userId: string;
  isPublic: boolean;
  role: 'admin' | 'user';
  censoComplete: boolean | null;
  displayName: string;
  photoURL: string | null;
}

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

/**
 * Roster of a pueblo's people, reached from the village personas stat. The
 * municipalityPeople read model covers account holders and dependent personas
 * and arrives already alphabetized by its function-owned sort key.
 *
 * Every row carries its public title: the pueblo's one Embajador and the
 * "Equipo del pueblo" (every other admin).
 *
 * When `canManage`, a row opens an actions sheet: add to / remove from the team
 * (the audited `setVillageMemberRole` callable) and — for the Embajador or an
 * app admin — hand over the Embajador title (`transferVillageAmbassador`). Two
 * rows are never actionable: your own (avoids self-lockout) and the
 * Embajador's (the callable refuses to demote them; the title moves first).
 */
export function MembersList({
  villageId,
  canManage = false,
  isAppAdmin = false,
  currentUserId = null,
}: {
  villageId: string;
  canManage?: boolean;
  isAppAdmin?: boolean;
  currentUserId?: string | null;
}) {
  const { t } = useT();
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [organizerId, setOrganizerId] = useState<string | null>(null);
  const [organizerSex, setOrganizerSex] = useState<Sex | null>(null);
  const [selected, setSelected] = useState<MemberRow | null>(null);
  const [censoConfigured, setCensoConfigured] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [people, members, municipality] = await Promise.all([
        getMunicipalityPeople(villageId),
        getVillageMembers(villageId),
        getMunicipality(villageId),
      ]);
      const profileFields = municipality?.community?.profileForm?.fields ?? [];
      const memberships = new Map(members.map((member) => [member.userId, member]));
      const rows = people.map((person) => {
        const membership = person.userId ? memberships.get(person.userId) : undefined;
        return {
          personId: person.personId,
          userId: person.userId ?? '',
          role: membership?.role ?? 'user',
          censoComplete: membership ? membership.profileCompletedAt != null : null,
          displayName: person.displayName,
          photoURL: person.photoURL,
          isPublic: person.isPublic,
        };
      });
      if (!cancelled) {
        setOrganizerId(municipality?.community?.organizerId ?? null);
        setOrganizerSex(municipality?.community?.organizerSex ?? null);
        setCensoConfigured(profileFields.length > 0);
        setRows(rows);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [villageId, refreshKey]);

  const canTransfer = isAppAdmin || (currentUserId != null && currentUserId === organizerId);

  const changeRole = (m: MemberRow) => {
    setSelected(null);
    const nextRole = m.role === 'admin' ? 'user' : 'admin';
    const promoting = nextRole === 'admin';
    showConfirm(
      t(promoting ? 'village.membersList.confirmPromoteTitle' : 'village.membersList.confirmDemoteTitle'),
      t(promoting ? 'village.membersList.confirmPromoteBody' : 'village.membersList.confirmDemoteBody', {
        name: m.displayName,
      }),
      () => {
        setPendingUserId(m.userId);
        setVillageMemberRole(villageId, m.userId, nextRole)
          .then(() => setRefreshKey((k) => k + 1))
          .catch((e: unknown) => {
            showAlert(e instanceof Error && e.message ? e.message : t('village.membersList.roleChangeError'));
          })
          .finally(() => setPendingUserId(null));
      },
      { confirmText: t(promoting ? 'village.membersList.promote' : 'village.membersList.demote') },
    );
  };

  const transfer = (m: MemberRow) => {
    setSelected(null);
    showConfirm(
      t('village.membersList.confirmTransferTitle'),
      t('village.membersList.confirmTransferBody', { name: m.displayName }),
      () => {
        setPendingUserId(m.userId);
        transferVillageAmbassador(villageId, m.userId)
          .then(() => setRefreshKey((k) => k + 1))
          .catch((e: unknown) => {
            showAlert(e instanceof Error && e.message ? e.message : t('village.membersList.transferError'));
          })
          .finally(() => setPendingUserId(null));
      },
      { confirmText: t('village.membersList.confirmTransfer') },
    );
  };

  const titleOf = (m: MemberRow) =>
    villageTitle({ userId: m.userId, role: m.role, organizerId });

  // Self is never actionable (self-lockout); the Embajador can't be demoted
  // (the title moves first), so their row isn't actionable either.
  const isActionable = (m: MemberRow) =>
    canManage &&
    m.userId.length > 0 &&
    m.userId !== currentUserId &&
    !(m.role === 'admin' && m.userId === organizerId);

  if (rows === null) {
    return (
      <VStack className="flex-1 items-center justify-center py-10">
        <ActivityIndicator />
      </VStack>
    );
  }

  if (rows.length === 0) {
    return (
      <VStack className="items-center py-10 px-4">
        <Text tone="muted">{t('village.membersList.empty')}</Text>
      </VStack>
    );
  }

  // A private dependent persona keeps its row (the pueblo census stays honest)
  // but leads nowhere — its person doc is unreadable to anyone but its creator,
  // so the detail screen would only show the "private" notice. Account holders
  // are always public.
  const canOpenProfile = (m: MemberRow) => m.userId.length > 0 || m.isPublic;

  const openProfile = (m: MemberRow) => {
    router.push(m.userId ? userHref(m.userId) : personHref(m.personId));
  };

  const renderRowContent = (m: MemberRow, actionable: boolean) => (
    <>
      <Pressable
        testID={`person-profile-${m.personId}`}
        disabled={!canOpenProfile(m)}
        onPress={() => openProfile(m)}
        className="flex-1"
      >
        <HStack gap={2} className="items-center pr-2">
        <Avatar
          uri={m.photoURL}
          size={32}
          initials={initialsOf(m.displayName)}
          ambassador={titleOf(m) === 'ambassador'}
        />
        <VStack gap={1} className="flex-1">
          <Text testID="member-name" numberOfLines={1}>
            {m.displayName}
          </Text>
          <VillageTitleBadge
            title={titleOf(m)}
            sex={organizerSex}
            testID={`member-title-${m.personId}`}
          />
        </VStack>
        {canOpenProfile(m) ? null : (
          <Ionicons
            name="lock-closed-outline"
            size={iconSizes.sm}
            color="#9ca3af"
            accessibilityLabel={t('profile.personPrivate')}
          />
        )}
        </HStack>
      </Pressable>
      {censoConfigured ? (
        <View
          className="w-14 items-center"
          accessibilityLabel={
            m.censoComplete === null
              ? undefined
              : m.censoComplete
              ? t('village.membersList.censoComplete')
              : t('village.membersList.censoPending')
          }
        >
          {m.censoComplete === null ? null : (
            <Ionicons
              name={m.censoComplete ? 'checkmark' : 'close'}
              size={iconSizes.sm}
              color={m.censoComplete ? '#16a34a' : '#9ca3af'}
            />
          )}
        </View>
      ) : null}
      <View testID="member-action-slot" className="w-6 items-end">
        {pendingUserId === m.userId ? (
          <ActivityIndicator size="small" />
        ) : actionable ? (
          <Pressable
            testID={`member-row-${m.userId}`}
            disabled={pendingUserId != null}
            onPress={() => setSelected(m)}
            accessibilityLabel={t('village.membersList.manageRole')}
            hitSlop={8}
          >
            <Ionicons name="chevron-forward" size={iconSizes.sm} color="#9ca3af" />
          </Pressable>
        ) : null}
      </View>
    </>
  );

  return (
    <ScrollView contentContainerClassName="pb-10">
      <VStack className="pt-3 px-4">
        {/* Header row */}
        <HStack gap={0} className="items-center py-2 border-b border-subtle">
          <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1 font-bold">
            {t('village.membersList.colName')}
          </Text>
          {censoConfigured ? (
            <Text variant="caption" tone="muted" numberOfLines={1} className="w-14 text-center font-bold">
              {t('village.membersList.colCenso')}
            </Text>
          ) : null}
          <View className="w-6" />
        </HStack>

        {/* Member rows */}
        {rows.map((m) => {
          const actionable = isActionable(m);
          return (
            <HStack key={m.personId} gap={0} className="items-center py-3 border-b border-subtle">
              {renderRowContent(m, actionable)}
            </HStack>
          );
        })}
      </VStack>
      <BottomSheet
        visible={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.displayName}
        closeLabel={t('village.membersList.close')}
        testID="member-actions-sheet"
      >
        {selected ? (
          <VStack gap={2} className="pb-2">
            <Button
              fullWidth
              variant="secondary"
              onPress={() => changeRole(selected)}
              testID="member-action-team"
            >
              {t(selected.role === 'admin' ? 'village.membersList.demote' : 'village.membersList.promote')}
            </Button>
            {canTransfer ? (
              <Button
                fullWidth
                onPress={() => transfer(selected)}
                testID="member-action-transfer"
              >
                {t('village.membersList.transfer')}
              </Button>
            ) : null}
          </VStack>
        ) : null}
      </BottomSheet>
    </ScrollView>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { getVillageMembers } from '@cultuvilla/shared/services/villageMemberService';
import { getMunicipalityPeople } from '@cultuvilla/shared/services/municipalityPersonService';
import { getPublicProfile } from '@cultuvilla/shared/services/userService';
import { getOrganizationsByMunicipality } from '@cultuvilla/shared/services/organizationService';
import type { OrganizationData } from '@cultuvilla/shared/models/organization/OrganizationDataModel';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { LiveOwnerChip } from './LiveOwnerChip';
import { SearchableSelectSheet, type SelectableRow } from './SearchableSelectSheet';
import { Text } from '../primitives/Text';
import { VStack } from '../primitives/VStack';
import { HStack } from '../primitives/HStack';
import { FieldLabel } from '../primitives/FieldLabel';
import { Pressable } from '../primitives/Pressable';
import { useT } from '../../lib/i18n';

const ACCENT = colors.light.fg.accent;

interface VillagerOption {
  userId: string;
  displayName: string;
  /** Avatar from the linked person doc (the user doc's photoURL is often null). */
  photoURL: string | null;
  /** Accent-folded name from the directory, so ordering matches the roster. */
  sortName: string;
}

export interface OrganizerPickerProps {
  municipalityId: string;
  selectedUserIds: string[];
  selectedOrgIds: string[];
  /** Creator — shown as a locked row, cannot be removed. */
  lockedUserId?: string;
  onChangeUsers: (ids: string[]) => void;
  onChangeOrgs: (ids: string[]) => void;
  /** Override the people-section wording (default: event "Organizadores"). News
   *  passes "Escritores". The groups section ("Grupos involucrados") is
   *  unaffected. */
  peopleLabel?: string;
  addPersonLabel?: string;
  selectPeopleTitle?: string;
}

/**
 * Controlled picker for event/news co-organizers, in two sections:
 *
 * - "Organizadores" (people): each selected villager is a full-width row with
 *   their avatar + name (via {@link LiveOwnerChip}); the locked creator can't be
 *   removed. A dashed "Añadir persona" row opens a searchable member sheet.
 * - "Grupos involucrados" (organizations): the same row treatment, added via an
 *   "Añadir grupo" sheet listing the village's approved groups.
 */
export function OrganizerPicker({
  municipalityId,
  selectedUserIds,
  selectedOrgIds,
  lockedUserId,
  onChangeUsers,
  onChangeOrgs,
  peopleLabel,
  addPersonLabel,
  selectPeopleTitle,
}: OrganizerPickerProps) {
  const { t } = useT();
  const peopleLabelText = peopleLabel ?? t('event.organizersLabel');
  const addPersonLabelText = addPersonLabel ?? t('event.organizer.addUser');
  const selectPeopleTitleText = selectPeopleTitle ?? t('event.organizer.selectUsers');

  const [orgs, setOrgs] = useState<(OrganizationData & { id: string })[]>([]);
  const [villagers, setVillagers] = useState<VillagerOption[]>([]);
  const [userSheetOpen, setUserSheetOpen] = useState(false);
  const [userSheetSelected, setUserSheetSelected] = useState<Set<string>>(new Set());
  const [userSheetPinned, setUserSheetPinned] = useState<Set<string>>(new Set());
  const [orgSheetOpen, setOrgSheetOpen] = useState(false);
  const [orgSheetSelected, setOrgSheetSelected] = useState<Set<string>>(new Set());
  const [orgSheetPinned, setOrgSheetPinned] = useState<Set<string>>(new Set());

  // ---- Load orgs + villagers once on mount / when municipality changes ------
  //
  // Names and avatars come from the `municipalityPeople` directory, which
  // already carries `displayName`/`sortName`/`photoURL` per person. That is ONE
  // query for the whole village: the previous shape fanned out a
  // getPublicProfile + getPersonByUserId per member, which in Matabuena (165
  // members) meant ~331 reads before the sheet could show anything, and the
  // sheet visibly filled in late. A member the directory doesn't cover (no
  // person doc linked to this village yet) still falls back to their user doc,
  // so nobody drops off the list.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [orgDocs, memberDocs, people] = await Promise.all([
        getOrganizationsByMunicipality(municipalityId, 'approved').catch(() => []),
        getVillageMembers(municipalityId).catch(() => []),
        getMunicipalityPeople(municipalityId).catch(() => []),
      ]);
      if (cancelled) return;
      setOrgs(orgDocs);

      const byUserId = new Map(
        people.filter((p) => p.userId).map((p) => [p.userId as string, p]),
      );
      const missing = memberDocs.filter((m) => !byUserId.has(m.userId));
      // Per-member catch, not one Promise.all over the batch: a transient denial
      // must cost only that member's name, never the whole villager list.
      const fallbacks = new Map(
        await Promise.all(
          missing.map(async (m) => {
            const profile = await getPublicProfile(m.userId).catch(() => null);
            return [m.userId, profile?.displayName ?? m.userId] as const;
          }),
        ),
      );
      if (cancelled) return;

      setVillagers(
        memberDocs.map((m) => {
          const person = byUserId.get(m.userId);
          const displayName = person?.displayName ?? fallbacks.get(m.userId) ?? m.userId;
          return {
            userId: m.userId,
            displayName,
            photoURL: person?.photoURL ?? null,
            sortName: person?.sortName ?? displayName,
          };
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [municipalityId]);

  // ---- Villager sheet -------------------------------------------------------
  const villagerRows: SelectableRow[] = useMemo(
    () =>
      villagers.map((v) => ({
        id: v.userId,
        label: v.displayName,
        sortKey: v.sortName,
        imageUri: v.photoURL,
        disabled: v.userId === lockedUserId,
        trailing: v.userId === lockedUserId ? t('event.organizer.locked') : undefined,
      })),
    [villagers, lockedUserId, t],
  );

  function openUserSheet() {
    setUserSheetSelected(new Set(selectedUserIds));
    setUserSheetPinned(new Set(selectedUserIds));
    setUserSheetOpen(true);
  }
  function toggleVillager(userId: string) {
    if (userId === lockedUserId) return; // locked — cannot remove
    setUserSheetSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }
  function confirmUserSheet() {
    const ids = [...userSheetSelected];
    if (lockedUserId && !ids.includes(lockedUserId)) ids.unshift(lockedUserId);
    onChangeUsers(ids);
    setUserSheetOpen(false);
  }
  function removeUser(userId: string) {
    if (userId === lockedUserId) return;
    onChangeUsers(selectedUserIds.filter((id) => id !== userId));
  }

  // ---- Org sheet ------------------------------------------------------------
  const orgRows: SelectableRow[] = useMemo(
    () => orgs.map((o) => ({ id: o.id, label: o.name, imageUri: o.images[0] ?? null })),
    [orgs],
  );

  function openOrgSheet() {
    setOrgSheetSelected(new Set(selectedOrgIds));
    setOrgSheetPinned(new Set(selectedOrgIds));
    setOrgSheetOpen(true);
  }
  function toggleOrg(orgId: string) {
    setOrgSheetSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  }
  function confirmOrgSheet() {
    onChangeOrgs([...orgSheetSelected]);
    setOrgSheetOpen(false);
  }
  function removeOrg(orgId: string) {
    onChangeOrgs(selectedOrgIds.filter((id) => id !== orgId));
  }

  // ---- Render ---------------------------------------------------------------
  return (
    <VStack gap={6}>
      {/* People */}
      <VStack gap={2}>
        <FieldLabel>{peopleLabelText}</FieldLabel>
        {selectedUserIds.map((uid) => {
          const locked = uid === lockedUserId;
          return (
            <HStack
              key={uid}
              gap={2}
              className="items-center justify-between rounded-lg border border-subtle p-3"
            >
              <LiveOwnerChip ownerId={uid} ownerType="user" />
              {locked ? (
                <Text variant="caption" tone="muted">{t('event.organizer.locked')}</Text>
              ) : (
                <Pressable
                  onPress={() => removeUser(uid)}
                  accessibilityLabel={t('event.organizer.remove')}
                  testID={`remove-user-${uid}`}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={iconSizes.md} color="#94a3b8" />
                </Pressable>
              )}
            </HStack>
          );
        })}
        <AddRow label={addPersonLabelText} onPress={openUserSheet} testID="add-user-btn" />
      </VStack>

      {/* Groups */}
      <VStack gap={2}>
        <FieldLabel>{t('event.groupsLabel')}</FieldLabel>
        {selectedOrgIds.map((oid) => (
          <HStack
            key={oid}
            gap={2}
            className="items-center justify-between rounded-lg border border-subtle p-3"
          >
            <LiveOwnerChip ownerId={oid} ownerType="organization" />
            <Pressable
              onPress={() => removeOrg(oid)}
              accessibilityLabel={t('event.organizer.remove')}
              testID={`remove-org-${oid}`}
              hitSlop={8}
            >
              <Ionicons name="close" size={iconSizes.md} color="#94a3b8" />
            </Pressable>
          </HStack>
        ))}
        <AddRow label={t('event.organizer.addOrg')} onPress={openOrgSheet} testID="add-org-btn" />
      </VStack>

      {/* Villager selection sheet */}
      <SearchableSelectSheet
        open={userSheetOpen}
        title={selectPeopleTitleText}
        confirmLabel={t('event.organizer.confirm')}
        emptyLabel={null}
        rows={villagerRows}
        selected={userSheetSelected}
        pinned={userSheetPinned}
        onToggle={toggleVillager}
        onClose={() => setUserSheetOpen(false)}
        onConfirm={confirmUserSheet}
        confirmTestID="villager-confirm"
        rowTestIDPrefix="villager-row"
      />

      {/* Group selection sheet */}
      <SearchableSelectSheet
        open={orgSheetOpen}
        title={t('event.organizer.selectOrgs')}
        confirmLabel={t('event.organizer.confirm')}
        emptyLabel={orgs.length === 0 ? t('event.organizer.noGroups') : null}
        rows={orgRows}
        selected={orgSheetSelected}
        pinned={orgSheetPinned}
        onToggle={toggleOrg}
        onClose={() => setOrgSheetOpen(false)}
        onConfirm={confirmOrgSheet}
        confirmTestID="org-confirm"
        rowTestIDPrefix="org-row"
      />
    </VStack>
  );
}

/** Dashed full-width "add another" affordance, matching the pueblo tab. */
function AddRow({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center gap-2 rounded-lg border border-dashed border-subtle p-3"
    >
      <Ionicons name="add" size={22} color={ACCENT} />
      <Text tone="muted" className="flex-1">{label}</Text>
    </Pressable>
  );
}

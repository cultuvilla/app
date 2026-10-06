import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  VStack,
  HStack,
  Text,
  Pressable,
  Escudo,
  FieldLabel,
  VillagePicker,
  BarrioPicker,
} from '../primitives';
import { useT } from '../../lib/i18n';
import { useAuth } from '../../lib/auth/useAuth';
import {
  getUserMemberships,
  ensureVillageMembership,
  leaveVillage,
} from '@cultuvilla/shared/services/villageMemberService';
import { getPersonByUserId, updateResidenceBarrio } from '@cultuvilla/shared/services/personService';
import { getMunicipality } from '@cultuvilla/shared/services/municipalityService';
import { setActiveMunicipality } from '@cultuvilla/shared/services/userService';
import { escudoThumbDisplayUrl } from '@cultuvilla/shared/models/municipality';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';

interface Row {
  municipalityId: string;
  name: string;
  escudoThumbUrl: string | null;
  barrioId: string | null;
}

export interface MembershipVillageEditorProps {
  /** The account whose villages are edited (the caller's own uid). */
  userId: string;
}

/**
 * Own-profile village + barrio editor. Rows are the caller's memberships; each
 * carries a fixed village header (no swapping) and an editable barrio. Adding a
 * village joins it (`ensureVillageMembership`, dormant-safe); removing one leaves
 * it (confirmed `leaveVillage` batch) and reassigns `activeMunicipalityId` when
 * the active village is the one left. Residence barrio is single-source-of-truth
 * on `municipalityLinks` (`updateResidenceBarrio`).
 */
export function MembershipVillageEditor({ userId }: MembershipVillageEditorProps) {
  const { t } = useT();
  const { profile, user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadRows(): Promise<Row[]> {
    const [memberships, person] = await Promise.all([
      getUserMemberships(userId),
      getPersonByUserId(userId, user?.uid ?? null),
    ]);
    const links = person?.municipalityLinks ?? [];
    const named = await Promise.all(
      memberships.map(async (m) => {
        const muni = await getMunicipality(m.municipalityId);
        const link = links.find((l) => l.municipalityId === m.municipalityId);
        return {
          municipalityId: m.municipalityId,
          name: muni?.name ?? m.municipalityId,
          escudoThumbUrl: muni ? escudoThumbDisplayUrl(muni) : null,
          barrioId: link?.barrioId ?? null,
        };
      }),
    );
    named.sort((a, b) => a.name.localeCompare(b.name));
    return named;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const named = await loadRows();
      if (!cancelled) setRows(named);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function onChangeBarrio(municipalityId: string, barrioId: string | null) {
    setRows((prev) =>
      (prev ?? []).map((r) => (r.municipalityId === municipalityId ? { ...r, barrioId } : r)),
    );
    await updateResidenceBarrio(userId, municipalityId, barrioId);
  }

  async function onAddVillage(municipalityId: string | null) {
    if (!municipalityId || busy) return;
    setBusy(true);
    try {
      await ensureVillageMembership(municipalityId, userId);
      setRows(await loadRows());
    } finally {
      setBusy(false);
    }
  }

  async function doLeave(municipalityId: string) {
    setBusy(true);
    try {
      await leaveVillage(municipalityId, userId);
      const remaining = (rows ?? []).filter((r) => r.municipalityId !== municipalityId);
      if (profile?.activeMunicipalityId === municipalityId) {
        await setActiveMunicipality(userId, remaining[0]?.municipalityId ?? null);
      }
      setRows(remaining);
    } finally {
      setBusy(false);
    }
  }

  function confirmLeave(municipalityId: string) {
    Alert.alert(
      t('profile.personForm.leaveVillageTitle'),
      t('profile.personForm.leaveVillageMessage'),
      [
        { text: t('profile.personForm.leaveVillageCancel'), style: 'cancel' },
        {
          text: t('profile.personForm.leaveVillageConfirm'),
          style: 'destructive',
          onPress: () => void doLeave(municipalityId),
        },
      ],
    );
  }

  if (rows === null) {
    return (
      <View className="py-4 items-center">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <VStack gap={3}>
      <FieldLabel>{t('profile.personForm.myVillagesHeading')}</FieldLabel>
      {rows.length === 0 ? (
        <Text tone="muted" variant="bodySm">
          {t('profile.personForm.noVillages')}
        </Text>
      ) : (
        rows.map((r) => (
          <VStack key={r.municipalityId} gap={1} className="rounded-md border border-subtle p-3">
            <HStack className="items-center justify-between">
              <HStack gap={2} className="items-center">
                <Escudo url={r.escudoThumbUrl} size={28} fallbackInitial={r.name} />
                <Text className="font-semibold">{r.name}</Text>
              </HStack>
              <Pressable
                onPress={() => confirmLeave(r.municipalityId)}
                disabled={busy}
                accessibilityLabel={t('profile.personForm.removeVillage')}
                hitSlop={8}
                className="flex-row items-center p-1"
              >
                <Ionicons name="exit-outline" size={16} color="#dc2626" />
                <Text variant="bodySm" tone="danger" className="ml-1">
                  {t('profile.personForm.removeVillage')}
                </Text>
              </Pressable>
            </HStack>
            <BarrioPicker
              label={t('profile.personForm.barrio')}
              municipalityId={r.municipalityId}
              value={r.barrioId}
              onChange={(barrioId) => void onChangeBarrio(r.municipalityId, barrioId)}
              wholeVillageLabel={t('profile.personForm.wholeVillage')}
              // Always show a barrio control per village so residence can be set
              // for any of them — even a village with no approved barrios yet.
              hideWhenEmpty={false}
            />
          </VStack>
        ))
      )}
      <VillagePicker
        label={t('profile.personForm.addVillage')}
        value={null}
        onChange={(id) => void onAddVillage(id)}
        trigger={(open) => (
          <Pressable
            onPress={open}
            disabled={busy}
            accessibilityLabel={t('profile.personForm.addVillage')}
            accessibilityRole="button"
            className="flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-subtle py-6"
          >
            <Ionicons name="add" size={iconSizes.lg} color={colors.light.fg.accent} />
            <Text className="font-semibold">{t('profile.personForm.addVillage')}</Text>
          </Pressable>
        )}
      />
    </VStack>
  );
}

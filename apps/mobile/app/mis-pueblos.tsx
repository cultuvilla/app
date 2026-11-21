import { routes } from '../lib/navigation/routes';
import { colors } from '@cultuvilla/shared/design-system';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/primitives/Screen';
import { Text } from '../components/primitives/Text';
import { ErrorState } from '../components/primitives/ErrorState';
import { Pressable } from '../components/primitives/Pressable';
import { Button } from '../components/primitives/Button';
import { VStack } from '../components/primitives/VStack';
import { Escudo } from '../components/primitives/Escudo';
import { ScreenHeader } from '../components/layout/ScreenHeader';
import { useAuth } from '../lib/auth/useAuth';
import { useT } from '../lib/i18n';
import {
  getUserMemberships,
  type UserMembership,
} from '@cultuvilla/shared/services/villageMemberService';
import { getMunicipality } from '@cultuvilla/shared/services/municipalityService';
import { escudoThumbDisplayUrl, villageTitle } from '@cultuvilla/shared/models/municipality';
import type { Sex } from '@cultuvilla/shared/models/core/SexModel';
import { VillageTitleBadge } from '../components/feature/VillageTitleBadge';

type Row = UserMembership & {
  name: string;
  escudoThumbUrl: string | null;
  organizerId: string | null;
  organizerSex: Sex | null;
};

export default function MyVillagesScreen() {
  const { user, profile, switchActiveVillage } = useAuth();
  const { t } = useT();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setError(null);
      setRows(null);
      const memberships = await getUserMemberships(user.uid);
      const named = await Promise.all(
        memberships.map(async (m) => {
          const muni = await getMunicipality(m.municipalityId);
          return {
            ...m,
            name: muni?.name ?? m.municipalityId,
            escudoThumbUrl: muni ? escudoThumbDisplayUrl(muni) : null,
            organizerId: muni?.community?.organizerId ?? null,
            organizerSex: muni?.community?.organizerSex ?? null,
          };
        }),
      );
      setRows(named);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectVillage(municipalityId: string) {
    switchActiveVillage(municipalityId);
    router.replace(routes.myVillage);
  }

  const activeId = profile?.activeMunicipalityId ?? null;

  return (
    <Screen padded={false}>
      <ScreenHeader title={t('villageSwitcher.title')} />
      {rows === null && !error ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : error ? (
        <ErrorState error={error} onRetry={load} />
      ) : (
        <FlatList
          data={rows ?? []}
          keyExtractor={(r) => r.municipalityId}
          contentContainerClassName="p-4 gap-3"
          ListEmptyComponent={<Text tone="muted">{t('me.villages.empty')}</Text>}
          ListFooterComponent={
            <View className="pt-4">
              <Button variant="ghost" onPress={() => router.push(routes.discover)}>
                <Text>{t('villageSwitcher.findAnother')}</Text>
              </Button>
            </View>
          }
          renderItem={({ item }) => {
            const isActive = item.municipalityId === activeId;
            const title = user
              ? villageTitle({ userId: user.uid, role: item.role, organizerId: item.organizerId })
              : 'member';
            return (
              <Pressable
                onPress={() => selectVillage(item.municipalityId)}
                disabled={isActive}
                className={
                  'flex-row items-center p-3 rounded-md border ' +
                  (isActive ? 'border-strong bg-surface-elevated' : 'border-subtle bg-surface')
                }
              >
                <Escudo url={item.escudoThumbUrl} size={36} fallbackInitial={item.name} />
                <View className="flex-1 ml-3">
                  <VStack gap={1}>
                    <Text className="font-semibold">{item.name}</Text>
                    {title === 'member' ? (
                      <Text tone="muted" variant="caption">
                        {t('me.villages.memberBadge')}
                      </Text>
                    ) : (
                      <VillageTitleBadge title={title} sex={item.organizerSex} />
                    )}
                  </VStack>
                </View>
                {isActive ? (
                  <View className="flex-row items-center">
                    <Ionicons name="checkmark-circle" size={20} color={colors.light.fg.success} />
                    <Text variant="caption" tone="success" className="ml-1 font-semibold uppercase">
                      {t('me.villages.activeBadge')}
                    </Text>
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={colors.light.fg.chevron} />
                )}
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

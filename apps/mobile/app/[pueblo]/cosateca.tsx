import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { cosatecaCatalogue, usedCosaCategories, type CosaCategory } from '@cultuvilla/shared/models/organization';
import { watchVillageCosas, type Cosa } from '@cultuvilla/shared/services/cosatecaService';
import { Screen, Text } from '../../components/primitives';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { CategoryChips, CosaRow } from '../../components/feature/groups/cosateca/CosaRows';
import { useAuth } from '../../lib/auth/useAuth';
import { useWatch } from '../../lib/hooks/useWatch';
import { useT } from '../../lib/i18n';
import { groupCosaHref } from '../../lib/navigation/routes';
import { useVillageRoute, withVillageRoute } from '../../lib/navigation/VillageRouteGate';

/**
 * Cosateca del pueblo: every cosa of the village's groups that opened their
 * cosateca to all its vecinos. The rules let only a member of the village read
 * them, so anyone else sees the empty line. App-only: the read site answers
 * this path with the app hand-off.
 */
function VillageCosatecaScreen() {
  const { t } = useT();
  const { municipalityId } = useVillageRoute();
  const { user } = useAuth();
  const [category, setCategory] = useState<CosaCategory | null>(null);
  const cosas = useWatch<Cosa[]>(
    'cosateca:watchVillageCosas',
    user && municipalityId ? municipalityId : null,
    user && municipalityId ? (next, error) => watchVillageCosas(municipalityId, next, error) : null,
  );
  const all = cosas.data ?? [];
  const categories = useMemo(() => usedCosaCategories(all), [all]);
  const catalogue = useMemo(() => cosatecaCatalogue(all, category), [all, category]);

  return (
    <Screen padded={false}>
      <ScreenHeader title={t('groups.cosateca.village.title')} />
      <View className="px-4 pt-3 gap-3">
        <Text tone="muted" variant="bodySm">
          {t('groups.cosateca.village.intro')}
        </Text>
        {categories.length > 1 ? <CategoryChips categories={categories} value={category} onChange={setCategory} /> : null}
      </View>
      <FlatList
        testID="village-cosateca"
        data={catalogue}
        keyExtractor={(c) => c.id}
        contentContainerClassName="px-4 pt-3 pb-10 gap-2"
        ListEmptyComponent={
          cosas.status === 'loading' ? null : (
            <Text tone="muted" className="py-6 text-center">
              {t(all.length === 0 ? 'groups.cosateca.village.empty' : 'groups.cosateca.emptyCategory')}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <CosaRow cosa={item} subtitle={item.ownerName} onPress={() => router.push(groupCosaHref(item.orgId, item.id))} />
        )}
      />
    </Screen>
  );
}

export default withVillageRoute(VillageCosatecaScreen);

import { useVillageRoute, withVillageRoute } from '../../lib/navigation/VillageRouteGate';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../../components/primitives';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { useT } from '../../lib/i18n';
import { FestivalPostersManager } from '../../components/feature/proposable/FestivalPostersManager';

function FestivalPostersScreen() {
  const { municipalityId: villageId, slug: villageSlug } = useVillageRoute();
  const { t } = useT();
  return (
    <Screen padded={false} bottomInset={false}>
      <ScreenHeader title={t('village.festivalPosters.add')} />
      {villageId ? (
        <View style={{ flex: 1 }}>
          <FestivalPostersManager villageId={villageId} onCreated={() => router.back()} />
        </View>
      ) : null}
    </Screen>
  );
}

export default withVillageRoute(FestivalPostersScreen);

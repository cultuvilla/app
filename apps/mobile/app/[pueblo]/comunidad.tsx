import { villageHref, villageSectionHref } from '../../lib/navigation/routes';
import { useVillageRoute, withVillageRoute } from '../../lib/navigation/VillageRouteGate';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Button } from '../../components/primitives';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { CommunitySettingsEditor } from '../../components/feature/CommunitySettingsEditor';
import { useEntityCapabilities } from '../../lib/auth/useEntityCapabilities';
import { useT } from '../../lib/i18n';

// Role-mode community editor (organizers only; non-organizers are redirected
// back to the village, where the header is their read view). Edits the pueblo's
// details — escudo/description/location — each field saving itself as it
// changes, so the bottom "Listo" button just closes the editor. The villagers
// roster lives on its own screen (village/[id]/members), reached from the
// personas stat.
function CommunityScreen() {
  const { municipalityId: villageId, slug: villageSlug } = useVillageRoute();
  const { canManage, loading } = useEntityCapabilities(villageId);
  const { t } = useT();
  const insets = useSafeAreaInsets();

  if (!villageId) return null;
  if (loading) {
    return (
      <Screen padded={false} topInset={false}>
        <ScreenHeader accent title={t('village.edit.title')} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }
  if (!canManage) return <Redirect href={villageHref(villageSlug)} />;

  return (
    <Screen padded={false} bottomInset={false} topInset={false}>
      <ScreenHeader accent title={t('village.edit.title')} />
      <View style={{ flex: 1 }}>
        <View className="flex-1">
          <CommunitySettingsEditor
            villageId={villageId}
            afterFiestas={
              <Button
                variant="secondary"
                onPress={() => router.push(villageSectionHref(villageSlug, 'resumen'))}
                fullWidth
                testID="community-wrapped"
              >
                {t('village.wrapped.entry')}
              </Button>
            }
          />
        </View>
        <View className="bg-surface-elevated px-4 pt-2" style={{ paddingBottom: insets.bottom + 8 }}>
          <Button onPress={() => router.back()} fullWidth>
            {t('common.done')}
          </Button>
        </View>
      </View>
    </Screen>
  );
}

export default withVillageRoute(CommunityScreen);

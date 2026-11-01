import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Screen } from '../../components/primitives';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { ContentReportsInbox } from '../../components/feature/ContentReportsInbox';
import { useEntityCapabilities } from '../../lib/auth/useEntityCapabilities';
import { useT } from '../../lib/i18n';
import { villageHref } from '../../lib/navigation/routes';
import { useVillageRoute, withVillageRoute } from '../../lib/navigation/VillageRouteGate';

// The pueblo's team reviews what is reported in their own pueblo. Anyone else who
// deep-links here is bounced back to the village.
function VillageReportsScreen() {
  const { municipalityId, slug } = useVillageRoute();
  const { canManage, loading } = useEntityCapabilities(municipalityId);
  const { t } = useT();

  if (loading) {
    return (
      <Screen padded={false}>
        <ScreenHeader title={t('admin.reports.title')} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }
  if (!canManage) return <Redirect href={villageHref(slug)} />;
  return <ContentReportsInbox municipalityId={municipalityId} />;
}

export default withVillageRoute(VillageReportsScreen);

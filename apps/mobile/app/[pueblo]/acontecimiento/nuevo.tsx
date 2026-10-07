import { historyEntryHref, villageSectionHref } from '../../../lib/navigation/routes';
import { useVillageRoute, withVillageRoute } from '../../../lib/navigation/VillageRouteGate';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Screen } from '../../../components/primitives/Screen';
import { ScreenHeader } from '../../../components/layout/ScreenHeader';
import { HistoryEntryForm } from '../../../components/feature/history/HistoryEntryForm';
import { useT } from '../../../lib/i18n';
import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';
import { createHistoryEntry, newHistoryEntryId } from '@cultuvilla/shared/services/historyService';

function NewHistoryEntryScreen() {
  const { municipalityId: villageId, slug: villageSlug } = useVillageRoute();
  const { t } = useT();
  const { uid, isMember, loading } = useEntityCapabilities(villageId);
  // Minted once, up front: gallery images upload under this id before the doc exists.
  const [entryId] = useState(newHistoryEntryId);

  if (loading || !villageId) {
    return (
      <Screen padded={false} bottomInset={false}>
        <ScreenHeader title={t('village.history.newTitle')} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }
  if (!uid || !isMember) return <Redirect href={villageSectionHref(villageSlug, 'historia')} />;

  return (
    <Screen padded={false} bottomInset={false}>
      <ScreenHeader title={t('village.history.newTitle')} />
      <View style={{ flex: 1 }}>
        <HistoryEntryForm
          municipalityId={villageId}
          entryId={entryId}
          onSubmit={async (values) => {
            await createHistoryEntry(
              { ...values, municipalityId: villageId, createdBy: uid, createdAt: new Date() },
              entryId,
            );
            router.replace(historyEntryHref({ id: entryId, title: values.title, villageSlug }));
          }}
        />
      </View>
    </Screen>
  );
}

export default withVillageRoute(NewHistoryEntryScreen);

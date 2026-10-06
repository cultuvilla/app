import { entityRefHref, villageSectionHref } from '../../../../lib/navigation/routes';
import { parseEntityRef } from '@cultuvilla/shared/utils';
import { useVillageRoute, withVillageRoute } from '../../../../lib/navigation/VillageRouteGate';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Screen } from '../../../../components/primitives/Screen';
import { Text } from '../../../../components/primitives/Text';
import { ScreenHeader } from '../../../../components/layout/ScreenHeader';
import { DeleteHeaderButton } from '../../../../components/feature/DeleteHeaderButton';
import { HistoryEntryForm } from '../../../../components/feature/history/HistoryEntryForm';
import { useT } from '../../../../lib/i18n';
import { useEntityCapabilities } from '../../../../lib/auth/useEntityCapabilities';
import {
  deleteHistoryEntry,
  getHistoryEntry,
  updateHistoryEntry,
  type HistoryEntryWithId,
} from '@cultuvilla/shared/services/historyService';
import { hideContent } from '@cultuvilla/shared/services/moderationService';

function EditHistoryEntryScreen() {
  const { municipalityId: villageId, slug: villageSlug } = useVillageRoute();
  const { acontecimiento: acontecimientoRef } = useLocalSearchParams<{ acontecimiento: string }>();
  const entryId = parseEntityRef(acontecimientoRef ?? '') ?? '';
  const { t } = useT();
  const { canManage, canEdit, canDelete, loading: capLoading } = useEntityCapabilities(villageId);
  const [entry, setEntry] = useState<HistoryEntryWithId | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!entryId) return;
    void getHistoryEntry(entryId).then((e) => {
      setEntry(e);
      setLoaded(true);
    });
  }, [entryId]);

  if (capLoading || !loaded || !villageId || !entryId) {
    return (
      <Screen padded={false} bottomInset={false}>
        <ScreenHeader title={t('village.history.editTitle')} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }
  if (!entry) {
    return (
      <Screen padded={false} bottomInset={false}>
        <ScreenHeader title={t('village.history.editTitle')} />
        <View className="flex-1 items-center justify-center">
          <Text>{t('common.notFound')}</Text>
        </View>
      </Screen>
    );
  }
  if (!canEdit(entry.createdBy)) {
    return <Redirect href={entityRefHref('historyEntry', villageSlug, acontecimientoRef ?? '')} />;
  }

  // An admin *moderates* (audited soft-hide via the callable); an author
  // withdraws their own still-active entry outright, which the rules permit.
  function remove() {
    const done = () => router.replace(villageSectionHref(villageSlug, 'historia'));
    return canManage
      ? hideContent({ collection: 'historyEntries', docId: entryId }).then(done)
      : deleteHistoryEntry(entryId).then(done);
  }

  return (
    <Screen padded={false} bottomInset={false}>
      <ScreenHeader
        title={t('village.history.editTitle')}
        rightSlot={
          canDelete(entry.createdBy, entry.status) ? (
            <DeleteHeaderButton
              onConfirm={remove}
              accessibilityLabel={t('common.delete')}
              confirmTitle={t('common.deleteConfirmTitle')}
              confirmMessage={t('common.deleteConfirmMessage')}
              confirmLabel={t('common.delete')}
              cancelLabel={t('common.cancel')}
              deletingLabel={t('common.deleting.historyEntry')}
            />
          ) : undefined
        }
      />
      <View style={{ flex: 1 }}>
        <HistoryEntryForm
          municipalityId={villageId}
          entryId={entryId}
          initial={entry}
          onSubmit={async (values) => {
            await updateHistoryEntry(entryId, { ...values, updatedAt: new Date() });
            router.back();
          }}
        />
      </View>
    </Screen>
  );
}

export default withVillageRoute(EditHistoryEntryScreen);

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getReadableWrapped, type VillageWrapped } from '@cultuvilla/shared/services/villageWrappedService';
import { WRAPPED_CARDS } from '@cultuvilla/shared/models';
import { Button, ErrorState, Screen, Text, VStack } from '../../../components/primitives';
import { WrappedStoryViewer } from '../../../components/feature/wrapped/WrappedStoryViewer';
import { villageHref } from '../../../lib/navigation/routes';
import { useVillageRoute, withVillageRoute } from '../../../lib/navigation/VillageRouteGate';
import { useWrappedShare } from '../../../lib/wrapped/useWrappedShare';
import { useT } from '../../../lib/i18n';

type Load =
  | { status: 'loading' }
  | { status: 'ready'; wrapped: VillageWrapped }
  | { status: 'missing' }
  | { status: 'error'; error: unknown };

/**
 * A village's published fiestas Wrapped, as a story — the page its share link
 * opens. Public: anyone holding the link can read it, signed in or not.
 */
function WrappedViewerScreen() {
  const { municipalityId, slug, name } = useVillageRoute();
  const { year: yearParam } = useLocalSearchParams<{ year: string }>();
  const year = typeof yearParam === 'string' && /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;
  const { t } = useT();
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  const fetchWrapped = useCallback(async () => {
    if (year === null) {
      setLoad({ status: 'missing' });
      return;
    }
    setLoad({ status: 'loading' });
    try {
      const wrapped = await getReadableWrapped(municipalityId, year);
      setLoad(wrapped ? { status: 'ready', wrapped } : { status: 'missing' });
    } catch (error) {
      setLoad({ status: 'error', error });
    }
  }, [municipalityId, year]);

  useEffect(() => {
    void fetchWrapped();
  }, [fetchWrapped]);

  const share = useWrappedShare({ villageSlug: slug, villageName: name, year: year ?? 0 });
  const toVillage = () => router.replace(villageHref(slug));
  const close = () => (router.canGoBack() ? router.back() : toVillage());

  if (load.status === 'ready') {
    const cards = WRAPPED_CARDS.flatMap((card) => {
      const url = load.wrapped.images[card];
      return url ? [{ card, url }] : [];
    });
    return (
      <Screen padded={false} topInset={false}>
        <WrappedStoryViewer
          cards={cards}
          title={t('village.wrapped.viewer.title', { name: load.wrapped.villageName, year: String(load.wrapped.year) })}
          onClose={close}
          onShareLink={share.shareLink}
          onShareCard={share.shareCard}
          onOpenVillage={toVillage}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {load.status === 'loading' ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : load.status === 'error' ? (
        <ErrorState error={load.error} onRetry={fetchWrapped} />
      ) : (
        <VStack gap={3} className="flex-1 justify-center p-4" testID="wrapped-missing">
          <Text>{t('village.wrapped.viewer.missing')}</Text>
          <Button variant="secondary" onPress={toVillage} testID="wrapped-missing-village">
            {t('village.wrapped.viewer.openVillage')}
          </Button>
        </VStack>
      )}
    </Screen>
  );
}

export default withVillageRoute(WrappedViewerScreen);

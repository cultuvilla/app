import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getReadableWrapped, type VillageWrapped } from '@cultuvilla/shared/services/villageWrappedService';
import { watchFiestaProgrammeEvents } from '@cultuvilla/shared/services/eventService';
import { getWrappedLink } from '@cultuvilla/shared/services/deepLinkService';
import { madridDayKey, WRAPPED_CARDS, type EventData } from '@cultuvilla/shared/models';
import { Button, ErrorState, Screen, Text, VStack } from '../../../components/primitives';
import { ScreenHeader } from '../../../components/layout/ScreenHeader';
import { WrappedStoryViewer } from '../../../components/feature/wrapped/WrappedStoryViewer';
import { FiestaProgramme } from '../../../components/feature/fiestas/FiestaProgramme';
import { villageHref } from '../../../lib/navigation/routes';
import { useVillageRoute, withVillageRoute } from '../../../lib/navigation/VillageRouteGate';
import { useWrappedShare } from '../../../lib/wrapped/useWrappedShare';
import { useShareDeepLink } from '../../../lib/deeplink/useShareDeepLink';
import { useAuth } from '../../../lib/auth/useAuth';
import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useVillageFiestas } from '../../../lib/fiestas/useVillageFiestas';
import { editionsOfYear, undatedBlocks, type NamedEdition } from '../../../lib/fiestas/villageFiestas';
import { useT } from '../../../lib/i18n';

type Load =
  | { status: 'loading' }
  | { status: 'ready'; wrapped: VillageWrapped | null }
  | { status: 'error'; error: unknown };

/**
 * A village's fiestas for one year, at the one link it forwards all year:
 * the programa de fiestas before and during them, and the Wrapped story once
 * one is published, with the programme a tap away from its closing screen.
 * Public: anyone holding the link can read it, signed in or not. A member may
 * date a block that has no days yet (`?fechas=<blockId>` opens its editor),
 * and the proposer or an admin correct them.
 */
function FiestasYearScreen() {
  const { municipalityId, slug, name } = useVillageRoute();
  const { year: yearParam, vista, fechas } = useLocalSearchParams<{ year: string; vista?: string; fechas?: string }>();
  const year = typeof yearParam === 'string' && /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;
  const { t } = useT();
  const { user } = useAuth();
  const { canManage, isMember } = useEntityCapabilities(municipalityId);
  const today = madridDayKey(new Date());

  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [showProgramme, setShowProgramme] = useState(vista === 'programa');
  const [editing, setEditing] = useState<string | null>(typeof fechas === 'string' ? fechas : null);

  const fetchWrapped = useCallback(async () => {
    if (year === null) {
      setLoad({ status: 'ready', wrapped: null });
      return;
    }
    setLoad({ status: 'loading' });
    try {
      setLoad({ status: 'ready', wrapped: await getReadableWrapped(municipalityId, year) });
    } catch (error) {
      setLoad({ status: 'error', error });
    }
  }, [municipalityId, year]);

  useEffect(() => {
    void fetchWrapped();
  }, [fetchWrapped]);

  const fiestas = useVillageFiestas(municipalityId);
  const editions = useMemo(() => (year === null ? [] : editionsOfYear(fiestas.editions, year)), [fiestas.editions, year]);
  const editionIds = editions.map((e) => e.id);
  const programme = useWatch<(EventData & { id: string })[]>(
    'fiestas:watchFiestaProgrammeEvents',
    year === null ? null : `${municipalityId}:${editionIds.join(',')}`,
    (next, error) => watchFiestaProgrammeEvents(editionIds, next, error),
  );

  const share = useWrappedShare({ villageSlug: slug, villageName: name, year: year ?? 0 });
  const shareDeepLink = useShareDeepLink();
  const toVillage = () => router.replace(villageHref(slug));
  const close = () => (router.canGoBack() ? router.back() : toVillage());

  const wrapped = load.status === 'ready' ? load.wrapped : null;
  if (wrapped && !showProgramme) {
    const cards = WRAPPED_CARDS.flatMap((card) => {
      const url = wrapped.images[card];
      return url ? [{ card, url }] : [];
    });
    return (
      <Screen padded={false} topInset={false}>
        <WrappedStoryViewer
          cards={cards}
          title={t('village.wrapped.viewer.title', { name: wrapped.villageName, year: String(wrapped.year) })}
          onClose={close}
          onShareLink={share.shareLink}
          onShareCard={share.shareCard}
          onSaveCard={share.saveCard}
          onOpenVillage={toVillage}
          onOpenProgramme={editions.length > 0 ? () => setShowProgramme(true) : undefined}
        />
      </Screen>
    );
  }

  const missing = (message: string) => (
    <VStack gap={3} className="flex-1 justify-center p-4" testID="wrapped-missing">
      <Text>{message}</Text>
      <Button variant="secondary" onPress={toVillage} testID="wrapped-missing-village">
        {t('village.wrapped.viewer.openVillage')}
      </Button>
    </VStack>
  );
  if (year === null) return <Screen>{missing(t('village.wrapped.viewer.missing'))}</Screen>;

  const title = t('village.fiestas.programme.title', { year: String(year) });
  const loading = load.status === 'loading' || fiestas.status === 'loading' || programme.status === 'loading';
  const error = load.status === 'error' ? load.error : (fiestas.error ?? programme.error);
  const canPropose = isMember && user !== null;
  const undated = undatedBlocks(fiestas.fiestas, editions, year);
  const hasProgramme = editions.length > 0 || (canPropose && undated.length > 0);
  const canEdit = (edition: NamedEdition) => canManage || (user !== null && edition.proposedBy === user.uid);

  return (
    <Screen padded={false} topInset={false}>
      <ScreenHeader accent title={title} onBack={close} />
      {error != null ? (
        <ErrorState error={error} onRetry={fetchWrapped} />
      ) : loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : !hasProgramme ? (
        missing(t('village.fiestas.programme.missing', { year: String(year) }))
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <VStack gap={4}>
            <Text tone="muted">{name}</Text>
            {editions.length > 0 ? (
              <Button
                variant="secondary"
                onPress={() =>
                  void shareDeepLink(getWrappedLink(slug, year), t('village.fiestas.programme.shareName', { name, year: String(year) }))
                }
                fullWidth
                testID="fiesta-programme-share"
              >
                {t('village.fiestas.programme.share')}
              </Button>
            ) : null}
            {wrapped ? (
              <Button variant="secondary" onPress={() => setShowProgramme(false)} fullWidth testID="fiesta-programme-summary">
                {t('village.fiestas.programme.seeSummary')}
              </Button>
            ) : null}
            <FiestaProgramme
              municipalityId={municipalityId}
              villageSlug={slug}
              year={year}
              today={today}
              editions={editions}
              events={programme.data ?? []}
              undated={undated}
              uid={user?.uid ?? null}
              canPropose={canPropose}
              canEdit={canEdit}
              editing={editing}
              onEdit={setEditing}
            />
          </VStack>
        </ScrollView>
      )}
    </Screen>
  );
}

export default withVillageRoute(FiestasYearScreen);

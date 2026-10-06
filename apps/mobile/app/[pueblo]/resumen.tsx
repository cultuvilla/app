import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { madridDayKey, madridYear, type FiestaBlock } from '@cultuvilla/shared/models';
import { getMunicipality } from '@cultuvilla/shared/services/municipalityService';
import {
  buildVillageWrapped,
  getVillageWrappedForYear,
  respondToVillageWrapped,
  type VillageWrapped,
} from '@cultuvilla/shared/services/villageWrappedService';
import type { WrappedRequest } from '@cultuvilla/shared/wrapped';
import { Button, ErrorState, Screen, Text, VStack } from '../../components/primitives';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { WrappedCreateForm } from '../../components/feature/wrapped/WrappedCreateForm';
import { WrappedReview } from '../../components/feature/wrapped/WrappedReview';
import { useEntityCapabilities } from '../../lib/auth/useEntityCapabilities';
import { useCallable } from '../../lib/useCallable';
import { showConfirm } from '../../lib/dialogs';
import { villageHref, villageSectionHref } from '../../lib/navigation/routes';
import { useVillageRoute, withVillageRoute } from '../../lib/navigation/VillageRouteGate';
import { initialWrappedForm, type WrappedFormState } from '../../lib/wrapped/wrappedForm';
import { useT } from '../../lib/i18n';

/**
 * A village admin's fiestas Wrapped for one year — the current one, or the
 * `?year=` a reminder names (a January reminder is about December's fiestas,
 * which belong to last year): create it by picking the days of each fiesta and
 * the range to count over, then review the cards and publish or discard.
 * Regenerating starts from the dates already used.
 */
function WrappedScreen() {
  const { municipalityId: villageId, slug: villageSlug } = useVillageRoute();
  const { canManage, loading: capsLoading } = useEntityCapabilities(villageId);
  const { t } = useT();

  const { year: yearParam } = useLocalSearchParams<{ year?: string }>();
  const now = new Date();
  const currentYear = madridYear(now);
  // Only a past or current year: a future one has no fiestas to sum up yet.
  const asked = typeof yearParam === 'string' && /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;
  const year = asked !== null && asked <= currentYear ? asked : currentYear;
  const today = madridDayKey(now);

  const [fiestas, setFiestas] = useState<FiestaBlock[] | null>(null);
  const [wrapped, setWrapped] = useState<VillageWrapped | null>(null);
  const [form, setForm] = useState<WrappedFormState | null>(null);
  const [editing, setEditing] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!villageId) return;
    setLoadError(null);
    try {
      const [m, w] = await Promise.all([getMunicipality(villageId), getVillageWrappedForYear(villageId, year)]);
      const blocks = m?.community?.fiestas ?? [];
      setFiestas(blocks);
      setWrapped(w);
      setForm(initialWrappedForm(blocks, today, w));
    } catch (error) {
      // Surfaced, not swallowed: the screen's whole render gates on `fiestas`,
      // so a rejected read here is indistinguishable from a slow one and shows
      // an endless spinner. Offer the retry rather than a dead screen.
      setLoadError(error);
    }
  }, [villageId, year, today]);

  useEffect(() => {
    if (canManage) void load();
  }, [canManage, load]);

  const build = useCallable({
    callable: (request: WrappedRequest) => buildVillageWrapped(request),
    onSuccess: async () => {
      setEditing(false);
      await load();
    },
    swallow: true,
  });

  const decide = useCallable({
    callable: (decision: 'publish' | 'discard') => respondToVillageWrapped(wrapped?.id ?? '', decision),
    onSuccess: load,
    swallow: true,
  });

  if (!villageId) return null;
  if (!capsLoading && !canManage) return <Redirect href={villageHref(villageSlug)} />;

  const title = t('village.wrapped.title', { year: String(year) });
  const ready = !capsLoading && fiestas !== null && form !== null;

  return (
    <Screen padded={false} topInset={false}>
      <ScreenHeader accent title={title} />
      {loadError != null ? (
        <ErrorState error={loadError} onRetry={load} />
      ) : !ready ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : fiestas.length === 0 ? (
        <VStack gap={3} className="p-4">
          <Text>{t('village.wrapped.noFiestas')}</Text>
          <Button
            onPress={() => router.replace(villageSectionHref(villageSlug, 'comunidad'))}
            variant="secondary"
            testID="wrapped-go-fiestas"
          >
            {t('village.wrapped.goFiestas')}
          </Button>
        </VStack>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {wrapped && !editing ? (
            <VStack gap={4}>
              <WrappedReview
                wrapped={wrapped}
                villageSlug={villageSlug}
                deciding={decide.isPending}
                onPublish={() => void decide.fire('publish')}
                onDiscard={() =>
                  showConfirm(t('village.wrapped.discardTitle'), t('village.wrapped.discardMessage'), () => {
                    void decide.fire('discard');
                  }, { confirmText: t('village.wrapped.discard') })
                }
              />
              <Button variant="secondary" onPress={() => setEditing(true)} fullWidth testID="wrapped-edit">
                {t('village.wrapped.regenerate')}
              </Button>
            </VStack>
          ) : (
            <WrappedCreateForm
              municipalityId={villageId}
              year={year}
              today={today}
              fiestas={fiestas}
              state={form}
              onChange={setForm}
              onSubmit={(request) => void build.fire(request)}
              submitting={build.isPending}
              submitLabel={wrapped ? t('village.wrapped.submitRegenerate') : t('village.wrapped.submit')}
            />
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

export default withVillageRoute(WrappedScreen);

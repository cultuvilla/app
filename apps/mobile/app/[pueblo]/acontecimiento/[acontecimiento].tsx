import { historyEntryEditHref } from '../../../lib/navigation/routes';
import { parseEntityRef } from '@cultuvilla/shared/utils';
import { useVillageRoute, withVillageRoute } from '../../../lib/navigation/VillageRouteGate';
import { useEffect } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { Text } from '../../../components/primitives/Text';
import { VStack } from '../../../components/primitives/VStack';
import { NaturalImage } from '../../../components/primitives/NaturalImage';
import { EntityDetailScaffold } from '../../../components/feature/EntityDetailScaffold';
import type { EntityDetailAction } from '../../../components/feature/EntityDetailHeader';
import { EntityComments } from '../../../components/feature/EntityComments';
import { RichText } from '../../../components/feature/RichText';
import { ENTITY_FALLBACK_ICON } from '../../../lib/entities/registry';
import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';
import { useShareDeepLink } from '../../../lib/deeplink/useShareDeepLink';
import { useT } from '../../../lib/i18n';
import { useWatch } from '../../../lib/hooks/useWatch';
import { observability, OBSERVABILITY_EVENTS } from '@cultuvilla/shared';
import {
  watchHistoryEntry,
  type HistoryEntryWithId,
} from '@cultuvilla/shared/services/historyService';
import { recordEntityView } from '@cultuvilla/shared/services/commentsService';
import { getHistoryEntryViewLink } from '@cultuvilla/shared/services/deepLinkService';
import { formatHistoryEntryDate } from '@cultuvilla/shared/utils';

function HistoryEntryDetailScreen() {
  const { municipalityId: villageId, slug: villageSlug } = useVillageRoute();
  const { acontecimiento: acontecimientoRef } = useLocalSearchParams<{ acontecimiento: string }>();
  const entryId = parseEntityRef(acontecimientoRef ?? '') ?? '';
  const { t } = useT();
  const share = useShareDeepLink();
  const { canManage, canEdit } = useEntityCapabilities(villageId);
  const { data: entry = null, status } = useWatch<HistoryEntryWithId | null>(
    'historyEntryDetail:watchHistoryEntry',
    entryId || null,
    (next, error) => watchHistoryEntry(entryId, next, error),
  );
  const loading = status === 'loading';

  useEffect(() => {
    if (!entry) return;
    void recordEntityView({
      entityKind: 'historyEntry',
      entityId: entry.id,
      municipalityId: entry.municipalityId,
    });
    observability.trackEvent(OBSERVABILITY_EVENTS.CONTENT_DETAIL_VIEWED, {
      entityKind: 'historyEntry',
      entityId: entry.id,
      municipalityId: entry.municipalityId,
    });
  }, [entry?.id]);

  const actions: EntityDetailAction[] = entry
    ? [
        ...(canEdit(entry.createdBy)
          ? [
              {
                icon: 'create-outline' as const,
                accessibilityLabel: t('common.edit'),
                onPress: () =>
                  router.push(historyEntryEditHref({ ...entry, villageSlug })),
              },
            ]
          : []),
        {
          icon: 'share-outline',
          accessibilityLabel: t('deeplink.shareViewLabel'),
          onPress: () => void share(getHistoryEntryViewLink({ id: entry.id, title: entry.title, villageSlug }), entry.title),
        },
      ]
    : [];

  const [cover, ...gallery] = entry?.images ?? [];

  return (
    <EntityDetailScaffold
      loading={loading}
      notFound={!loading && !entry}
      imageUri={cover?.url ?? null}
      fallbackIcon={ENTITY_FALLBACK_ICON.historyEntry}
      actions={actions}
      title={entry?.title}
    >
      {entry ? (
        <>
          <Text className="font-bold text-accent" testID="history-entry-date">
            {formatHistoryEntryDate(entry)}
          </Text>
          {cover?.caption ? (
            <Text tone="muted" variant="caption">
              {cover.caption}
            </Text>
          ) : null}
          {entry.body.text ? (
            <RichText
              text={entry.body.text}
              mentions={entry.body.mentions}
              links={entry.body.links}
              marks={entry.body.marks}
              villageSlug={villageSlug}
            />
          ) : null}
          {gallery.length > 0 ? (
            <VStack gap={3} className="pt-2">
              {gallery.map((img) => (
                <VStack key={img.url} gap={1}>
                  <NaturalImage uri={img.url} />
                  {img.caption ? (
                    <Text tone="muted" variant="caption" className="text-center">
                      {img.caption}
                    </Text>
                  ) : null}
                </VStack>
              ))}
            </VStack>
          ) : null}
          {entry.sources ? (
            <VStack gap={1} className="pt-2">
              <Text variant="bodySm" className="font-bold">
                {t('village.history.sources')}
              </Text>
              <RichText
                text={entry.sources}
                mentions={[]}
                villageSlug={villageSlug}
                tone="muted"
                variant="bodySm"
              />
            </VStack>
          ) : null}
          <EntityComments
            key={entry.id}
            entityKind="historyEntry"
            entityId={entry.id}
            municipalityId={entry.municipalityId}
            canModerate={canManage}
          />
        </>
      ) : null}
    </EntityDetailScaffold>
  );
}

export default withVillageRoute(HistoryEntryDetailScreen);

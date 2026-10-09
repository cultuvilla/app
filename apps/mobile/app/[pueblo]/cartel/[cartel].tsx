import { festivalPosterEditHref } from '../../../lib/navigation/routes';
import { parseEntityRef } from '@cultuvilla/shared/utils';
import { useVillageRoute, withVillageRoute } from '../../../lib/navigation/VillageRouteGate';
import { useEffect } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { Text } from '../../../components/primitives/Text';
import { VStack } from '../../../components/primitives/VStack';
import { NaturalImage } from '../../../components/primitives/NaturalImage';
import { EntityDetailScaffold } from '../../../components/feature/EntityDetailScaffold';
import type { EntityDetailAction } from '../../../components/feature/EntityDetailHeader';
import { ENTITY_FALLBACK_ICON } from '../../../lib/entities/registry';
import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';
import { EntityComments } from '../../../components/feature/EntityComments';
import { EntityContributors } from '../../../components/feature/EntityContributors';
import { useT } from '../../../lib/i18n';
import { useWatch } from '../../../lib/hooks/useWatch';
import { observability, OBSERVABILITY_EVENTS } from '@cultuvilla/shared';
import { watchFestivalPoster } from '@cultuvilla/shared/services/festivalPosterService';
import { recordEntityView } from '@cultuvilla/shared/services/commentsService';
import type { FestivalPosterWithId } from '@cultuvilla/shared/services/festivalPosterService';
import { formatFestivalPosterDates } from '@cultuvilla/shared/utils';

function FestivalPosterDetailScreen() {
  const { municipalityId: villageId, slug: villageSlug } = useVillageRoute();
  const { cartel: cartelRef } = useLocalSearchParams<{ cartel: string }>();
  const posterId = parseEntityRef(cartelRef ?? '') ?? '';
  const { t } = useT();
  const { canManage, canEdit } = useEntityCapabilities(villageId);
  const { data: poster = null, status } = useWatch<FestivalPosterWithId | null>(
    'festivalPosterDetail:watchFestivalPoster',
    posterId || null,
    (next, error) => watchFestivalPoster(posterId, next, error),
  );
  const loading = status === 'loading';

  useEffect(() => {
    if (!poster) return;
    void recordEntityView({
      entityKind: 'festivalPoster',
      entityId: poster.id,
      municipalityId: poster.municipalityId,
    });
    observability.trackEvent(OBSERVABILITY_EVENTS.CONTENT_DETAIL_VIEWED, {
      entityKind: 'festivalPoster',
      entityId: poster.id,
      municipalityId: poster.municipalityId,
    });
  }, [poster?.id]);

  const dateLabel = poster ? formatFestivalPosterDates(poster) : '';
  const subtitle = poster
    ? [poster.title ? String(poster.year) : null, dateLabel].filter(Boolean).join(' · ')
    : '';

  const actions: EntityDetailAction[] =
    poster && canEdit(poster.proposedBy)
      ? [
          {
            icon: 'create-outline',
            testID: 'poster-edit-action',
            accessibilityLabel: t('common.edit'),
            onPress: () =>
              router.push(festivalPosterEditHref({ ...poster, villageSlug })),
          },
        ]
      : [];

  return (
    <EntityDetailScaffold
      loading={loading}
      notFound={!loading && !poster}
      imageUri={poster?.images[0] ?? null}
      fallbackIcon={ENTITY_FALLBACK_ICON.festivalPoster}
      actions={actions}
      title={poster ? (poster.title ?? String(poster.year)) : undefined}
    >
      {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
      {poster ? (
        <EntityContributors
          userIds={poster.contributorUserIds}
          orgIds={poster.contributorOrgIds}
          label={t('village.contributors.label')}
        />
      ) : null}
      {poster && poster.images.length > 1 ? (
        <VStack gap={2} className="pt-2">
          {poster.images.slice(1).map((uri) => (
            <NaturalImage key={uri} uri={uri} />
          ))}
        </VStack>
      ) : null}
      {poster ? (
        <EntityComments
          key={poster.id}
          entityKind="festivalPoster"
          entityId={poster.id}
          municipalityId={poster.municipalityId}
          canModerate={canManage}
        />
      ) : null}
    </EntityDetailScaffold>
  );
}

export default withVillageRoute(FestivalPosterDetailScreen);

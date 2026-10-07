import { barrioEditHref, personHref, routes, userHref } from '../../../lib/navigation/routes';
import { parseEntityRef } from '@cultuvilla/shared/utils';
import { useVillageRoute, withVillageRoute } from '../../../lib/navigation/VillageRouteGate';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { iconSizes } from '@cultuvilla/shared/design-system';
import { Text } from '../../../components/primitives/Text';
import { VStack } from '../../../components/primitives/VStack';
import { HStack } from '../../../components/primitives/HStack';
import { Avatar } from '../../../components/primitives/Avatar';
import { Pressable } from '../../../components/primitives/Pressable';
import { NaturalImage } from '../../../components/primitives/NaturalImage';
import { EntityDetailScaffold } from '../../../components/feature/EntityDetailScaffold';
import type { EntityDetailAction } from '../../../components/feature/EntityDetailHeader';
import { ENTITY_FALLBACK_ICON } from '../../../lib/entities/registry';
import { DetailSectionHeading } from '../../../components/feature/DetailSectionHeading';
import { EntityComments } from '../../../components/feature/EntityComments';
import { useT } from '../../../lib/i18n';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useShareDeepLink } from '../../../lib/deeplink/useShareDeepLink';
import { useAuth } from '../../../lib/auth/useAuth';
import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';
import { observability, OBSERVABILITY_EVENTS } from '@cultuvilla/shared';
import { watchBarrio } from '@cultuvilla/shared/services/municipalityService';
import { recordEntityView } from '@cultuvilla/shared/services/commentsService';
import { getBarrioViewLink } from '@cultuvilla/shared/services/deepLinkService';
import { getMunicipalityPeopleByBarrio } from '@cultuvilla/shared/services/municipalityPersonService';
import type { BarrioData, MunicipalityPersonData } from '@cultuvilla/shared/models/municipality';

type Barrio = BarrioData & { id: string };
type Resident = MunicipalityPersonData & { id: string };

function BarrioDetailScreen() {
  const { municipalityId: villageId, slug: villageSlug } = useVillageRoute();
  const { barrio: barrioRef } = useLocalSearchParams<{ barrio: string }>();
  const barrioId = parseEntityRef(barrioRef ?? '') ?? '';
  const { t } = useT();
  const { user } = useAuth();
  const share = useShareDeepLink();
  const { canManage, canEdit } = useEntityCapabilities(villageId);
  const { data: barrio = null, status } = useWatch<Barrio | null>(
    'barrioDetail:watchBarrio',
    villageId && barrioId ? `${villageId}/${barrioId}` : null,
    (next, error) => watchBarrio(villageId, barrioId, next, error),
  );
  const [residents, setResidents] = useState<Resident[] | null>(null);
  const loading = status === 'loading';

  const loadResidents = useCallback(async () => {
    if (!villageId || !barrioId) return;
    // Deceased residents are already absent: the directory trigger drops their
    // municipality links, because they belong to the cemetery view.
    setResidents(await getMunicipalityPeopleByBarrio(villageId, barrioId));
  }, [villageId, barrioId]);

  useFocusEffect(
    useCallback(() => {
      void loadResidents();
    }, [loadResidents]),
  );

  useEffect(() => {
    if (!barrio) return;
    void recordEntityView({ entityKind: 'barrio', entityId: barrio.id, municipalityId: barrio.municipalityId });
    observability.trackEvent(OBSERVABILITY_EVENTS.CONTENT_DETAIL_VIEWED, {
      entityKind: 'barrio',
      entityId: barrio.id,
      municipalityId: barrio.municipalityId,
    });
  }, [barrio?.id]);

  const actions: EntityDetailAction[] = barrio
    ? [
        ...(canEdit(barrio.proposedBy)
          ? [
              {
                icon: 'create-outline' as const,
                accessibilityLabel: t('common.edit'),
                onPress: () => router.push(barrioEditHref(villageSlug, barrio)),
              },
            ]
          : []),
        {
          icon: 'share-outline',
          accessibilityLabel: t('deeplink.shareViewLabel'),
          onPress: () => void share(getBarrioViewLink({ id: barrio.id, title: barrio.name, villageSlug }), barrio.name),
        },
      ]
    : [];

  return (
    <EntityDetailScaffold
      loading={loading}
      notFound={!loading && !barrio}
      imageUri={barrio?.images[0] ?? null}
      fallbackIcon={ENTITY_FALLBACK_ICON.barrio}
      actions={actions}
      title={barrio?.name}
      onRefresh={loadResidents}
    >
      {barrio ? (
        <>
          {barrio.images.length > 1 ? (
            <VStack gap={2} className="pt-2">
              {barrio.images.slice(1).map((uri) => (
                <NaturalImage key={uri} uri={uri} />
              ))}
            </VStack>
          ) : null}
          <DetailSectionHeading>{t('village.barrioDetail.residents')}</DetailSectionHeading>
          {!residents ? null : residents.length === 0 ? (
            <Text tone="muted" variant="bodySm">
              {t('village.barrioDetail.residentsEmpty')}
            </Text>
          ) : (
            <VStack>
              {residents.map((p) => {
                const name = p.displayName;
                // Everyone in the barrio is listed. Only a private dependent's
                // row leads nowhere — their person doc is unreadable to anyone
                // but its creator, so there is nothing to open.
                const linkedUid = p.userId;
                const onPress = linkedUid
                  ? () =>
                      router.push(
                        linkedUid === user?.uid ? routes.profile : userHref(linkedUid),
                      )
                  : p.isPublic
                  ? () => router.push(personHref(p.personId))
                  : undefined;
                const row = (
                  <HStack gap={2} className="items-center py-3 border-b border-subtle">
                    <Avatar uri={p.photoURL} size={32} initials={name.slice(0, 1).toUpperCase()} />
                    <Text numberOfLines={1} className="flex-1">
                      {name}
                    </Text>
                    {onPress ? null : (
                      <Ionicons
                        name="lock-closed-outline"
                        size={iconSizes.sm}
                        color="#9ca3af"
                        accessibilityLabel={t('profile.personPrivate')}
                      />
                    )}
                  </HStack>
                );
                return onPress ? (
                  <Pressable key={p.id} onPress={onPress} accessibilityRole="button" accessibilityLabel={name}>
                    {row}
                  </Pressable>
                ) : (
                  <View key={p.id}>{row}</View>
                );
              })}
            </VStack>
          )}
          <EntityComments
            key={barrio.id}
            entityKind="barrio"
            entityId={barrio.id}
            municipalityId={barrio.municipalityId}
            canModerate={canManage}
          />
        </>
      ) : null}
    </EntityDetailScaffold>
  );
}

export default withVillageRoute(BarrioDetailScreen);

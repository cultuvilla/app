import { placeEditHref } from '../../../lib/navigation/routes';
import { parseEntityRef } from '@cultuvilla/shared/utils';
import { useVillageRoute, withVillageRoute } from '../../../lib/navigation/VillageRouteGate';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable as RNPressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../components/primitives/Text';
import { VStack } from '../../../components/primitives/VStack';
import { HStack } from '../../../components/primitives/HStack';
import { Avatar } from '../../../components/primitives/Avatar';
import { Button } from '../../../components/primitives/Button';
import { Pressable } from '../../../components/primitives/Pressable';
import { PartialDateField } from '../../../components/primitives/PartialDateField';
import { NaturalImage } from '../../../components/primitives/NaturalImage';
import { EntityDetailScaffold } from '../../../components/feature/EntityDetailScaffold';
import { LocationMap } from '../../../components/feature/LocationMap';
import { BuryFab } from '../../../components/feature/BuryFab';
import type { EntityDetailAction } from '../../../components/feature/EntityDetailHeader';
import { ENTITY_FALLBACK_ICON } from '../../../lib/entities/registry';
import { DetailSectionHeading } from '../../../components/feature/DetailSectionHeading';
import { EntityComments } from '../../../components/feature/EntityComments';
import { EntityContributors } from '../../../components/feature/EntityContributors';
import { useT } from '../../../lib/i18n';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useShareDeepLink } from '../../../lib/deeplink/useShareDeepLink';
import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';
import { showAlert } from '../../../lib/dialogs';
import { observability, OBSERVABILITY_EVENTS } from '@cultuvilla/shared';
import { watchPlace } from '@cultuvilla/shared/services/municipalityService';
import { recordEntityView } from '@cultuvilla/shared/services/commentsService';
import { getPlaceViewLink } from '@cultuvilla/shared/services/deepLinkService';
import { getPersonsByBurialPlace, updatePerson } from '@cultuvilla/shared/services/personService';
import { buildDisplayName, type PartialDate } from '@cultuvilla/shared/models/person';
import type { PlaceData } from '@cultuvilla/shared/models/municipality';
import type { PersonData } from '@cultuvilla/shared/models/person';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { formatPartialDate } from '@cultuvilla/shared/utils/format';

/**
 * A place is a single building or square, so its map is framed tighter than the
 * village-wide default — enough to see the street it sits on.
 */
const PLACE_MAP_ZOOM = 17;

type Place = PlaceData & { id: string };
type Person = PersonData & { id: string };

function deathDateSortValue(person: Person): number {
  const date = person.deathDate;
  if (!date?.year) return Number.NEGATIVE_INFINITY;
  return new Date(date.year, (date.month ?? 1) - 1, date.day ?? 1).getTime();
}

export function sortBuriedByDeathDate(people: Person[]): Person[] {
  return [...people].sort((a, b) => deathDateSortValue(b) - deathDateSortValue(a));
}

function PlaceDetailScreen() {
  const { municipalityId: villageId, slug: villageSlug } = useVillageRoute();
  const { lugar: lugarRef } = useLocalSearchParams<{ lugar: string }>();
  const placeId = parseEntityRef(lugarRef ?? '') ?? '';
  const { t } = useT();
  const share = useShareDeepLink();
  const { data: place = null, status } = useWatch<Place | null>(
    'placeDetail:watchPlace',
    villageId && placeId ? `${villageId}/${placeId}` : null,
    (next, error) => watchPlace(villageId, placeId, next, error),
  );
  const loading = status === 'loading';
  const [buried, setBuried] = useState<Person[] | null>(null);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [editingDeathDate, setEditingDeathDate] = useState<PartialDate | null>(null);
  const [savingBurial, setSavingBurial] = useState(false);
  const { canManage, canEdit, uid } = useEntityCapabilities(villageId);
  const insets = useSafeAreaInsets();
  const isCemetery = place?.kind === 'cemetery';

  const loadBuried = useCallback(async () => {
    if (!isCemetery) return;
    setBuried(await getPersonsByBurialPlace(placeId, uid));
  }, [isCemetery, placeId, uid]);

  useFocusEffect(
    useCallback(() => {
      void loadBuried();
    }, [loadBuried]),
  );

  useEffect(() => {
    if (!place) return;
    void recordEntityView({ entityKind: 'place', entityId: place.id, municipalityId: place.municipalityId });
    observability.trackEvent(OBSERVABILITY_EVENTS.CONTENT_DETAIL_VIEWED, {
      entityKind: 'place',
      entityId: place.id,
      municipalityId: place.municipalityId,
    });
  }, [place?.id]);

  const actions: EntityDetailAction[] = place
    ? [
        ...(canEdit(place.proposedBy)
          ? [
              {
                icon: 'create-outline' as const,
                accessibilityLabel: t('common.edit'),
                onPress: () => router.push(placeEditHref(villageSlug, place)),
              },
            ]
          : []),
        {
          icon: 'share-outline',
          accessibilityLabel: t('deeplink.shareViewLabel'),
          onPress: () => void share(getPlaceViewLink({ id: place.id, title: place.name, villageSlug }), place.name),
        },
      ]
    : [];
  const sortedBuried = sortBuriedByDeathDate(buried ?? []);

  function canEditPerson(person: Person): boolean {
    return uid != null && (person.userId === uid || (person.userId == null && person.createdBy === uid));
  }

  function openBurialEditor(person: Person) {
    if (!canEditPerson(person)) return;
    setEditingPerson(person);
    setEditingDeathDate(person.deathDate);
  }

  async function saveDeathDate() {
    if (!editingPerson) return;
    setSavingBurial(true);
    try {
      await updatePerson(editingPerson.id, { deathDate: editingDeathDate });
      setEditingPerson(null);
      await loadBuried();
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'error', buildDisplayName(editingPerson));
    } finally {
      setSavingBurial(false);
    }
  }

  async function removeFromCemetery() {
    if (!editingPerson) return;
    setSavingBurial(true);
    try {
      await updatePerson(editingPerson.id, { burialPlace: null });
      setEditingPerson(null);
      await loadBuried();
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'error', buildDisplayName(editingPerson));
    } finally {
      setSavingBurial(false);
    }
  }

  return (
    <>
      <EntityDetailScaffold
        loading={loading}
        notFound={!loading && !place}
        imageUri={place?.images[0] ?? null}
        fallbackIcon={ENTITY_FALLBACK_ICON.place}
        actions={actions}
        title={place?.name}
        onRefresh={isCemetery ? loadBuried : undefined}
      >
        {place ? (
          <>
            <Text tone="muted" variant="bodySm">
              {t(`village.admin.places.kind.${place.kind}` as never)}
            </Text>
            {place.description ? <Text>{place.description}</Text> : null}
            <LocationMap
              coordinates={place.coordinates}
              label={place.locationLabel}
              zoom={PLACE_MAP_ZOOM}
              testID="place-location-map"
            />
            <EntityContributors
              userIds={place.contributorUserIds}
              orgIds={place.contributorOrgIds}
              label={t('village.contributors.label')}
            />
            {place.images.length > 1 ? (
              <VStack gap={2} className="pt-2">
                {place.images.slice(1).map((uri) => (
                  <NaturalImage key={uri} uri={uri} />
                ))}
              </VStack>
            ) : null}
            {place.kind === 'cemetery' ? (
              <VStack gap={3}>
                <DetailSectionHeading>{t('village.placeDetail.buried')}</DetailSectionHeading>
                {!buried ? null : buried.length === 0 ? (
                  <Text tone="muted" variant="bodySm">
                    {t('village.placeDetail.buriedEmpty')}
                  </Text>
                ) : (
                  <VStack gap={1}>
                    {sortedBuried.map((p) => {
                      const name = buildDisplayName(p);
                      const date =
                        editingPerson?.id === p.id
                          ? null
                          : (formatPartialDate(p.deathDate) ?? t('village.placeDetail.deathDateUnknown'));
                      const editable = canEditPerson(p);
                      const row = (
                        <HStack gap={3} align="center" className="py-2">
                          <Avatar uri={p.photoURL} size={36} initials={name.slice(0, 1).toUpperCase()} />
                          <Text numberOfLines={1} className="flex-1">
                            {name}
                          </Text>
                          {p.isPublic ? null : (
                            // Only the creator's own query returns a private
                            // persona, so this row is invisible to everyone
                            // else — the lock says so rather than leaving them
                            // to wonder why nobody mentions seeing it.
                            <Ionicons
                              testID={`buried-person-private-${p.id}`}
                              name="lock-closed-outline"
                              size={iconSizes.sm}
                              color={colors.light.fg.muted}
                            />
                          )}
                          {date ? (
                            <Text
                              testID={`buried-person-date-${p.id}`}
                              tone="muted"
                              variant="bodySm"
                              numberOfLines={1}
                            >
                              {date}
                            </Text>
                          ) : null}
                          {editable ? (
                            <Ionicons name="chevron-forward" size={iconSizes.sm} color={colors.light.fg.muted} />
                          ) : null}
                        </HStack>
                      );
                      return editable ? (
                        <Pressable
                          key={p.id}
                          testID={`buried-person-row-${p.id}`}
                          accessibilityRole="button"
                          accessibilityLabel={name}
                          onPress={() => openBurialEditor(p)}
                        >
                          {row}
                        </Pressable>
                      ) : (
                        <View key={p.id} testID={`buried-person-row-${p.id}`}>
                          {row}
                        </View>
                      );
                    })}
                  </VStack>
                )}
              </VStack>
            ) : null}
            <EntityComments
              key={place.id}
              entityKind="place"
              entityId={place.id}
              municipalityId={place.municipalityId}
              canModerate={canManage}
            />
          </>
        ) : null}
      </EntityDetailScaffold>
      {place && place.kind === 'cemetery' && uid && villageId ? (
        <BuryFab
          municipalityId={place.municipalityId}
          placeId={place.id}
          userId={uid}
          buriedHereIds={(buried ?? []).map((p) => p.id)}
          onChanged={loadBuried}
        />
      ) : null}
      <Modal
        visible={editingPerson !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!savingBurial) setEditingPerson(null);
        }}
      >
        <RNPressable
          accessible={false}
          onPress={() => {
            if (!savingBurial) setEditingPerson(null);
          }}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
          className="justify-end"
        >
          <RNPressable
            accessible={false}
            // Its backdrop is not an accessibility element, so VoiceOver closes the
            // sheet with the escape gesture instead.
            onAccessibilityEscape={() => {
              if (!savingBurial) setEditingPerson(null);
            }}
            onPress={() => {}}
            style={{ paddingBottom: insets.bottom + 20 }}
            className="rounded-t-2xl bg-surface-elevated p-5 border-t border-subtle"
          >
            {editingPerson ? (
              <VStack gap={4}>
                <Text variant="h2" className="font-semibold" testID="buried-edit-person-name">
                  {buildDisplayName(editingPerson)}
                </Text>
                <PartialDateField
                  label={t('village.placeDetail.deathDatePrompt')}
                  value={editingDeathDate}
                  onChange={setEditingDeathDate}
                  showClearAction={false}
                  testID="buried-edit-death-date"
                />
                <HStack gap={3} className="items-center justify-end">
                  <Button
                    variant="secondary"
                    onPress={() => void removeFromCemetery()}
                    loading={savingBurial}
                    testID="buried-remove"
                  >
                    {t('village.placeDetail.removeBurial')}
                  </Button>
                  <Button onPress={() => void saveDeathDate()} loading={savingBurial} testID="buried-save-date">
                    {t('common.save')}
                  </Button>
                </HStack>
              </VStack>
            ) : null}
          </RNPressable>
        </RNPressable>
      </Modal>
    </>
  );
}

export default withVillageRoute(PlaceDetailScreen);

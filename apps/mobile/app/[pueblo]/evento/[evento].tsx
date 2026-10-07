import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { Linking, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { VStack } from '../../../components/primitives/VStack';
import { HStack } from '../../../components/primitives/HStack';
import { Text } from '../../../components/primitives/Text';
import { Button } from '../../../components/primitives/Button';
import { Avatar } from '../../../components/primitives/Avatar';
import { Pressable } from '../../../components/primitives/Pressable';
import { LiveOwnerChip } from '../../../components/feature/LiveOwnerChip';
import { openOwner } from '../../../lib/entities/ownerRoute';
import { createEventHref, eventHref, villageHref } from '../../../lib/navigation/routes';
import { parseEntityRef } from '@cultuvilla/shared/utils';
import { RegisterFab } from '../../../components/feature/RegisterFab';
import { EventAttendees } from '../../../components/feature/EventAttendees';
import { RegistrationHistory } from '../../../components/feature/RegistrationHistory';
import { DetailSectionHeading } from '../../../components/feature/DetailSectionHeading';
import { EntityDetailScaffold } from '../../../components/feature/EntityDetailScaffold';
import type { EntityDetailAction } from '../../../components/feature/EntityDetailHeader';
import { DetailInfoCard } from '../../../components/feature/DetailInfoCard';
import { birthYearRangeLabel } from '../../../lib/events/birthYearLabel';
import { EntityComments } from '../../../components/feature/EntityComments';
import { ENTITY_FALLBACK_ICON } from '../../../lib/entities/registry';
import { useAuth } from '../../../lib/auth/useAuth';
import { useRegisterGate } from '../../../lib/auth/RegisterGateContext';
import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';
import { useShareDeepLink } from '../../../lib/deeplink/useShareDeepLink';
import { watchEvent } from '@cultuvilla/shared/services/eventService';
import { observability, OBSERVABILITY_EVENTS } from '@cultuvilla/shared';
import { recordEntityView } from '@cultuvilla/shared/services/commentsService';
import { getEventLink } from '@cultuvilla/shared/services/deepLinkService';
import { getPersonByUserId } from '@cultuvilla/shared/services/personService';
import { watchMunicipality } from '@cultuvilla/shared/services/municipalityService';
import { escudoThumbDisplayUrl } from '@cultuvilla/shared/models/municipality';
import { buildNameWithNickname } from '@cultuvilla/shared/models/person/PersonDataModel';
import { formatDate, buildGoogleCalendarUrl } from '@cultuvilla/shared/utils';
import { useT } from '../../../lib/i18n';
import { useWatch } from '../../../lib/hooks/useWatch';
import { isPrivateEvent } from '@cultuvilla/shared/models/event/EventDataModel';
import type { EventData } from '@cultuvilla/shared/models/event/EventDataModel';
import type { PersonData } from '@cultuvilla/shared/models/person/PersonDataModel';
import type { MunicipalityData } from '@cultuvilla/shared/models/municipality';

type EventDoc = EventData & { id: string };
type PersonDoc = PersonData & { id: string };
type VillageDoc = MunicipalityData & { id: string };

export default function EventDetailScreen() {
  const { evento } = useLocalSearchParams<{ evento: string }>();
  const eventId = parseEntityRef(evento ?? '') ?? '';
  const { user } = useAuth();
  const gate = useRegisterGate();
  const { t } = useT();
  const share = useShareDeepLink();
  const { data: event = null, status } = useWatch<EventDoc | null>(
    'eventDetail:watchEvent',
    eventId || null,
    (next, error) => watchEvent(eventId, next, error),
  );
  // The escudo lives on the municipality doc, not the event.
  const villageId = event?.municipalityId ?? null;
  const { data: village = null } = useWatch<VillageDoc | null>(
    'eventDetail:watchMunicipality',
    villageId,
    villageId ? (next, error) => watchMunicipality(villageId, next, error) : null,
  );
  const [person, setPerson] = useState<PersonDoc | null>(null);
  const { canManage, canEdit, isMember } = useEntityCapabilities(event?.municipalityId);
  // Organizing an event IS editing it: author, named organizer, or an admin of
  // the event's pueblo — the same three identities every entity kind accepts.
  const canOrganize = canEdit(event?.createdBy, event?.organizerUserIds);

  const loadPerson = useCallback(async () => {
    if (user) setPerson(await getPersonByUserId(user.uid, user.uid));
  }, [user]);

  useEffect(() => {
    void loadPerson();
  }, [loadPerson]);

  useEffect(() => {
    if (!event) return;
    void recordEntityView({ entityKind: 'event', entityId: event.id, municipalityId: event.municipalityId });
    observability.trackEvent(OBSERVABILITY_EVENTS.CONTENT_DETAIL_VIEWED, {
      entityKind: 'event',
      entityId: event.id,
      municipalityId: event.municipalityId,
    });
  }, [event?.id]);

  const personName = person ? buildNameWithNickname(person) : '';

  const openInMaps = () => {
    const c = event?.location?.coordinates;
    if (!c) return;
    void Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`,
    ).catch(() => {});
  };

  const addToCalendar = () => {
    if (!event) return;
    void Linking.openURL(
      buildGoogleCalendarUrl({
        title: event.title,
        start: event.startDate,
        end: event.endDate,
        details: event.description,
        location: event.location?.displayName,
      }),
    ).catch(() => {});
  };

  const birthYearLabel = event
    ? birthYearRangeLabel(
        { minBirthYear: event.minBirthYear, maxBirthYear: event.maxBirthYear },
        t,
      )
    : null;

  const actions: EntityDetailAction[] = event
    ? [
        ...(canOrganize
          ? [
              {
                icon: 'create-outline' as const,
                accessibilityLabel: t('event.editEvent'),
                onPress: () => router.push(createEventHref({ eventId: event.id })),
              },
            ]
          : []),
        {
          icon: 'share-outline',
          accessibilityLabel: t('deeplink.shareViewLabel'),
          onPress: () => void share(getEventLink(event), event.title),
        },
      ]
    : [];

  return (
    <EntityDetailScaffold
      loading={status === 'loading'}
      notFound={status !== 'loading' && !event}
      imageUri={event?.imageURL ?? null}
      fallbackImageUri={event?.villageCoverImage ?? null}
      fallbackIcon={ENTITY_FALLBACK_ICON.event}
      actions={actions}
      title={event?.title}
      onRefresh={loadPerson}
      scrollContentClassName="pb-24"
      fab={
        event && person && user && event.signupEnabled !== false ? (
          <RegisterFab
            eventId={event.id}
            userId={user.uid}
            personId={person.id}
            name={personName}
            eventTitle={event.title}
            telephoneRequired={!!event.telephoneRequired}
            signupFields={event.signupFields}
            villageId={event.municipalityId}
            villageSlug={event.villageSlug}
            visibilityOrgId={event.visibilityOrgId}
            groupSize={event.signupGroupSize}
            ownBirthYear={person.birthday?.year ?? null}
            birthYearWindow={{
              minBirthYear: event.minBirthYear,
              maxBirthYear: event.maxBirthYear,
            }}
          />
        ) : null
      }
    >
      {event ? (
        <>
          {/* Private events look identical to public ones once you are inside,
              so the notice is what tells an organizer that the thing they are
              about to share is not shareable. */}
          {isPrivateEvent(event) ? (
            <HStack gap={2} align="center">
              <Ionicons name="lock-closed-outline" size={iconSizes.sm} color={colors.light.fg.muted} />
              <Text variant="bodySm" tone="muted" className="flex-1">
                {t('event.privateNotice')}
              </Text>
            </HStack>
          ) : null}
          <HStack gap={3} align="stretch">
            <DetailInfoCard
              icon="calendar-outline"
              label={t('event.date')}
              value={`${formatDate(event.startDate, 'dayMonth')} · ${formatDate(event.startDate, 'time')}`}
              onPress={addToCalendar}
            />
            {event.location ? (
              <DetailInfoCard
                icon="location-outline"
                label={t('event.location')}
                value={event.location.displayName}
                onPress={openInMaps}
              />
            ) : null}
          </HStack>
          {/* Advertised birth-year window. Shown before the sign-up sheet so the
              restriction reaches people who read the event and never tap the
              FAB — the confirm modal only reaches those who do. */}
          {birthYearLabel ? (
            <VStack gap={2}>
              <DetailSectionHeading>{t('event.birthYearRange')}</DetailSectionHeading>
              <Text>{birthYearLabel}</Text>
            </VStack>
          ) : null}
          {(event.organizerUserIds?.length > 0 || event.organizerOrgIds?.length > 0) && (
            <VStack gap={2}>
              <DetailSectionHeading>{t('event.organizersLabel')}</DetailSectionHeading>
              <View className="flex-row flex-wrap items-center" style={{ gap: 12 }}>
                {event.organizerOrgIds?.map((id) => (
                  <LiveOwnerChip
                    key={id}
                    ownerType="organization"
                    ownerId={id}
                    onPress={() => void openOwner('organization', id)}
                  />
                ))}
                {event.organizerUserIds?.map((id) => (
                  <LiveOwnerChip
                    key={id}
                    ownerType="user"
                    ownerId={id}
                    onPress={() => void openOwner('user', id)}
                  />
                ))}
              </View>
            </VStack>
          )}
          {event.villageName ? (
            <VStack gap={2}>
              <DetailSectionHeading>{t('event.villageLabel')}</DetailSectionHeading>
              <Pressable
                onPress={() =>
                  router.push(villageHref(event.villageSlug))
                }
                accessibilityRole="button"
                accessibilityLabel={event.villageName}
              >
                <HStack gap={2} align="center">
                  <Avatar
                    uri={village ? escudoThumbDisplayUrl(village) : null}
                    size={36}
                    initials={event.villageName.slice(0, 1).toUpperCase()}
                  />
                  <Text numberOfLines={1} className="shrink">
                    {event.villageName}
                  </Text>
                </HStack>
              </Pressable>
            </VStack>
          ) : null}
          {event.description ? (
            <VStack gap={2}>
              <DetailSectionHeading>{t('event.descriptionLabel')}</DetailSectionHeading>
              <Text>{event.description}</Text>
            </VStack>
          ) : null}
          {/* An organizer always sees the roster; a fellow villager sees it
              read-only unless the organizer restricted the event. The same
              condition is enforced in firestore.rules — this only avoids
              rendering a list the reader would be denied. */}
          {canOrganize || (isMember && event.attendeesVisibility === 'members') ? (
            <EventAttendees
              eventId={event.id}
              eventTitle={event.title}
              eventDate={event.startDate}
              telephoneRequired={!!event.telephoneRequired}
              requiresPayment={!!event.requiresPayment}
              signupFields={event.signupFields}
              groupSize={event.signupGroupSize}
              canManage={canOrganize}
            />
          ) : null}
          {/* Organizer-only, and deliberately not gated on attendeesVisibility:
              the roster's history names people who have already left, which is
              never pueblo business however open the roster is. Same audience as
              the `registrationEvents` read rule. */}
          {canOrganize ? <RegistrationHistory eventId={event.id} /> : null}
          {!user && (
            <Button variant="primary" fullWidth onPress={() => gate.requireAuth(eventHref(event), t('guest.event'))}>
              {t('guest.eventCta')}
            </Button>
          )}
          {event.signupEnabled === false ? (
            <VStack gap={2}>
              <DetailSectionHeading>{t('event.signupClosedLabel')}</DetailSectionHeading>
              <Text tone="muted">{event.signupInfo ?? t('event.signupClosedDefault')}</Text>
            </VStack>
          ) : null}
          {!person && user && event.signupEnabled !== false ? (
            <Text tone="muted">{t('event.register.needsPerson')}</Text>
          ) : null}
          <EntityComments
            key={event.id}
            entityKind="event"
            entityId={event.id}
            municipalityId={event.municipalityId}
            canModerate={canManage}
          />
        </>
      ) : null}
    </EntityDetailScaffold>
  );
}

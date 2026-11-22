import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { cosaAvailability, cosaHasPlace, cosaHolderUid, isActiveReserva, isOpenCosaRequest, isSharedCosa } from '@cultuvilla/shared/models/organization';
import {
  respondToCosaRequest,
  updateCosa,
  watchCosa,
  watchCosaRequestsToMe,
  watchGroupCosaRequests,
  watchMyCosaRequests,
  type Cosa,
  type CosaRequest,
} from '@cultuvilla/shared/services/cosatecaService';
import { Button, HStack, Screen, Text, VStack } from '../../../../components/primitives';
import { Fab } from '../../../../components/primitives/Fab';
import { ScreenHeader } from '../../../../components/layout/ScreenHeader';
import { DetailSectionHeading } from '../../../../components/feature/DetailSectionHeading';
import { EntityDetailScaffold } from '../../../../components/feature/EntityDetailScaffold';
import type { EntityDetailAction } from '../../../../components/feature/EntityDetailHeader';
import { LocationMap } from '../../../../components/feature/LocationMap';
import { AskCosaSheet } from '../../../../components/feature/groups/cosateca/AskCosaSheet';
import { CosaRequestRow } from '../../../../components/feature/groups/cosateca/CosaRows';
import { CosaSheet } from '../../../../components/feature/groups/cosateca/CosaSheet';
import { MyReservas, ReservaBlackouts, ReservaBooking } from '../../../../components/feature/groups/cosateca/Reserva';
import { useAuth } from '../../../../lib/auth/useAuth';
import { showAlert } from '../../../../lib/dialogs';
import { useWatch } from '../../../../lib/hooks/useWatch';
import { useT } from '../../../../lib/i18n';
import { groupCosaRequestHref } from '../../../../lib/navigation/routes';
import { cosaAvailabilityLabel, cosaHeldSinceLabel, cosaOwnerLabel, cosatecaErrorMessage } from '../../../../lib/orgs/cosateca';
import { myUpcomingReservas } from '../../../../lib/orgs/reserva';
import { useMyGroups } from '../../../../lib/orgs/useMyGroups';

/**
 * One cosa of a cosateca. Anyone who may read it — an integrante, or any
 * villager when the group opened its cosateca to the pueblo — sees it and may
 * ask for it; so this screen does not require membership, the rules decide. Its
 * manager (the owner, or an admin of the group) edits, pauses or removes it and
 * sees its requests. A shared cosa (the group's, which travels hand to hand)
 * someone holds is asked of its holder, who sees and answers its requests here
 * and may leave it back in its place when it has one. Where it is kept, who has
 * it since when and who gave it to the group show to every viewer.
 * A reserva is booked by slot on its week grid instead, and its manager closes
 * days there.
 */
export default function CosaScreen() {
  const { t } = useT();
  const { user, profile } = useAuth();
  const uid = user?.uid ?? null;
  const { cosa: cosaId } = useLocalSearchParams<{ grupo: string; cosa: string }>();
  const { groups } = useMyGroups(uid);

  const watch = useWatch<Cosa | null>('cosateca:watchCosa', cosaId ?? null, cosaId ? (next, error) => watchCosa(cosaId, next, error) : null);
  const cosa = watch.data ?? null;
  // The cosa's own group, never the URL's: a link can pair any group with any cosa.
  const group = cosa ? (groups.find((g) => g.org.id === cosa.orgId) ?? null) : null;
  const isAdmin = group?.role === 'admin';
  const isOwner = cosa !== null && uid !== null && cosa.ownerUid === uid;
  const isManager = isOwner || (cosa !== null && isAdmin);
  const holder = cosa ? cosaHolderUid(cosa) : null;
  const isHolder = holder !== null && holder === uid;
  // Who answers its requests first-hand: a shared cosa's holder while someone has it, else its owner.
  const answersFirstHand = holder !== null ? isHolder : isOwner;
  const seesRequests = isManager || isHolder;

  const mine = useWatch<CosaRequest[]>(
    'cosateca:watchMyCosaRequests',
    uid,
    uid ? (next, error) => watchMyCosaRequests(uid, next, error) : null,
  );
  const managed = useWatch<CosaRequest[]>(
    isAdmin ? 'cosateca:watchGroupCosaRequests' : 'cosateca:watchCosaRequestsToMe',
    seesRequests && uid && cosa ? `${isAdmin ? 'org' : 'owner'}|${isAdmin ? cosa.orgId : uid}` : null,
    seesRequests && uid && cosa
      ? (next, error) => (isAdmin ? watchGroupCosaRequests(cosa.orgId, next, error) : watchCosaRequestsToMe(uid, next, error))
      : null,
  );

  const myOpen = useMemo(
    () => (mine.data ?? []).find((r) => r.cosaId === cosaId && isOpenCosaRequest(r.status)) ?? null,
    [mine.data, cosaId],
  );
  // A reserva's past bookings are history, not something to answer.
  const requests = useMemo(
    () => (managed.data ?? []).filter((r) => r.cosaId === cosaId && (r.cosaKind !== 'reserva' || isActiveReserva(r, new Date()))),
    [managed.data, cosaId],
  );
  const myBookings = useMemo(() => (cosaId ? myUpcomingReservas(mine.data ?? [], cosaId, new Date()) : []), [mine.data, cosaId]);

  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Its holder leaves a shared cosa where it is kept: free again, for the group to lend.
  const leaveInPlace = () => {
    if (!cosa?.heldBy) return;
    setLeaving(true);
    respondToCosaRequest(cosa.heldBy.requestId, 'return')
      .catch((err: unknown) => showAlert(cosatecaErrorMessage(t, err)))
      .finally(() => setLeaving(false));
  };

  const setPaused = (paused: boolean) => {
    if (!cosa) return;
    const { kind, title, description, category, imageURL, conditions, location, locationNote, reserva } = cosa;
    setSaving(true);
    updateCosa(cosa.id, {
      kind, title, description, category, imageURL, conditions, location, locationNote, reserva,
      status: paused ? 'paused' : 'available',
    })
      .catch((err: unknown) => showAlert(cosatecaErrorMessage(t, err)))
      .finally(() => setSaving(false));
  };

  const state = cosa ? cosaAvailability(cosa) : null;
  const canAsk = cosa !== null && uid !== null && !answersFirstHand && cosa.status === 'available' && myOpen === null;

  if (watch.status === 'loading' || !uid || !cosa) {
    return (
      <Screen padded={false} topInset={false}>
        <ScreenHeader accent title={t('groups.cosateca.detail.title')} />
        {watch.status === 'loading' || !uid ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : (
          <Text tone="muted" className="p-6 text-center" testID="cosa-unavailable">
            {t('groups.cosateca.detail.unavailable')}
          </Text>
        )}
      </Screen>
    );
  }

  // The form needs the group; an owner who has left it can still pause it.
  const actions: EntityDetailAction[] = isManager
    ? [
        ...(group
          ? [{ icon: 'create-outline' as const, onPress: () => setEditing(true), accessibilityLabel: t('groups.cosateca.detail.edit'), testID: 'cosa-edit' }]
          : []),
        ...(cosa.status !== 'given'
          ? [
              {
                icon: cosa.status === 'available' ? ('pause-circle-outline' as const) : ('play-circle-outline' as const),
                onPress: () => {
                  if (!saving) setPaused(cosa.status === 'available');
                },
                accessibilityLabel: t(cosa.status === 'available' ? 'groups.cosateca.detail.pause' : 'groups.cosateca.detail.resume'),
                testID: 'cosa-pause',
              },
            ]
          : []),
      ]
    : [];

  // The one thing a visitor came to do, pinned where the thumb is: ask, or see the request already made.
  const fab =
    cosa.kind === 'reserva' ? null : myOpen && !answersFirstHand && !isHolder ? (
      <Fab label={t('groups.cosateca.detail.seeRequest')} onPress={() => router.push(groupCosaRequestHref(cosa.orgId, myOpen.id))} testID="cosa-see-request" />
    ) : canAsk && profile?.displayName ? (
      <Fab label={t('groups.cosateca.detail.ask')} onPress={() => setAsking(true)} testID="cosa-ask" />
    ) : null;

  return (
    <>
      <EntityDetailScaffold
        loading={false}
        imageUri={cosa.imageURL ?? null}
        fallbackIcon="cube-outline"
        actions={actions}
        title={cosa.title}
        scrollContentClassName="pb-28"
        fab={fab}
      >
        <VStack gap={4} testID="cosa-detail">
          <VStack gap={1}>
            <Text variant="bodySm" tone="muted">
              {[t(`groups.cosateca.kinds.${cosa.kind}`), t(`groups.cosateca.categories.${cosa.category}`)].join(' · ')}
            </Text>
            <HStack gap={2} align="center">
              <Ionicons
                name={state === 'available' ? 'checkmark-circle' : state === 'paused' ? 'pause-circle' : 'time-outline'}
                size={iconSizes.md}
                color={state === 'available' ? colors.light.fg.success : colors.light.fg.muted}
              />
              <Text className="font-semibold flex-1" tone={state === 'available' ? 'success' : 'primary'} testID="cosa-state">
                {cosaAvailabilityLabel(t, cosa)}
              </Text>
            </HStack>
            {cosa.heldBy ? (
              <Text variant="bodySm" tone="muted" testID="cosa-held-since">
                {cosaHeldSinceLabel(t, cosa.heldBy)}
              </Text>
            ) : null}
          </VStack>

          <VStack gap={3} className="bg-surface-elevated rounded-xl p-3">
            <InfoRow icon="person-outline">
              {cosa.ownerUid === null ? cosaOwnerLabel(t, cosa) : t('groups.cosateca.detail.offeredBy', { name: cosa.ownerName })}
            </InfoRow>
            {cosa.ownerUid === null && cosa.createdByName ? (
              <InfoRow icon="gift-outline" testID="cosa-given-by">
                {t('groups.cosateca.detail.givenBy', { name: cosa.createdByName })}
              </InfoRow>
            ) : null}
            {cosa.locationNote ? (
              <InfoRow icon="location-outline" testID="cosa-location-note">
                {cosa.locationNote}
              </InfoRow>
            ) : null}
            {cosa.conditions ? <InfoRow icon="document-text-outline">{cosa.conditions}</InfoRow> : null}
          </VStack>

          {cosa.description ? <Text selectable>{cosa.description}</Text> : null}

          {isSharedCosa(cosa) ? (
            <HStack gap={2} align="start" testID="cosa-shared-hint">
              <Ionicons name="information-circle-outline" size={iconSizes.sm} color={colors.light.fg.muted} />
              <Text variant="bodySm" tone="muted" className="flex-1">
                {t('groups.cosateca.detail.sharedHint')}
              </Text>
            </HStack>
          ) : null}

          {cosa.location ? (
            <VStack gap={2} testID="cosa-where">
              <DetailSectionHeading>{t('groups.cosateca.detail.where')}</DetailSectionHeading>
              <LocationMap coordinates={cosa.location.coordinates} label={cosa.location.displayName} testID="cosa-location-map" />
            </VStack>
          ) : null}

          {cosa.kind === 'reserva' ? (
            <VStack gap={4}>
              <MyReservas bookings={myBookings} onOpen={(id) => router.push(groupCosaRequestHref(cosa.orgId, id))} />
              <ReservaBooking
                cosa={cosa}
                canBook={!isOwner && cosa.status === 'available'}
                myBookings={myBookings}
                onBooked={(id) => router.push(groupCosaRequestHref(cosa.orgId, id))}
              />
            </VStack>
          ) : isHolder ? (
            <VStack gap={2}>
              <Text tone="muted" testID="cosa-you-hold-it">
                {t('groups.cosateca.detail.youHoldIt')}
              </Text>
              {cosaHasPlace(cosa) ? (
                <Button variant="secondary" loading={leaving} onPress={leaveInPlace} fullWidth testID="cosa-leave-in-place">
                  {t('groups.cosateca.detail.leaveInPlace')}
                </Button>
              ) : null}
            </VStack>
          ) : answersFirstHand ? (
            <Text tone="muted" testID="cosa-yours">
              {t('groups.cosateca.detail.yours')}
            </Text>
          ) : myOpen ? (
            <Text tone="muted">{t('groups.cosateca.detail.alreadyAsked')}</Text>
          ) : canAsk ? null : (
            <Text tone="muted" testID="cosa-not-available">
              {t('groups.cosateca.detail.notAvailable')}
            </Text>
          )}

          {seesRequests ? (
            <VStack gap={2} testID="cosa-manage">
              {cosa.kind === 'reserva' && isManager ? <ReservaBlackouts cosa={cosa} /> : null}
              {requests.length > 0 ? (
                <VStack gap={2}>
                  <DetailSectionHeading>{t('groups.cosateca.detail.requests')}</DetailSectionHeading>
                  {requests.map((r) => (
                    <CosaRequestRow key={r.id} request={r} showRequester onPress={() => router.push(groupCosaRequestHref(cosa.orgId, r.id))} />
                  ))}
                </VStack>
              ) : null}
            </VStack>
          ) : null}
        </VStack>
      </EntityDetailScaffold>
      <AskCosaSheet
        visible={asking}
        cosa={cosa}
        uid={uid}
        myName={profile?.displayName ?? ''}
        onClose={() => setAsking(false)}
        onSent={(id) => router.push(groupCosaRequestHref(cosa.orgId, id))}
      />
      {group ? (
        <CosaSheet
          visible={editing}
          org={group.org}
          uid={uid}
          myName={profile?.displayName ?? ''}
          isAdmin={isAdmin}
          cosa={cosa}
          canDelete={isManager}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}

/** One fact about the cosa — who offers it, where it is kept, its conditions — behind its icon. */
function InfoRow({ icon, children, testID }: { icon: keyof typeof Ionicons.glyphMap; children: ReactNode; testID?: string }) {
  return (
    <HStack gap={3} align="start">
      <Ionicons name={icon} size={iconSizes.md} color={colors.light.fg.accent} />
      <Text selectable className="flex-1" testID={testID}>
        {children}
      </Text>
    </HStack>
  );
}

import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { cosaAvailability, cosaHolderUid, isActiveReserva, isOpenCosaRequest } from '@cultuvilla/shared/models/organization';
import {
  updateCosa,
  watchCosa,
  watchCosaRequestsToMe,
  watchGroupCosaRequests,
  watchMyCosaRequests,
  type Cosa,
  type CosaRequest,
} from '@cultuvilla/shared/services/cosatecaService';
import { Button, HStack, Screen, Text, VStack } from '../../../../components/primitives';
import { RemoteImage } from '../../../../components/primitives/RemoteImage';
import { ScreenHeader } from '../../../../components/layout/ScreenHeader';
import { DetailSectionHeading } from '../../../../components/feature/DetailSectionHeading';
import { LocationMap } from '../../../../components/feature/LocationMap';
import { AskCosaSheet } from '../../../../components/feature/groups/cosateca/AskCosaSheet';
import { Badge, CosaRequestRow } from '../../../../components/feature/groups/cosateca/CosaRows';
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
 * sees its requests. A colectivizado cosa someone holds is asked of its holder,
 * who sees and answers its requests here (its owner may ask for it then, like
 * anyone). Where it is kept, and who has it since when, show to every viewer.
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
  // Who answers its requests first-hand: a colectivizado cosa's holder while someone has it, else its owner.
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

  const setPaused = (paused: boolean) => {
    if (!cosa) return;
    const { kind, mode, title, description, category, imageURL, conditions, location, locationNote, reserva } = cosa;
    setSaving(true);
    updateCosa(cosa.id, {
      kind, mode, title, description, category, imageURL, conditions, location, locationNote, reserva,
      status: paused ? 'paused' : 'available',
    })
      .catch((err: unknown) => showAlert(cosatecaErrorMessage(t, err)))
      .finally(() => setSaving(false));
  };

  const state = cosa ? cosaAvailability(cosa) : null;
  const canAsk = cosa !== null && uid !== null && !answersFirstHand && cosa.status === 'available' && myOpen === null;

  return (
    <Screen padded={false} topInset={false}>
      <ScreenHeader accent title={t('groups.cosateca.detail.title')} />
      {watch.status === 'loading' || !uid ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : !cosa ? (
        <Text tone="muted" className="p-6 text-center" testID="cosa-unavailable">
          {t('groups.cosateca.detail.unavailable')}
        </Text>
      ) : (
        <ScrollView contentContainerClassName="px-4 pt-4 pb-10" testID="cosa-detail">
          <VStack gap={4}>
            {cosa.imageURL ? (
              <View className="overflow-hidden rounded-xl bg-accent-subtle/30" style={{ width: '100%', aspectRatio: 4 / 3 }}>
                <RemoteImage uri={cosa.imageURL} variant="card" style={{ width: '100%', height: '100%' }} contentFit="cover" />
              </View>
            ) : null}
            <VStack gap={1}>
              <Text variant="h2" className="font-bold">
                {cosa.title}
              </Text>
              <HStack gap={2} className="items-center flex-wrap">
                <Badge label={t(`groups.cosateca.kinds.${cosa.kind}`)} />
                {cosa.mode === 'colectivizado' ? <Badge label={t('groups.cosateca.modes.colectivizado')} testID="cosa-colectivizado" /> : null}
                <Badge label={t(`groups.cosateca.categories.${cosa.category}`)} />
              </HStack>
              <Text variant="bodySm" tone="muted">
                {cosa.ownerUid === null ? cosaOwnerLabel(t, cosa) : t('groups.cosateca.detail.offeredBy', { name: cosa.ownerName })}
              </Text>
              <Text variant="bodySm" tone={state === 'available' ? 'success' : 'muted'} testID="cosa-state">
                {cosaAvailabilityLabel(t, cosa)}
              </Text>
              {cosa.heldBy ? (
                <Text variant="bodySm" tone="muted" testID="cosa-held-since">
                  {cosaHeldSinceLabel(t, cosa.heldBy)}
                </Text>
              ) : null}
              {cosa.mode === 'colectivizado' ? (
                <Text variant="bodySm" tone="muted">
                  {t('groups.cosateca.modeHints.colectivizado')}
                </Text>
              ) : null}
            </VStack>

            {cosa.description ? <Text selectable>{cosa.description}</Text> : null}
            {cosa.location || cosa.locationNote ? (
              <VStack gap={2} testID="cosa-where">
                <DetailSectionHeading>{t('groups.cosateca.detail.where')}</DetailSectionHeading>
                {cosa.locationNote ? <Text selectable testID="cosa-location-note">{cosa.locationNote}</Text> : null}
                <LocationMap coordinates={cosa.location?.coordinates ?? null} label={cosa.location?.displayName} testID="cosa-location-map" />
              </VStack>
            ) : null}
            {cosa.conditions ? (
              <VStack gap={1}>
                <DetailSectionHeading>{t('groups.cosateca.detail.conditions')}</DetailSectionHeading>
                <Text selectable>{cosa.conditions}</Text>
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
              <Text tone="muted" testID="cosa-you-hold-it">
                {t('groups.cosateca.detail.youHoldIt')}
              </Text>
            ) : answersFirstHand ? (
              <Text tone="muted" testID="cosa-yours">
                {t('groups.cosateca.detail.yours')}
              </Text>
            ) : myOpen ? (
              <VStack gap={2}>
                <Text tone="muted">{t('groups.cosateca.detail.alreadyAsked')}</Text>
                <Button variant="secondary" onPress={() => router.push(groupCosaRequestHref(cosa.orgId, myOpen.id))} testID="cosa-see-request">
                  {t('groups.cosateca.detail.seeRequest')}
                </Button>
              </VStack>
            ) : canAsk ? (
              <Button onPress={() => setAsking(true)} disabled={!profile?.displayName} fullWidth testID="cosa-ask">
                {t('groups.cosateca.detail.ask')}
              </Button>
            ) : (
              <Text tone="muted" testID="cosa-not-available">
                {t('groups.cosateca.detail.notAvailable')}
              </Text>
            )}

            {seesRequests ? (
              <VStack gap={2} testID="cosa-manage">
                {isManager ? (
                <HStack gap={2} className="flex-wrap">
                  {/* The form needs the group; an owner who has left it can still pause it. */}
                  {group ? (
                    <Button variant="secondary" onPress={() => setEditing(true)} testID="cosa-edit">
                      {t('groups.cosateca.detail.edit')}
                    </Button>
                  ) : null}
                  {cosa.status !== 'given' ? (
                    <Button variant="ghost" loading={saving} onPress={() => setPaused(cosa.status === 'available')} testID="cosa-pause">
                      {t(cosa.status === 'available' ? 'groups.cosateca.detail.pause' : 'groups.cosateca.detail.resume')}
                    </Button>
                  ) : null}
                </HStack>
                ) : null}
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
        </ScrollView>
      )}
      {cosa && uid ? (
        <>
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
      ) : null}
    </Screen>
  );
}

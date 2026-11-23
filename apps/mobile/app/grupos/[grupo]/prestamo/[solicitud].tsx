import { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { availableCosaRequestActions, cosaRequestRoles, isCosaChatOpen, isSharedCosa, type CosaRequestAction } from '@cultuvilla/shared/models/organization';
import { respondToCosaRequest, watchCosaRequest, type CosaRequest } from '@cultuvilla/shared/services/cosatecaService';
import { formatDate } from '@cultuvilla/shared/utils';
import { Button, HStack, Pressable, Screen, Text, VStack } from '../../../../components/primitives';
import { ScreenHeader } from '../../../../components/layout/ScreenHeader';
import { DetailSectionHeading } from '../../../../components/feature/DetailSectionHeading';
import { CosaRequestChat } from '../../../../components/feature/groups/cosateca/CosaRequestChat';
import { useAuth } from '../../../../lib/auth/useAuth';
import { showAlert } from '../../../../lib/dialogs';
import { useWatch } from '../../../../lib/hooks/useWatch';
import { useT } from '../../../../lib/i18n';
import { groupCosaHref } from '../../../../lib/navigation/routes';
import { cosaRequestDatesLabel, cosaRequestSteps, cosatecaErrorMessage } from '../../../../lib/orgs/cosateca';
import { useMyGroups } from '../../../../lib/orgs/useMyGroups';

/** The moves that end a request on the other side's terms: offered as the quiet button. */
const QUIET: readonly CosaRequestAction[] = ['decline', 'cancel'];

/**
 * One request for a cosa, for its requester (who need not be an integrante when
 * the cosateca is the pueblo's) and its manager — a conversation, like a
 * marketplace chat. On top, the cosa (tap to open it), the state, who asked and
 * when, and the road the request walks; the chat fills the rest, with exactly
 * the moves `respondToCosaRequest` accepts from this viewer pinned above the
 * composer.
 */
export default function CosaRequestScreen() {
  const { t } = useT();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { solicitud } = useLocalSearchParams<{ grupo: string; solicitud: string }>();
  const { groups } = useMyGroups(uid);
  const watch = useWatch<CosaRequest | null>(
    'cosateca:watchCosaRequest',
    solicitud ?? null,
    solicitud ? (next, error) => watchCosaRequest(solicitud, next, error) : null,
  );
  const req = watch.data ?? null;
  // The request's own group, never the URL's: a link can pair any group with any request.
  const isAdmin = req !== null && groups.find((g) => g.org.id === req.orgId)?.role === 'admin';
  const [busy, setBusy] = useState<CosaRequestAction | null>(null);

  const roles = req && uid ? cosaRequestRoles(req, { uid, isGroupAdmin: isAdmin }) : [];
  // Lending a shared cosa is handing it on: the requester keeps it until the next one asks.
  const handOver = req !== null && isSharedCosa({ kind: req.cosaKind, ownerUid: req.ownerUid });
  // Its holder leaves a shared cosa back in its place from the cosa's own screen, which knows whether it has one.
  const actions = req
    ? availableCosaRequestActions(req.cosaKind, req.status, roles, req.ownerUid).filter((a) => !(handOver && a === 'return'))
    : [];
  const asManager = roles.includes('manager');
  const actionLabel = (action: CosaRequestAction) =>
    t(`groups.cosateca.actions.${handOver && action === 'lend' ? 'handOver' : action}`);

  const act = (action: CosaRequestAction) => {
    if (!req) return;
    setBusy(action);
    respondToCosaRequest(req.id, action)
      .catch((err: unknown) => showAlert(cosatecaErrorMessage(t, err)))
      .finally(() => setBusy(null));
  };

  const steps = req ? cosaRequestSteps(req) : null;

  const head = req ? (
    <VStack gap={3}>
      <Pressable
        testID="cosa-request-open-cosa"
        accessibilityRole="button"
        accessibilityLabel={t('groups.cosateca.request.openCosa', { title: req.cosaTitle })}
        onPress={() => router.push(groupCosaHref(req.orgId, req.cosaId))}
        className="bg-surface-elevated border border-subtle rounded-xl p-3 active:opacity-70"
      >
        <HStack gap={3} align="center">
          <View className="rounded-md bg-accent-subtle/30 items-center justify-center" style={{ width: 44, height: 44 }}>
            <Ionicons name="cube-outline" size={iconSizes.md} color={colors.light.fg.accent} />
          </View>
          <VStack gap={0} className="flex-1">
            <Text className="font-bold" numberOfLines={1}>
              {req.cosaTitle}
            </Text>
            <Text variant="bodySm" tone="muted" numberOfLines={1} testID="cosa-request-dates">
              {cosaRequestDatesLabel(t, req)}
            </Text>
          </VStack>
          <Ionicons name="chevron-forward" size={iconSizes.sm} color={colors.light.fg.chevron} />
        </HStack>
      </Pressable>
      <HStack gap={2} align="center" className="flex-wrap">
        <Text variant="bodySm" tone={req.status === 'declined' || req.status === 'cancelled' ? 'danger' : 'primary'} className="font-bold" testID="cosa-request-status">
          {t(`groups.cosateca.status.${req.status}`)}
        </Text>
        <Text variant="bodySm" tone="muted" className="flex-1">
          {[t('groups.cosateca.request.askedBy', { name: req.requesterName }), t('groups.cosateca.request.askedOn', { date: formatDate(req.createdAt, 'short') })].join(' · ')}
        </Text>
      </HStack>
      {steps ? (
        <HStack gap={1} align="center" testID="cosa-request-steps">
          {steps.steps.map((step, i) => {
            const reached = i <= steps.current;
            return (
              <HStack key={step} gap={1} align="center" className="flex-1">
                <View className={`h-1.5 flex-1 rounded-full ${reached ? 'bg-accent' : 'bg-skeleton'}`} />
                <Text variant="caption" tone={i === steps.current ? 'primary' : 'muted'} className={i === steps.current ? 'font-bold' : ''} numberOfLines={1}>
                  {t(`groups.cosateca.status.${step}`)}
                </Text>
              </HStack>
            );
          })}
        </HStack>
      ) : null}
      {req.message ? (
        <VStack gap={1}>
          <DetailSectionHeading>{t('groups.cosateca.request.message')}</DetailSectionHeading>
          <Text selectable>{req.message}</Text>
        </VStack>
      ) : null}
    </VStack>
  ) : null;

  // The next step's moves, beside each other: the one that moves it on filled, the one that ends it outlined in red.
  const footer =
    actions.length > 0 ? (
      <VStack gap={2} testID="cosa-request-actions">
        {asManager && (actions.includes('lend') || actions.includes('return')) ? (
          <Text variant="bodySm" tone="muted" testID="cosa-request-action-hint">
            {t(`groups.cosateca.actionHints.${actions.includes('lend') ? (handOver ? 'handOver' : 'lend') : 'return'}`)}
          </Text>
        ) : null}
        <HStack gap={2}>
          {[...actions]
            .sort((x, y) => Number(!QUIET.includes(x)) - Number(!QUIET.includes(y)))
            .map((action) => (
              <View key={action} className="flex-1">
                <Button
                  variant={QUIET.includes(action) ? 'dangerOutline' : 'primary'}
                  loading={busy === action}
                  disabled={busy !== null && busy !== action}
                  onPress={() => act(action)}
                  fullWidth
                  testID={`cosa-request-${action}`}
                >
                  {actionLabel(action)}
                </Button>
              </View>
            ))}
        </HStack>
      </VStack>
    ) : null;

  return (
    <Screen padded={false} topInset={false} bottomInset>
      <ScreenHeader accent title={t('groups.cosateca.request.title')} />
      {watch.status === 'loading' || !uid ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : !req || watch.status === 'error' ? (
        <Text tone="muted" className="p-6 text-center" testID="cosa-request-unavailable">
          {t('groups.cosateca.request.unavailable')}
        </Text>
      ) : roles.length > 0 ? (
        <View className="flex-1" testID="cosa-request">
          <CosaRequestChat
            requestId={req.id}
            municipalityId={req.municipalityId}
            uid={uid}
            canModerate={isAdmin}
            open={isCosaChatOpen(req, new Date())}
            head={head}
            footer={footer}
          />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerClassName="px-4 pt-4 pb-10 gap-4" testID="cosa-request">
          {head}
          {footer}
        </ScrollView>
      )}
    </Screen>
  );
}

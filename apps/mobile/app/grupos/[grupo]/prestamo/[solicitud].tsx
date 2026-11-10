import { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { availableCosaRequestActions, cosaRequestRoles, isCosaChatOpen, type CosaRequestAction } from '@cultuvilla/shared/models/organization';
import { respondToCosaRequest, watchCosaRequest, type CosaRequest } from '@cultuvilla/shared/services/cosatecaService';
import { formatDate } from '@cultuvilla/shared/utils';
import { Button, HStack, Pressable, Screen, Text, VStack } from '../../../../components/primitives';
import { ScreenHeader } from '../../../../components/layout/ScreenHeader';
import { DetailSectionHeading } from '../../../../components/feature/DetailSectionHeading';
import { Badge } from '../../../../components/feature/groups/cosateca/CosaRows';
import { CosaRequestChat } from '../../../../components/feature/groups/cosateca/CosaRequestChat';
import { useAuth } from '../../../../lib/auth/useAuth';
import { showAlert } from '../../../../lib/dialogs';
import { useWatch } from '../../../../lib/hooks/useWatch';
import { useT } from '../../../../lib/i18n';
import { DetailScrollProvider } from '../../../../lib/keyboard/DetailScrollContext';
import { useComposerKeyboardGap } from '../../../../lib/keyboard/useKeyboardOpen';
import { groupCosaHref } from '../../../../lib/navigation/routes';
import { cosaRequestDatesLabel, cosatecaErrorMessage } from '../../../../lib/orgs/cosateca';
import { useMyGroups } from '../../../../lib/orgs/useMyGroups';

/** The moves that end a request on the other side's terms: offered as the quiet button. */
const QUIET: readonly CosaRequestAction[] = ['decline', 'cancel'];

/**
 * One request for a cosa, for its requester (who need not be an integrante when
 * the cosateca is the pueblo's) and its manager. It shows what was asked, when
 * and the state, offers exactly the moves `respondToCosaRequest` accepts from
 * this viewer, and under them the chat where the two arrange the handover.
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
  const scrollRef = useRef<ScrollView>(null);
  const keyboardGap = useComposerKeyboardGap();

  const roles = req && uid ? cosaRequestRoles(req, { uid, isGroupAdmin: isAdmin }) : [];
  const actions = req ? availableCosaRequestActions(req.cosaKind, req.status, roles) : [];
  const asManager = roles.includes('manager');

  const act = (action: CosaRequestAction) => {
    if (!req) return;
    setBusy(action);
    respondToCosaRequest(req.id, action)
      .catch((err: unknown) => showAlert(cosatecaErrorMessage(t, err)))
      .finally(() => setBusy(null));
  };

  return (
    <Screen padded={false} topInset={false}>
      <ScreenHeader accent title={t('groups.cosateca.request.title')} />
      {watch.status === 'loading' || !uid ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : !req || watch.status === 'error' ? (
        <Text tone="muted" className="p-6 text-center" testID="cosa-request-unavailable">
          {t('groups.cosateca.request.unavailable')}
        </Text>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, marginBottom: keyboardGap }}
          contentContainerClassName="px-4 pt-4 pb-10"
          keyboardShouldPersistTaps="handled"
          testID="cosa-request"
        >
          <VStack gap={4}>
            <VStack gap={1}>
              <HStack gap={2} className="items-center justify-between">
                <Text variant="h2" className="font-bold flex-1">
                  {req.cosaTitle}
                </Text>
                <Badge label={t(`groups.cosateca.status.${req.status}`)} strong={req.status === 'pending'} testID="cosa-request-status" />
              </HStack>
              <Text variant="bodySm" tone="muted">
                {t('groups.cosateca.request.askedBy', { name: req.requesterName })}
              </Text>
              <Text variant="bodySm" tone="muted">
                {t('groups.cosateca.request.askedOn', { date: formatDate(req.createdAt, 'short') })}
              </Text>
              <Text variant="bodySm" testID="cosa-request-dates">
                {cosaRequestDatesLabel(t, req)}
              </Text>
            </VStack>

            {req.message ? (
              <VStack gap={1}>
                <DetailSectionHeading>{t('groups.cosateca.request.message')}</DetailSectionHeading>
                <Text selectable>{req.message}</Text>
              </VStack>
            ) : null}

            <Pressable
              testID="cosa-request-open-cosa"
              accessibilityRole="link"
              onPress={() => router.push(groupCosaHref(req.orgId, req.cosaId))}
            >
              <Text variant="bodySm" className="text-accent font-medium">
                {t('groups.cosateca.request.openCosa', { title: req.cosaTitle })}
              </Text>
            </Pressable>

            {actions.length > 0 ? (
              <VStack gap={2} testID="cosa-request-actions">
                {asManager && (actions.includes('lend') || actions.includes('return')) ? (
                  <Text variant="bodySm" tone="muted">
                    {t(`groups.cosateca.actionHints.${actions.includes('lend') ? 'lend' : 'return'}`)}
                  </Text>
                ) : null}
                {actions.map((action) => (
                  <Button
                    key={action}
                    variant={QUIET.includes(action) ? 'ghost' : 'primary'}
                    loading={busy === action}
                    disabled={busy !== null && busy !== action}
                    onPress={() => act(action)}
                    fullWidth
                    testID={`cosa-request-${action}`}
                  >
                    {t(`groups.cosateca.actions.${action}`)}
                  </Button>
                ))}
              </VStack>
            ) : null}

            {roles.length > 0 && uid ? (
              <DetailScrollProvider scrollRef={scrollRef}>
                <CosaRequestChat requestId={req.id} municipalityId={req.municipalityId} uid={uid} canModerate={isAdmin} open={isCosaChatOpen(req, new Date())} />
              </DetailScrollProvider>
            ) : null}
          </VStack>
        </ScrollView>
      )}
    </Screen>
  );
}

import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@cultuvilla/shared/design-system';
import { firebaseErrorCode } from '@cultuvilla/shared/firebase/sdk/errors';
import { approveStudioPairing, inspectStudioPairing } from '@cultuvilla/shared/services/studioService';
import { studioPairingPath } from '@cultuvilla/shared/utils/urls';
import { Button, Card, Screen, Text, VStack } from '../../../components/primitives';
import { ScreenHeader } from '../../../components/layout/ScreenHeader';
import { useAuth } from '../../../lib/auth/useAuth';
import { useRegisterGate } from '../../../lib/auth/RegisterGateContext';
import { useT } from '../../../lib/i18n';

type Status =
  | { kind: 'loading' }
  | { kind: 'confirm'; code: string }
  | { kind: 'approving'; code: string }
  | { kind: 'done' }
  | { kind: 'cancelled' }
  | { kind: 'error'; messageKey: string };

function errorKey(error: unknown): string {
  switch (firebaseErrorCode(error)) {
    case 'not-found':
      return 'studio.pairing.error.expired';
    case 'failed-precondition':
      return 'studio.pairing.error.used';
    default:
      return 'studio.pairing.error.generic';
  }
}

/**
 * Where the web studio's QR code lands: the user confirms that the computer
 * showing the code may open their account. The code shown here is the one the
 * studio shows, so a QR code relayed from someone else's screen does not match
 * the screen in front of the user.
 */
export default function StudioPairingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const gate = useRegisterGate();
  const { t } = useT();
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    inspectStudioPairing(id)
      .then(({ code }) => {
        if (!cancelled) setStatus({ kind: 'confirm', code });
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus({ kind: 'error', messageKey: errorKey(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [user, id]);

  async function approve(code: string) {
    if (!id) return;
    setStatus({ kind: 'approving', code });
    try {
      await approveStudioPairing(id);
      setStatus({ kind: 'done' });
    } catch (error) {
      setStatus({ kind: 'error', messageKey: errorKey(error) });
    }
  }

  const title = t('studio.pairing.title');

  if (!user) {
    return (
      <Screen padded={false}>
        <ScreenHeader title={title} />
        <VStack gap={4} className="p-4">
          <Text>{t('studio.pairing.signInReason')}</Text>
          <Button
            fullWidth
            onPress={() => {
              if (id) gate.requireAuth(studioPairingPath(id), t('studio.pairing.signInReason'));
            }}
            testID="studio-pairing-sign-in"
          >
            {t('studio.pairing.signIn')}
          </Button>
        </VStack>
      </Screen>
    );
  }

  if (status.kind === 'loading') {
    return (
      <Screen padded={false}>
        <ScreenHeader title={title} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (status.kind === 'done' || status.kind === 'cancelled' || status.kind === 'error') {
    const done = status.kind === 'done';
    const message =
      status.kind === 'error' ? t(status.messageKey) : t(done ? 'studio.pairing.done' : 'studio.pairing.cancelled');
    return (
      <Screen padded={false}>
        <ScreenHeader title={title} />
        <View className="flex-1 items-center justify-center px-8">
          <VStack gap={4} className="items-center">
            <Ionicons
              name={done ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              size={48}
              color={done ? colors.light.fg.success : colors.light.fg.muted}
            />
            <Text className="text-center" testID="studio-pairing-result">
              {message}
            </Text>
            <Button onPress={() => router.replace('/(tabs)')}>{t('common.done')}</Button>
          </VStack>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false} scroll>
      <ScreenHeader title={title} />
      <VStack gap={4} className="p-4">
        <Text>{t('studio.pairing.intro')}</Text>
        <Card variant="flat">
          <VStack gap={3} className="items-center">
            <Text tone="muted" className="text-center">
              {t('studio.pairing.compare')}
            </Text>
            <Text variant="h1" className="tracking-widest" testID="studio-pairing-code">
              {status.code}
            </Text>
          </VStack>
        </Card>
        <Text tone="muted">{t('studio.pairing.warning')}</Text>
        <Button
          fullWidth
          loading={status.kind === 'approving'}
          disabled={status.kind === 'approving'}
          onPress={() => void approve(status.code)}
          testID="studio-pairing-approve"
        >
          {t('studio.pairing.approve')}
        </Button>
        <Button
          fullWidth
          variant="secondary"
          disabled={status.kind === 'approving'}
          onPress={() => setStatus({ kind: 'cancelled' })}
          testID="studio-pairing-cancel"
        >
          {t('studio.pairing.cancel')}
        </Button>
      </VStack>
    </Screen>
  );
}

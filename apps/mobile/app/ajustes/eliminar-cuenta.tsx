import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { checkAccountDeletable, deleteAccount, type Blocker } from '@cultuvilla/shared/services/accountService';
import { Screen } from '../../components/primitives/Screen';
import { Card } from '../../components/primitives/Card';
import { Input } from '../../components/primitives/Input';
import { Button } from '../../components/primitives/Button';
import { Text } from '../../components/primitives/Text';
import { VStack } from '../../components/primitives/VStack';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { useAuth } from '../../lib/auth/useAuth';
import { useT } from '../../lib/i18n';

const CONFIRM_WORD = 'ELIMINAR';

type Status = 'loading' | 'blocked' | 'ready' | 'submitting' | 'error';

export default function DeleteAccountScreen() {
  const { signOut } = useAuth();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<Status>('loading');
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkAccountDeletable()
      .then((result) => {
        if (cancelled) return;
        setBlockers(result.blockers);
        setStatus(result.blockers.length > 0 ? 'blocked' : 'ready');
      })
      .catch(() => {
        if (cancelled) return;
        setError(t('settings.deleteAccount.error.generic'));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function onConfirm() {
    setError(null);
    setStatus('submitting');
    try {
      await deleteAccount();
      await signOut();
    } catch {
      setError(t('settings.deleteAccount.error.generic'));
      setStatus('ready');
    }
  }

  if (status === 'loading') {
    return (
      <Screen padded={false} scroll>
        <ScreenHeader title={t('settings.deleteAccount.title')} />
        <View className="flex-1 items-center justify-center p-4">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (status === 'blocked') {
    return (
      <Screen padded={false} scroll>
        <ScreenHeader title={t('settings.deleteAccount.title')} />
        <VStack gap={4} className="p-4">
          <Card variant="flat">
            <VStack gap={2}>
              <Text>{t('settings.deleteAccount.blockerIntro')}</Text>
              {blockers.map((blocker) => (
                <Text key={`${blocker.scopeType}-${blocker.scopeId}`}>
                  {t(
                    blocker.scopeType === 'village'
                      ? 'settings.deleteAccount.blockerVillage'
                      : 'settings.deleteAccount.blockerOrg',
                    { name: blocker.name },
                  )}
                </Text>
              ))}
            </VStack>
          </Card>
          <Button onPress={() => undefined} disabled fullWidth variant="danger">
            {t('settings.deleteAccount.submit')}
          </Button>
        </VStack>
      </Screen>
    );
  }

  const canSubmit = confirmText.trim() === CONFIRM_WORD;

  return (
    <Screen padded={false} scroll bottomInset={false}>
      <ScreenHeader title={t('settings.deleteAccount.title')} />
      <View style={{ paddingBottom: insets.bottom + 16 }}>
        <VStack gap={4} className="p-4">
          <Card variant="flat">
            <VStack gap={3}>
              <Text>{t('settings.deleteAccount.warning')}</Text>
              <Input
                testID="delete-account-confirm-input"
                label={t('settings.deleteAccount.confirmPrompt')}
                value={confirmText}
                onChangeText={setConfirmText}
                placeholder={CONFIRM_WORD}
                autoCapitalize="characters"
                error={error ?? undefined}
              />
              <Button
                onPress={onConfirm}
                variant="danger"
                loading={status === 'submitting'}
                disabled={!canSubmit || status === 'submitting'}
                fullWidth
                testID="delete-account-submit"
              >
                {t('settings.deleteAccount.submit')}
              </Button>
            </VStack>
          </Card>
        </VStack>
      </View>
    </Screen>
  );
}

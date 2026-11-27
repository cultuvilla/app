import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  checkAccountDeletable,
  deleteAccount,
  isReauthRequiredError,
  type Blocker,
} from '@cultuvilla/shared/services/accountService';
import { Screen } from '../../components/primitives/Screen';
import { Card } from '../../components/primitives/Card';
import { Input } from '../../components/primitives/Input';
import { Button } from '../../components/primitives/Button';
import { Text } from '../../components/primitives/Text';
import { VStack } from '../../components/primitives/VStack';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { useAuth } from '../../lib/auth/useAuth';
import { useT } from '../../lib/i18n';
import { isCancelledAuthError, reportAuthError } from '../../lib/auth/reportAuthError';
import { authErrorMessage } from '../../lib/auth/authErrorMessage';

const CONFIRM_WORD = 'ELIMINAR';

type Status = 'loading' | 'blocked' | 'ready' | 'submitting' | 'error';

// Google's cancel carries no code, only this message (see AuthContext).
function isCancelled(error: unknown): boolean {
  return isCancelledAuthError(error) || (error as { message?: unknown } | null)?.message === 'Google sign-in was cancelled';
}

export default function DeleteAccountScreen() {
  const { signOut, user, reauthMethod, reauthWithProvider, sendReauthCode, reauthWithCode } = useAuth();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<Status>('loading');
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeResent, setCodeResent] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);

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

  // The server refuses a sign-in older than a few minutes; the screen then
  // asks for one and deletes as soon as it succeeds.
  async function runDelete() {
    setError(null);
    setStatus('submitting');
    try {
      await deleteAccount();
      await signOut();
    } catch (e) {
      if (isReauthRequiredError(e)) {
        await enterReauth();
        return;
      }
      setError(t('settings.deleteAccount.error.generic'));
      setStatus('ready');
    }
  }

  async function enterReauth() {
    setCode('');
    setCodeResent(false);
    setNeedsReauth(true);
    setStatus('ready');
    if (reauthMethod !== 'email') return;
    try {
      await sendReauthCode();
    } catch (e) {
      reportAuthError('deleteAccount:sendReauthCode', e);
      setError(authErrorMessage(e, t('settings.deleteAccount.reauth.error')));
    }
  }

  async function onResendCode() {
    setError(null);
    setCodeResent(false);
    try {
      await sendReauthCode();
      setCodeResent(true);
    } catch (e) {
      reportAuthError('deleteAccount:sendReauthCode', e);
      setError(authErrorMessage(e, t('settings.deleteAccount.reauth.error')));
    }
  }

  async function onReauth() {
    setError(null);
    setStatus('submitting');
    try {
      if (reauthMethod === 'email') await reauthWithCode(code.trim());
      else await reauthWithProvider();
    } catch (e) {
      setStatus('ready');
      if (isCancelled(e)) return;
      reportAuthError('deleteAccount:reauth', e);
      setError(authErrorMessage(e, t('settings.deleteAccount.reauth.error')));
      return;
    }
    await runDelete();
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

  if (needsReauth) {
    return (
      <Screen padded={false} scroll bottomInset={false}>
        <ScreenHeader title={t('settings.deleteAccount.title')} />
        <View style={{ paddingBottom: insets.bottom + 16 }}>
          <VStack gap={4} className="p-4">
            <Card variant="flat">
              <VStack gap={3}>
                <Text>{t('settings.deleteAccount.reauth.intro')}</Text>
                {reauthMethod === 'email' && (
                  <>
                    <Text tone="muted" variant="bodySm">
                      {t('settings.deleteAccount.reauth.codeSent', { email: user?.email ?? '' })}
                    </Text>
                    <Input
                      testID="delete-account-reauth-code"
                      label={t('settings.deleteAccount.reauth.codeLabel')}
                      value={code}
                      onChangeText={setCode}
                      keyboardType="number-pad"
                      autoComplete="one-time-code"
                      maxLength={6}
                      error={error ?? undefined}
                    />
                    {codeResent && (
                      <Text tone="success" variant="bodySm">
                        {t('settings.deleteAccount.reauth.resent')}
                      </Text>
                    )}
                    <Button
                      onPress={onReauth}
                      variant="danger"
                      loading={status === 'submitting'}
                      disabled={code.trim().length < 6 || status === 'submitting'}
                      fullWidth
                      testID="delete-account-reauth-submit"
                    >
                      {t('settings.deleteAccount.submit')}
                    </Button>
                    <Button onPress={onResendCode} variant="ghost" disabled={status === 'submitting'} fullWidth>
                      {t('settings.deleteAccount.reauth.resend')}
                    </Button>
                  </>
                )}
                {(reauthMethod === 'google' || reauthMethod === 'apple') && (
                  <>
                    <Button
                      onPress={onReauth}
                      variant="danger"
                      loading={status === 'submitting'}
                      disabled={status === 'submitting'}
                      fullWidth
                      testID="delete-account-reauth-submit"
                    >
                      {t(`settings.deleteAccount.reauth.${reauthMethod}`)}
                    </Button>
                    {error && (
                      <Text tone="danger" variant="bodySm">
                        {error}
                      </Text>
                    )}
                  </>
                )}
                {reauthMethod === null && (
                  <Text tone="danger">{t('settings.deleteAccount.reauth.signInAgain')}</Text>
                )}
              </VStack>
            </Card>
          </VStack>
        </View>
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
                onPress={() => void runDelete()}
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

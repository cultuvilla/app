import { routes } from '../../lib/navigation/routes';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { isValidEmail } from '@cultuvilla/shared/utils';
import { Screen } from '../../components/primitives/Screen';
import { Card } from '../../components/primitives/Card';
import { Input } from '../../components/primitives/Input';
import { Button } from '../../components/primitives/Button';
import { Text } from '../../components/primitives/Text';
import { VStack } from '../../components/primitives/VStack';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { useAuth } from '../../lib/auth/useAuth';
import { useT } from '../../lib/i18n';
import { ReauthRequiredError } from '../../lib/auth/AuthContext';

type Status = 'form' | 'submitting' | 'sentToNewEmail' | 'reauthRequired';

const ERROR_CODE_KEYS: Record<string, string> = {
  'auth/invalid-email': 'settings.changeEmail.error.invalidEmail',
  'auth/email-already-in-use': 'settings.changeEmail.error.emailInUse',
};

export default function ChangeEmailScreen() {
  const { changeEmail, canChangeEmail } = useAuth();
  const { t } = useT();
  const [newEmail, setNewEmail] = useState('');
  const [status, setStatus] = useState<Status>('form');
  const [error, setError] = useState<string | null>(null);

  // The route is directly reachable by URL on the web build, so guard here too
  // rather than relying only on the (disabled) entry row: a non-email-only
  // account (e.g. Google) must not reach the change-email form.
  useEffect(() => {
    if (!canChangeEmail) router.replace(routes.settings);
  }, [canChangeEmail]);

  if (!canChangeEmail) return null;

  async function onSubmit() {
    setError(null);
    if (!isValidEmail(newEmail)) {
      setError(t('settings.changeEmail.error.invalidEmail'));
      return;
    }
    setStatus('submitting');
    try {
      await changeEmail(newEmail.trim());
      setStatus('sentToNewEmail');
    } catch (err) {
      if (err instanceof ReauthRequiredError) {
        setStatus('reauthRequired');
        return;
      }
      const code = (err as { code?: string } | null)?.code;
      const key = (code && ERROR_CODE_KEYS[code]) ?? 'settings.changeEmail.error.generic';
      setError(t(key));
      setStatus('form');
    }
  }

  if (status === 'sentToNewEmail') {
    return (
      <Screen padded={false} scroll>
        <ScreenHeader title={t('settings.changeEmail.title')} />
        <VStack gap={4} className="p-4">
          <Card variant="flat">
            <Text>{t('settings.changeEmail.sentToNewEmail')}</Text>
          </Card>
        </VStack>
      </Screen>
    );
  }

  if (status === 'reauthRequired') {
    return (
      <Screen padded={false} scroll>
        <ScreenHeader title={t('settings.changeEmail.title')} />
        <VStack gap={4} className="p-4">
          <Card variant="flat">
            <Text>{t('settings.changeEmail.reauthNotice')}</Text>
          </Card>
        </VStack>
      </Screen>
    );
  }

  return (
    <Screen padded={false} scroll>
      <ScreenHeader title={t('settings.changeEmail.title')} />
      <VStack gap={4} className="p-4">
        <Card variant="flat">
          <VStack gap={3}>
            <Input
              testID="change-email-input"
              label={t('settings.changeEmail.newEmailPlaceholder')}
              value={newEmail}
              onChangeText={(next) => {
                setNewEmail(next);
                setError(null);
              }}
              placeholder={t('settings.changeEmail.newEmailPlaceholder')}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              error={error ?? undefined}
            />
            <Button
              onPress={onSubmit}
              loading={status === 'submitting'}
              disabled={status === 'submitting' || !newEmail.trim()}
              fullWidth
              testID="change-email-submit"
            >
              {t('settings.changeEmail.submit')}
            </Button>
          </VStack>
        </Card>
      </VStack>
    </Screen>
  );
}

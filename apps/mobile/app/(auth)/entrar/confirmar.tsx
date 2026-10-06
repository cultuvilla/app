import { routes } from '../../../lib/navigation/routes';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { Text } from '../../../components/primitives';
import { AuthCard, AuthHeader } from '../../../components/auth';
import { useAuth } from '../../../lib/auth/useAuth';
import { useT } from '../../../lib/i18n';

type Status = 'pending' | 'completing' | 'error' | 'reauth-done';

async function readIncomingUrl(): Promise<string | null> {
  return Linking.getInitialURL();
}

/**
 * The only email link left in the app is the changeEmail re-auth link (see
 * docs/plans/ongoing/otp-email-signin.md — sign-in itself moved to an OTP
 * code, which never lands here). So any link reaching this screen is
 * expected to carry a pending-reauth intent; anything else is treated as
 * invalid rather than a sign-in link to complete.
 */
export default function FinishScreen() {
  const {
    user,
    loading: authLoading,
    isEmailLink,
    completeReauth,
    readPendingReauth,
    clearPendingReauth,
  } = useAuth();
  const { t } = useT();
  const [status, setStatus] = useState<Status>('pending');
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    // Wait for the initial onAuthStateChanged callback to resolve before
    // deciding whether a session is present — otherwise a persisted session
    // that hasn't finished restoring yet would read as "no signed-in user"
    // and wrongly discard a valid pending-reauth intent.
    if (authLoading) return;
    if (attempted.current) return;
    attempted.current = true;
    void (async () => {
      const url = await readIncomingUrl();
      if (!url || !isEmailLink(url)) {
        setStatus('error');
        setError(t('auth.emailLink.invalid'));
        return;
      }
      const pendingReauth = await readPendingReauth();
      if (!pendingReauth) {
        setStatus('error');
        setError(t('auth.emailLink.invalid'));
        return;
      }
      // The session can lapse between changeEmail() sending this link and
      // the user tapping it (e.g. signed out on another device, token
      // expired). completeReauth requires a live session, so retrying it
      // here would just wedge on 'not-signed-in' forever.
      if (!user) {
        await clearPendingReauth();
        setStatus('error');
        setError(t('auth.emailLink.invalid'));
        return;
      }
      setStatus('completing');
      try {
        await completeReauth(url);
        setStatus('reauth-done');
        router.replace(routes.settings);
      } catch (e) {
        setStatus('error');
        setError(e instanceof Error ? e.message : t('auth.error.unknown'));
      }
    })();
  }, [authLoading, isEmailLink, readPendingReauth, completeReauth, clearPendingReauth, user, t]);

  if (status === 'pending' || status === 'completing' || status === 'reauth-done') {
    return (
      <AuthCard>
        <View className="items-center pt-8">
          <ActivityIndicator />
          <Text tone="muted" className="mt-4">
            {t('auth.emailLink.completing')}
          </Text>
        </View>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <AuthHeader title={t('auth.emailLink.invalidTitle')} />
      <Text tone="danger">{error ?? t('auth.emailLink.invalid')}</Text>
    </AuthCard>
  );
}

import { useState } from 'react';
import { Platform } from 'react-native';
import { isValidEmail } from '@cultuvilla/shared/utils';
import { Button, Input, Text, VStack } from '../../components/primitives';
import {
  AppleButton,
  AuthCard,
  AuthHeader,
  DevLoginButtons,
  GoogleButton,
  OrDivider,
} from '../../components/auth';
import { useAuth } from '../../lib/auth/useAuth';
import { authErrorMessage } from '../../lib/auth/authErrorMessage';
import { reportAuthError } from '../../lib/auth/reportAuthError';
import { useT } from '../../lib/i18n';

type Step = 'email' | 'code';

export default function LoginScreen() {
  const {
    sendOtpCode,
    verifyOtpCode,
    signInWithGoogle,
    signInWithApple,
    devAccounts,
    signInWithDevAccount,
  } = useAuth();
  const { t } = useT();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sendLoading, setSendLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [devLoadingEmail, setDevLoadingEmail] = useState<string | null>(null);

  async function onSendCode() {
    setError(null);
    if (!isValidEmail(email)) {
      setEmailError(t('auth.login.invalidEmail'));
      return;
    }
    setSendLoading(true);
    try {
      await sendOtpCode(email);
      setStep('code');
    } catch (e) {
      reportAuthError('auth:sendOtpCode', e);
      setError(authErrorMessage(e, t('auth.error.unknown')));
    } finally {
      setSendLoading(false);
    }
  }

  async function onVerifyCode() {
    setError(null);
    setVerifyLoading(true);
    try {
      await verifyOtpCode(email, code);
      // AuthGate (app/_layout.tsx) picks up the auth state change and routes.
    } catch (e) {
      reportAuthError('auth:verifyOtpCode', e);
      setError(authErrorMessage(e, t('auth.error.unknown')));
    } finally {
      setVerifyLoading(false);
    }
  }

  function onChangeEmailText(next: string) {
    setEmail(next);
    setEmailError(null);
  }

  // Flagged on leaving the field, never mid-typing: 'ana@' is a valid prefix of
  // a valid address, and shouting at it would be noise.
  function onEmailBlur() {
    if (email.trim() && !isValidEmail(email)) setEmailError(t('auth.login.invalidEmail'));
  }

  // A typo in the address is only visible once the code screen names it, so
  // the code step must be able to go back — otherwise the only way out of a
  // wrong email is to verify it and get stuck behind the onboarding gate.
  function onChangeEmail() {
    setError(null);
    setCode('');
    setStep('email');
  }

  async function onGoogle() {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      reportAuthError('auth:signInWithGoogle', e);
      setError(authErrorMessage(e, t('auth.error.unknown')));
    } finally {
      setGoogleLoading(false);
    }
  }

  async function onApple() {
    setError(null);
    setAppleLoading(true);
    try {
      await signInWithApple();
    } catch (e) {
      reportAuthError('auth:signInWithApple', e);
      setError(authErrorMessage(e, t('auth.error.unknown')));
    } finally {
      setAppleLoading(false);
    }
  }

  async function onDevAccount(devEmail: string) {
    setError(null);
    setDevLoadingEmail(devEmail);
    try {
      await signInWithDevAccount(devEmail);
    } catch (e) {
      setError(authErrorMessage(e, t('auth.error.unknown')));
    } finally {
      setDevLoadingEmail(null);
    }
  }

  if (step === 'code') {
    return (
      <AuthCard>
        <AuthHeader title={t('auth.login.title')} />
        <VStack gap={3}>
          <Text tone="muted" testID="login-code-sent">
            {t('auth.otp.sent', { email })}
          </Text>
          <Input
            label={t('auth.otp.codeLabel')}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            maxLength={6}
            testID="login-code-input"
          />
          {error != null && <Text tone="danger">{error}</Text>}
          <Button onPress={onVerifyCode} loading={verifyLoading} fullWidth testID="login-verify-code">
            {t('auth.otp.verify')}
          </Button>
          <Button variant="ghost" onPress={onSendCode} loading={sendLoading} fullWidth testID="login-resend-code">
            {t('auth.otp.resend')}
          </Button>
          <Button variant="ghost" onPress={onChangeEmail} fullWidth testID="login-change-email">
            {t('auth.otp.changeEmail')}
          </Button>
        </VStack>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <AuthHeader title={t('auth.login.title')} />
      <VStack gap={3}>
        <Input
          value={email}
          onChangeText={onChangeEmailText}
          onBlur={onEmailBlur}
          error={emailError ?? undefined}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          testID="login-email-input"
        />
        <Text tone="muted" variant="bodySm">
          {t('auth.otp.hint')}
        </Text>
        {error != null && <Text tone="danger">{error}</Text>}
        <Button onPress={onSendCode} loading={sendLoading} fullWidth testID="login-submit">
          {t('auth.login.submit')}
        </Button>
        <OrDivider />
        <GoogleButton onPress={onGoogle} loading={googleLoading} testID="login-google-button" />
        {Platform.OS === 'ios' && (
          <AppleButton
            onPress={appleLoading ? () => {} : onApple}
            testID="login-apple-button"
          />
        )}
        <DevLoginButtons
          accounts={devAccounts}
          onSelect={onDevAccount}
          loadingEmail={devLoadingEmail}
        />
      </VStack>
    </AuthCard>
  );
}

import { routes } from '../../lib/navigation/routes';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { Screen } from '../../components/primitives/Screen';
import { Card } from '../../components/primitives/Card';
import { Pressable } from '../../components/primitives/Pressable';
import { Text } from '../../components/primitives/Text';
import { VStack } from '../../components/primitives/VStack';
import { HStack } from '../../components/primitives/HStack';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { useAuth } from '../../lib/auth/useAuth';
import { useT } from '../../lib/i18n';
import { Toggle } from '../../components/primitives/Toggle';
import { useAnalyticsConsent } from '../../lib/observability/AnalyticsConsentProvider';
import { showAlert } from '../../lib/dialogs';

export default function SettingsScreen() {
  const { profile, canChangeEmail } = useAuth();
  const { t } = useT();
  const { answer: analyticsAnswer, setUsageAnalytics } = useAnalyticsConsent();

  function onToggleAnalytics(next: boolean) {
    setUsageAnalytics(next).catch(() => showAlert(t('settings.analytics.saveError')));
  }

  const changeEmailDisabled = !canChangeEmail;
  const displayName = profile?.displayName ?? '';
  const email = profile?.email ?? '';

  return (
    <Screen padded={false} scroll>
      <ScreenHeader title={t('settings.title')} />
      <VStack gap={6} className="p-4">
        <VStack gap={1}>
          {displayName ? <Text variant="h3">{displayName}</Text> : null}
          {email ? (
            <Text variant="body" tone="muted">
              {email}
            </Text>
          ) : null}
        </VStack>

        <VStack gap={2}>
          <Text variant="caption" tone="muted" className="uppercase">
            {t('settings.section.account')}
          </Text>
          <Card variant="flat" className="p-0">
            <Pressable
              onPress={() => router.push(routes.changeEmail)}
              disabled={changeEmailDisabled}
              className="px-4 py-3 border-b border-subtle"
            >
              <HStack justify="between" align="center">
                <Text tone={changeEmailDisabled ? 'muted' : 'primary'}>
                  {t('settings.changeEmail.label')}
                </Text>
                {!changeEmailDisabled ? (
                  <Ionicons name="chevron-forward" size={iconSizes.sm} color={colors.light.fg.chevron} />
                ) : null}
              </HStack>
              {changeEmailDisabled ? (
                <Text variant="caption" tone="muted" className="mt-1">
                  {t('settings.changeEmail.googleDisabledHint')}
                </Text>
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => router.push(routes.deleteAccount)}
              className="px-4 py-3"
            >
              <HStack justify="between" align="center">
                <Text tone="danger">{t('settings.deleteAccount.label')}</Text>
                <Ionicons name="chevron-forward" size={iconSizes.sm} color={colors.light.fg.chevron} />
              </HStack>
            </Pressable>
          </Card>
        </VStack>

        <VStack gap={2}>
          <Text variant="caption" tone="muted" className="uppercase">
            {t('settings.section.notifications')}
          </Text>
          <Card variant="flat" className="p-0">
            <Pressable
              onPress={() => router.push(routes.notificationSettings)}
              className="px-4 py-3"
              testID="settings-notifications"
            >
              <HStack justify="between" align="center">
                <Text>{t('notifications.settings.label')}</Text>
                <Ionicons name="chevron-forward" size={iconSizes.sm} color={colors.light.fg.chevron} />
              </HStack>
            </Pressable>
          </Card>
        </VStack>

        <VStack gap={2}>
          <Text variant="caption" tone="muted" className="uppercase">
            {t('settings.section.privacy')}
          </Text>
          <Card variant="flat" className="px-4 py-3">
            <VStack gap={1}>
              <Toggle
                value={analyticsAnswer === true}
                onValueChange={onToggleAnalytics}
                disabled={analyticsAnswer === undefined}
                label={t('settings.analytics.label')}
                testID="settings-usage-analytics"
              />
              <Text variant="caption" tone="muted">
                {t('settings.analytics.hint')}
              </Text>
            </VStack>
          </Card>
        </VStack>

        <VStack gap={2}>
          <Text variant="caption" tone="muted" className="uppercase">
            {t('settings.section.safety')}
          </Text>
          <Card variant="flat" className="p-0">
            <Pressable onPress={() => router.push(routes.blockedUsers)} className="px-4 py-3">
              <HStack justify="between" align="center">
                <Text>{t('settings.blocked.label')}</Text>
                <Ionicons name="chevron-forward" size={iconSizes.sm} color={colors.light.fg.chevron} />
              </HStack>
            </Pressable>
          </Card>
        </VStack>
      </VStack>
    </Screen>
  );
}

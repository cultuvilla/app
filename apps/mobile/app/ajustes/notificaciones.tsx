import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import {
  NOTIFICATION_PREF_KEYS,
  type NotificationPrefKey,
  type NotificationPrefsData,
} from '@cultuvilla/shared/models/notification';
import {
  getNotificationPrefs,
  saveNotificationPrefs,
} from '@cultuvilla/shared/services/notificationService';
import { Screen } from '../../components/primitives/Screen';
import { Card } from '../../components/primitives/Card';
import { Button } from '../../components/primitives/Button';
import { Text } from '../../components/primitives/Text';
import { Toggle } from '../../components/primitives/Toggle';
import { VStack } from '../../components/primitives/VStack';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { useAuth } from '../../lib/auth/useAuth';
import { useT } from '../../lib/i18n';
import { usePush } from '../../lib/push/PushProvider';
import { openPushSettings } from '../../lib/push/pushClient';
import { showAlert } from '../../lib/dialogs';

type PrefKey = NotificationPrefKey | 'quietHours';

/**
 * Per-category push toggles, plus the recovery path for a refused permission.
 *
 * These gate PUSH only — the Buzón always keeps everything, which the intro
 * says out loud so muting never feels like losing information.
 */
export default function NotificationSettingsScreen() {
  const { user } = useAuth();
  const { t } = useT();
  const { permission, refreshPermission, requestPermission } = usePush();
  const [prefs, setPrefs] = useState<NotificationPrefsData | null>(null);

  useEffect(() => {
    if (!user) return;
    void getNotificationPrefs(user.uid).then(setPrefs);
  }, [user]);

  // Returning from the system settings app does not refocus this screen — it
  // was never blurred — so the permission is re-read on app foreground instead.
  useEffect(() => {
    void refreshPermission();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshPermission();
    });
    return () => {
      sub.remove();
    };
  }, [refreshPermission]);

  const setPref = useCallback(
    (key: PrefKey, value: boolean) => {
      if (!user || !prefs) return;
      const previous = prefs;
      const next = { ...prefs, [key]: value };
      setPrefs(next);
      saveNotificationPrefs(user.uid, next).catch(() => {
        setPrefs(previous);
        showAlert(t('notifications.settings.saveError'));
      });
    },
    [user, prefs, t],
  );

  const pushOff = permission !== 'granted';

  return (
    <Screen padded={false} scroll>
      <ScreenHeader title={t('notifications.settings.title')} />
      <VStack gap={6} className="p-4">
        <Text tone="muted">{t('notifications.settings.intro')}</Text>

        {permission === 'unsupported' ? (
          <Card variant="flat">
            <Text tone="muted">{t('notifications.settings.permission.unsupported')}</Text>
          </Card>
        ) : null}

        {permission === 'denied' || permission === 'undetermined' ? (
          <Card variant="flat" testID={`push-permission-${permission}`}>
            <VStack gap={2}>
              <Text className="font-semibold">
                {t(`notifications.settings.permission.${permission}.title`)}
              </Text>
              <Text tone="muted">{t(`notifications.settings.permission.${permission}.body`)}</Text>
              <Button
                variant="secondary"
                onPress={() => {
                  // Denied: iOS will never show the dialog again, so only the
                  // system settings screen can undo it.
                  if (permission === 'denied') void openPushSettings();
                  else void requestPermission();
                }}
              >
                {t(`notifications.settings.permission.${permission}.action`)}
              </Button>
            </VStack>
          </Card>
        ) : null}

        {prefs === null ? (
          <View className="items-center py-6">
            <ActivityIndicator />
          </View>
        ) : (
          <Card variant="flat" className="p-0">
            {NOTIFICATION_PREF_KEYS.map((category) => (
              <VStack key={category} gap={1} className="px-4 py-3 border-b border-subtle">
                <Toggle
                  value={prefs[category]}
                  onValueChange={(v) => setPref(category, v)}
                  label={t(`notifications.settings.categories.${category}.label`)}
                  disabled={pushOff}
                  testID={`push-pref-${category}`}
                />
                <Text variant="caption" tone="muted">
                  {t(`notifications.settings.categories.${category}.hint`)}
                </Text>
              </VStack>
            ))}
            <VStack gap={1} className="px-4 py-3">
              <Toggle
                value={prefs.quietHours}
                onValueChange={(v) => setPref('quietHours', v)}
                label={t('notifications.settings.quietHours.label')}
                disabled={pushOff}
                testID="push-pref-quietHours"
              />
              <Text variant="caption" tone="muted">
                {t('notifications.settings.quietHours.hint')}
              </Text>
            </VStack>
          </Card>
        )}
      </VStack>
    </Screen>
  );
}

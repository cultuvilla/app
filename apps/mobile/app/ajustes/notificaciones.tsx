import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { iconSizes } from '@cultuvilla/shared/design-system';
import {
  groupNotifyLevel,
  NOTIFICATION_TOPIC_SECTIONS,
  type GroupNotificationPrefsData,
  type GroupNotifyLevel,
  NOTIFICATION_TOPIC_SECTION_ORDER,
  type NotificationTopic,
  type NotificationTopicSection,
  type ResolvedNotificationSettings,
} from '@cultuvilla/shared/models/notification';
import {
  saveNotificationSettings,
  watchNotificationSettings,
} from '@cultuvilla/shared/services/notificationService';
import { setGroupNotifyLevel, watchGroupNotificationPrefs } from '@cultuvilla/shared/services/groupMessageService';
import { hasSocioRoster, type OrganizationData } from '@cultuvilla/shared/models/organization';
import { Screen } from '../../components/primitives/Screen';
import { Card } from '../../components/primitives/Card';
import { ErrorState } from '../../components/primitives/ErrorState';
import { Button } from '../../components/primitives/Button';
import { HStack } from '../../components/primitives/HStack';
import { Pressable } from '../../components/primitives/Pressable';
import { Text } from '../../components/primitives/Text';
import { Toggle } from '../../components/primitives/Toggle';
import { VStack } from '../../components/primitives/VStack';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { OptionsSheet } from '../../components/feature/groups/OptionsSheet';
import { useAuth } from '../../lib/auth/useAuth';
import { useT } from '../../lib/i18n';
import { useWatch } from '../../lib/hooks/useWatch';
import { useNotificationAudience, type NotificationAudience } from '../../lib/notifications/useNotificationAudience';
import { usePush } from '../../lib/push/PushProvider';
import { openPushSettings } from '../../lib/push/pushClient';
import { showAlert, showConfirm } from '../../lib/dialogs';

type Change =
  | { kind: 'topic'; topic: NotificationTopic; on: boolean }
  | { kind: 'village'; municipalityId: string; on: boolean }
  | { kind: 'quietHours'; on: boolean };

function applyChange(settings: ResolvedNotificationSettings, change: Change): ResolvedNotificationSettings {
  const mutedTopics = new Set(settings.mutedTopics);
  const mutedVillages = new Set(settings.mutedVillages);
  let quietHours = settings.quietHours;
  if (change.kind === 'topic') {
    if (change.on) mutedTopics.delete(change.topic);
    else mutedTopics.add(change.topic);
  } else if (change.kind === 'village') {
    if (change.on) mutedVillages.delete(change.municipalityId);
    else mutedVillages.add(change.municipalityId);
  } else {
    quietHours = change.on;
  }
  return { mutedTopics, mutedVillages, quietHours };
}

/**
 * The switches that can ever fire for this person; a section left empty is not
 * shown. Cuotas stay without a group: a persona's responsible member gets the
 * reminder without being in the group.
 */
function visibleTopics(section: NotificationTopicSection, audience: NotificationAudience): readonly NotificationTopic[] {
  return NOTIFICATION_TOPIC_SECTIONS[section].filter((topic) => {
    if (topic === 'requests_to_handle') return audience.handlesRequests;
    if (section === 'groups' && topic !== 'group_cuotas') return audience.groups.length > 0;
    return true;
  });
}

/**
 * One switch per kind of notification (`NotificationTopic`), grouped as a
 * villager thinks of them, plus a per-pueblo mute and how much each group
 * notifies (`GroupNotifyLevel`). The OS permission gates all of it: without it every switch is shown
 * locked, with the way to grant it on top.
 *
 * These gate PUSH only — the Buzón always keeps everything, which the intro
 * says out loud so muting never feels like losing information.
 */
export default function NotificationSettingsScreen() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { t } = useT();
  const { permission, refreshPermission, requestPermission } = usePush();
  const settings = useWatch<ResolvedNotificationSettings>(
    'notifications:watchNotificationSettings',
    uid,
    uid ? (next, error) => watchNotificationSettings(uid, next, error) : null,
  );
  const audience = useNotificationAudience(uid);

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

  // What the person has asked for so far on this screen. Each tap builds on it,
  // not on the last snapshot: two quick taps would otherwise both start from the
  // same snapshot, and right after a save the two docs' listeners answer one at
  // a time, so a snapshot can briefly drop a mute carried over from the old doc.
  const intended = useRef<ResolvedNotificationSettings | null>(null);
  const [, setRevision] = useState(0);
  const current = intended.current ?? settings.data;
  const save = useCallback(
    (change: Change) => {
      const base = intended.current ?? settings.data;
      if (!uid || !base) return;
      const next = applyChange(base, change);
      intended.current = next;
      setRevision((n) => n + 1);
      saveNotificationSettings(uid, {
        mutedTopics: [...next.mutedTopics],
        mutedVillages: [...next.mutedVillages],
        quietHours: next.quietHours,
      }).catch(() => {
        intended.current = null;
        setRevision((n) => n + 1);
        showAlert(t('notifications.settings.saveError'));
      });
    },
    [uid, settings.data, t],
  );

  const setTopic = useCallback(
    (topic: NotificationTopic, on: boolean) => {
      // What happens to the person's own seats and events: worth a second
      // thought before going quiet, unlike the pueblo's news.
      if (!on && (NOTIFICATION_TOPIC_SECTIONS.events as readonly NotificationTopic[]).includes(topic)) {
        const label = t(`notifications.settings.topics.${topic}.label`);
        showConfirm(
          t('notifications.settings.confirmOff.title', { label }),
          t('notifications.settings.confirmOff.body'),
          () => save({ kind: 'topic', topic, on: false }),
          { confirmText: t('notifications.settings.confirmOff.confirm') },
        );
        return;
      }
      save({ kind: 'topic', topic, on });
    },
    [save, t],
  );

  const pushOff = permission !== 'granted';
  const loading = settings.status === 'loading' || audience.status === 'loading' || !current;

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

        {settings.status === 'error' ? (
          <ErrorState error={settings.error} />
        ) : loading ? (
          <View className="items-center py-6">
            <ActivityIndicator />
          </View>
        ) : (
          <>
            {NOTIFICATION_TOPIC_SECTION_ORDER.map((section) => {
              const topics = visibleTopics(section, audience);
              if (topics.length === 0) return null;
              return (
                <VStack key={section} gap={2} testID={`push-section-${section}`}>
                  <Text variant="caption" tone="muted" className="uppercase">
                    {t(`notifications.settings.sections.${section}.title`)}
                  </Text>
                  <Card variant="flat" className="p-0">
                    {topics.map((topic) => (
                      <SwitchRow
                        key={topic}
                        testID={`push-topic-${topic}`}
                        label={t(`notifications.settings.topics.${topic}.label`)}
                        hint={t(`notifications.settings.topics.${topic}.hint`)}
                        value={!current.mutedTopics.has(topic)}
                        disabled={pushOff}
                        onValueChange={(on) => setTopic(topic, on)}
                      />
                    ))}
                  </Card>

                  {section === 'village' && audience.villages.length > 1 ? (
                    <VStack gap={2} className="mt-2" testID="push-per-village">
                      <Text className="font-semibold">{t('notifications.settings.perVillage.title')}</Text>
                      <Text variant="caption" tone="muted">{t('notifications.settings.perVillage.hint')}</Text>
                      <Card variant="flat" className="p-0">
                        {audience.villages.map((village) => (
                          <SwitchRow
                            key={village.municipalityId}
                            testID={`push-village-${village.municipalityId}`}
                            label={village.name}
                            value={!current.mutedVillages.has(village.municipalityId)}
                            disabled={pushOff}
                            onValueChange={(on) => save({ kind: 'village', municipalityId: village.municipalityId, on })}
                          />
                        ))}
                      </Card>
                    </VStack>
                  ) : null}

                  {section === 'groups' && audience.groups.length > 0 ? (
                    <VStack gap={2} className="mt-2" testID="push-per-group">
                      <Text className="font-semibold">{t('notifications.settings.perGroup.title')}</Text>
                      <Text variant="caption" tone="muted">{t('notifications.settings.perGroup.hint')}</Text>
                      <Card variant="flat" className="p-0">
                        {audience.groups.map(({ org }) => (
                          <GroupNotifyRow key={org.id} uid={uid} org={org} disabled={pushOff} />
                        ))}
                      </Card>
                    </VStack>
                  ) : null}
                </VStack>
              );
            })}

            <VStack gap={2}>
              <Text variant="caption" tone="muted" className="uppercase">
                {t('notifications.settings.sections.schedule.title')}
              </Text>
              <Card variant="flat" className="p-0">
                <SwitchRow
                  testID="push-pref-quietHours"
                  label={t('notifications.settings.quietHours.label')}
                  hint={t('notifications.settings.quietHours.hint')}
                  value={current.quietHours}
                  disabled={pushOff}
                  onValueChange={(on) => save({ kind: 'quietHours', on })}
                />
              </Card>
            </VStack>
          </>
        )}
      </VStack>
    </Screen>
  );
}

function SwitchRow({
  label,
  hint,
  value,
  disabled,
  onValueChange,
  testID,
}: {
  label: string;
  hint?: string;
  value: boolean;
  disabled: boolean;
  onValueChange: (on: boolean) => void;
  testID: string;
}) {
  return (
    <VStack gap={1} className="px-4 py-3 border-b border-subtle">
      <Toggle value={value} onValueChange={onValueChange} label={label} disabled={disabled} testID={testID} />
      {hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </VStack>
  );
}

/**
 * One group and how much it notifies: everything, only its avisos and what is
 * the person's own (the default: the chats stay quiet), or nothing. A group
 * without a socio roster sends no avisos, so it offers the first two only.
 */
function GroupNotifyRow({
  uid,
  org,
  disabled,
}: {
  uid: string | null;
  org: OrganizationData & { id: string };
  disabled: boolean;
}) {
  const { t } = useT();
  const prefs = useWatch<GroupNotificationPrefsData | null>(
    'notifications:watchGroupNotificationPrefs',
    uid ? `${uid}|${org.id}` : null,
    uid ? (next, error) => watchGroupNotificationPrefs(uid, org.id, next, error) : null,
  );
  const [picked, setPicked] = useState<GroupNotifyLevel | null>(null);
  const [open, setOpen] = useState(false);
  const roster = hasSocioRoster(org.type);
  const stored = groupNotifyLevel(prefs.data ?? null);
  const level = picked ?? (!roster && stored === 'none' ? 'avisos' : stored);
  const levels: readonly GroupNotifyLevel[] = roster ? ['all', 'avisos', 'none'] : ['all', 'avisos'];
  const labelOf = (l: GroupNotifyLevel) => t(`notifications.settings.perGroup.${roster ? 'levels' : 'levelsNoAvisos'}.${l}`);

  const pick = (key: string) => {
    setOpen(false);
    const next = levels.find((l) => l === key);
    if (!uid || !next || next === level) return;
    setPicked(next);
    setGroupNotifyLevel(uid, org.id, next)
      .catch(() => showAlert(t('notifications.settings.saveError')))
      .finally(() => setPicked(null));
  };

  return (
    <>
      <Pressable
        testID={`push-group-${org.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${org.name}: ${labelOf(level)}`}
        accessibilityState={{ disabled: disabled || prefs.status !== 'ready' }}
        disabled={disabled || prefs.status !== 'ready'}
        onPress={() => setOpen(true)}
        className="px-4 py-3 border-b border-subtle"
      >
        <HStack justify="between" align="center" gap={3}>
          <Text className="flex-1" numberOfLines={1}>
            {org.name}
          </Text>
          <Text tone="muted" variant="bodySm" testID={`push-group-level-${org.id}`}>
            {prefs.status === 'ready' ? labelOf(level) : ''}
          </Text>
          <Ionicons name="chevron-forward" size={iconSizes.sm} color="#cbd5e1" />
        </HStack>
      </Pressable>
      <OptionsSheet
        visible={open}
        title={t('notifications.settings.perGroup.sheetTitle', { name: org.name })}
        options={levels.map((l) => ({ key: l, label: labelOf(l), selected: l === level }))}
        onPick={pick}
        onClose={() => setOpen(false)}
        testID={`push-group-sheet-${org.id}`}
      />
    </>
  );
}

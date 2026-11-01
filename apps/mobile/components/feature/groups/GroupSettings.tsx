import { useState } from 'react';
import type { GroupNotificationPrefsData } from '@cultuvilla/shared/models/notification';
import { saveCuotaSettings, watchCuotaSettings, type CuotaSettings } from '@cultuvilla/shared/services/cuotaService';
import { setGroupChatPush } from '@cultuvilla/shared/services/groupChatService';
import { setGroupMessagesMuted, watchGroupNotificationPrefs } from '@cultuvilla/shared/services/groupMessageService';
import { updateOrganization } from '@cultuvilla/shared/services/organizationService';
import { Text, Toggle, VStack } from '../../primitives';
import { DetailSectionHeading } from '../DetailSectionHeading';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { useWatch } from '../../../lib/hooks/useWatch';

/**
 * A group's settings, in two parts. Everyone has their own: what this group
 * notifies them of (avisos exist only with a roster). An admin also has the
 * group's: whether socios see the roster's names, what contact data being a socio
 * requires, who writes in the Charla, and
 * once the cuota is configured, whether it sends reminders.
 */
export function GroupSettings({
  orgId,
  uid,
  isAdmin,
  sociosListVisible,
  socioPhoneRequired = false,
  socioEmailRequired = false,
  hasRoster = true,
  chatAdminsOnly = false,
}: {
  orgId: string;
  uid: string;
  isAdmin: boolean;
  sociosListVisible: boolean;
  socioPhoneRequired?: boolean;
  socioEmailRequired?: boolean;
  hasRoster?: boolean;
  chatAdminsOnly?: boolean;
}) {
  const { t } = useT();
  const prefs = useWatch<GroupNotificationPrefsData | null>('groups:watchGroupNotificationPrefs', `${uid}|${orgId}`, (next, error) =>
    watchGroupNotificationPrefs(uid, orgId, next, error),
  );
  const showsCuota = isAdmin && hasRoster;
  const cuota = useWatch<CuotaSettings | null>(
    'groups:watchCuotaSettings',
    showsCuota ? orgId : null,
    showsCuota ? (next, error) => watchCuotaSettings(orgId, next, error) : null,
  );
  const [saving, setSaving] = useState(false);
  const save = (
    patch: { sociosListVisible: boolean } | { chatAdminsOnly: boolean } | { socioPhoneRequired: boolean } | { socioEmailRequired: boolean },
  ) => {
    setSaving(true);
    updateOrganization(orgId, patch)
      .catch(() => showAlert(t('groups.settings.error')))
      .finally(() => setSaving(false));
  };
  const setReminders = (remindersEnabled: boolean) => {
    if (!cuota.data) return;
    const { id: _id, configuredBy: _by, updatedAt: _at, ...settings } = cuota.data;
    setSaving(true);
    saveCuotaSettings(orgId, { ...settings, remindersEnabled }, uid)
      .catch(() => showAlert(t('groups.settings.error')))
      .finally(() => setSaving(false));
  };
  return (
    <VStack gap={6} testID="group-settings">
      <VStack gap={2} testID="group-settings-user">
        <DetailSectionHeading>{t('groups.settings.userTitle')}</DetailSectionHeading>
        {prefs.status === 'ready' ? (
          <>
            {hasRoster ? (
              <>
                <Toggle
                  testID="group-settings-mute-avisos"
                  value={prefs.data?.messagesMuted ?? false}
                  label={t('groups.messages.mute')}
                  onValueChange={(muted) => void setGroupMessagesMuted(uid, orgId, muted).catch(() => showAlert(t('groups.settings.error')))}
                />
                <Text tone="muted" variant="bodySm">
                  {t('groups.messages.muteHint')}
                </Text>
              </>
            ) : null}
            {/* Stored as an opt-in: a member hears nothing from the chats until they ask to. */}
            <Toggle
              testID="group-settings-mute-chats"
              value={!(prefs.data?.chatPush ?? false)}
              label={t('groups.chat.mute')}
              onValueChange={(muted) => void setGroupChatPush(uid, orgId, !muted, prefs.data ?? null).catch(() => showAlert(t('groups.settings.error')))}
            />
            <Text tone="muted" variant="bodySm">
              {t('groups.chat.muteHint')}
            </Text>
          </>
        ) : null}
      </VStack>

      {isAdmin ? (
        <VStack gap={2} testID="group-settings-group">
          <DetailSectionHeading>{t('groups.settings.title')}</DetailSectionHeading>
          {hasRoster ? (
            <>
              <Toggle
                testID="group-settings-socios-list-visible"
                value={sociosListVisible}
                disabled={saving}
                label={t('groups.settings.sociosListVisible')}
                onValueChange={(next) => save({ sociosListVisible: next })}
              />
              <Text tone="muted" variant="bodySm">
                {t('groups.settings.sociosListVisibleHint')}
              </Text>
              <Toggle
                testID="group-settings-socio-phone-required"
                value={socioPhoneRequired}
                disabled={saving}
                label={t('groups.settings.socioPhoneRequired')}
                onValueChange={(next) => save({ socioPhoneRequired: next })}
              />
              <Toggle
                testID="group-settings-socio-email-required"
                value={socioEmailRequired}
                disabled={saving}
                label={t('groups.settings.socioEmailRequired')}
                onValueChange={(next) => save({ socioEmailRequired: next })}
              />
              <Text tone="muted" variant="bodySm">
                {t('groups.settings.socioContactRequiredHint')}
              </Text>
            </>
          ) : null}
          <Toggle
            testID="group-settings-chat-admins-only"
            value={chatAdminsOnly}
            disabled={saving}
            label={t('groups.settings.chatAdminsOnly')}
            onValueChange={(next) => save({ chatAdminsOnly: next })}
          />
          <Text tone="muted" variant="bodySm">
            {t('groups.settings.chatAdminsOnlyHint')}
          </Text>
          {cuota.data ? (
            <>
              <Toggle
                testID="group-settings-cuota-reminders"
                value={cuota.data.remindersEnabled}
                disabled={saving}
                label={t('groups.settings.cuotaReminders')}
                onValueChange={setReminders}
              />
              <Text tone="muted" variant="bodySm">
                {t('groups.settings.cuotaRemindersHint')}
              </Text>
            </>
          ) : null}
        </VStack>
      ) : null}
    </VStack>
  );
}

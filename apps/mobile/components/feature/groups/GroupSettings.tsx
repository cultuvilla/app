import { useState } from 'react';
import type { GroupNotificationPrefsData } from '@cultuvilla/shared/models/notification';
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
 * group's, on the org doc: whether socios see the roster's names, and who
 * writes in the Charla.
 */
export function GroupSettings({
  orgId,
  uid,
  isAdmin,
  sociosListVisible,
  hasRoster = true,
  chatAdminsOnly = false,
}: {
  orgId: string;
  uid: string;
  isAdmin: boolean;
  sociosListVisible: boolean;
  hasRoster?: boolean;
  chatAdminsOnly?: boolean;
}) {
  const { t } = useT();
  const prefs = useWatch<GroupNotificationPrefsData | null>('groups:watchGroupNotificationPrefs', `${uid}|${orgId}`, (next, error) =>
    watchGroupNotificationPrefs(uid, orgId, next, error),
  );
  const [saving, setSaving] = useState(false);
  const save = (patch: { sociosListVisible: boolean } | { chatAdminsOnly: boolean }) => {
    setSaving(true);
    updateOrganization(orgId, patch)
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
        </VStack>
      ) : null}
    </VStack>
  );
}

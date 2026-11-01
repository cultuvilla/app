import { useState } from 'react';
import { updateOrganization } from '@cultuvilla/shared/services/organizationService';
import { Text, Toggle, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';

/**
 * Admin settings that live on the org doc: whether socios see the roster's names
 * (only a group with a roster has one), and who writes in the Charla.
 */
export function GroupSettings({
  orgId,
  sociosListVisible,
  hasRoster = true,
  chatAdminsOnly = false,
}: {
  orgId: string;
  sociosListVisible: boolean;
  hasRoster?: boolean;
  chatAdminsOnly?: boolean;
}) {
  const { t } = useT();
  const [saving, setSaving] = useState(false);
  const save = (patch: { sociosListVisible: boolean } | { chatAdminsOnly: boolean }) => {
    setSaving(true);
    updateOrganization(orgId, patch)
      .catch(() => showAlert(t('groups.settings.error')))
      .finally(() => setSaving(false));
  };
  return (
    <VStack gap={2} testID="group-settings">
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
  );
}

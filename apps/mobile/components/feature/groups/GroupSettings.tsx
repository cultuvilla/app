import { useState } from 'react';
import { updateOrganization } from '@cultuvilla/shared/services/organizationService';
import { Text, Toggle, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';

/** Admin settings that live on the org doc. Today: whether socios see the roster's names. */
export function GroupSettings({ orgId, sociosListVisible }: { orgId: string; sociosListVisible: boolean }) {
  const { t } = useT();
  const [saving, setSaving] = useState(false);
  return (
    <VStack gap={2} testID="group-settings">
      <Toggle
        testID="group-settings-socios-list-visible"
        value={sociosListVisible}
        disabled={saving}
        label={t('groups.settings.sociosListVisible')}
        onValueChange={(next) => {
          setSaving(true);
          updateOrganization(orgId, { sociosListVisible: next })
            .catch(() => showAlert(t('groups.settings.error')))
            .finally(() => setSaving(false));
        }}
      />
      <Text tone="muted" variant="bodySm">
        {t('groups.settings.sociosListVisibleHint')}
      </Text>
    </VStack>
  );
}

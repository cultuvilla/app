import { useState } from 'react';
import { DEFAULT_COSATECA_SETTINGS, type CosatecaAudience, type CosatecaSettings } from '@cultuvilla/shared/models/organization';
import { saveCuotaSettings, watchCuotaSettings, type CuotaSettings } from '@cultuvilla/shared/services/cuotaService';
import { updateOrganization } from '@cultuvilla/shared/services/organizationService';
import { Toggle, VStack } from '../../primitives';
import { SegmentedToggle } from '../SegmentedToggle';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { useWatch } from '../../../lib/hooks/useWatch';

/**
 * A group's rules, for its admins: whether socios see the roster, what contact
 * data being a socio requires, who writes in the Charla, whether it runs a
 * cosateca and for whom, and, once the cuota is configured, its reminders. A
 * member's own notifications are in Ajustes → Notificaciones, not here.
 */
export function GroupSettings({
  orgId,
  uid,
  sociosListVisible,
  socioPhoneRequired = false,
  socioEmailRequired = false,
  hasRoster = true,
  chatAdminsOnly = false,
  cosateca = DEFAULT_COSATECA_SETTINGS,
}: {
  orgId: string;
  uid: string;
  sociosListVisible: boolean;
  socioPhoneRequired?: boolean;
  socioEmailRequired?: boolean;
  hasRoster?: boolean;
  chatAdminsOnly?: boolean;
  cosateca?: CosatecaSettings;
}) {
  const { t } = useT();
  const cuota = useWatch<CuotaSettings | null>(
    'groups:watchCuotaSettings',
    hasRoster ? orgId : null,
    hasRoster ? (next, error) => watchCuotaSettings(orgId, next, error) : null,
  );
  const [saving, setSaving] = useState(false);
  const save = (
    patch:
      | { sociosListVisible: boolean }
      | { chatAdminsOnly: boolean }
      | { socioPhoneRequired: boolean }
      | { socioEmailRequired: boolean }
      | { cosateca: CosatecaSettings },
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
    <VStack gap={4} testID="group-settings">
      {hasRoster ? (
        <>
          <Toggle
            testID="group-settings-socios-list-visible"
            value={sociosListVisible}
            disabled={saving}
            label={t('groups.settings.sociosListVisible')}
            onValueChange={(next) => save({ sociosListVisible: next })}
          />
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
        </>
      ) : null}
      <Toggle
        testID="group-settings-chat-admins-only"
        value={chatAdminsOnly}
        disabled={saving}
        label={t('groups.settings.chatAdminsOnly')}
        onValueChange={(next) => save({ chatAdminsOnly: next })}
      />
      <Toggle
        testID="group-settings-cosateca"
        value={cosateca.enabled}
        disabled={saving}
        label={t('groups.settings.cosateca')}
        onValueChange={(enabled) => save({ cosateca: { ...cosateca, enabled } })}
      />
      {cosateca.enabled ? (
        <SegmentedToggle<CosatecaAudience>
          testID="group-settings-cosateca-audience"
          value={cosateca.audience}
          options={[
            { value: 'integrantes', label: t('groups.settings.cosatecaAudience.integrantes') },
            { value: 'pueblo', label: t('groups.settings.cosatecaAudience.pueblo') },
          ]}
          onChange={(audience) => {
            if (!saving && audience !== cosateca.audience) save({ cosateca: { ...cosateca, audience } });
          }}
        />
      ) : null}
      {cuota.data ? (
        <Toggle
          testID="group-settings-cuota-reminders"
          value={cuota.data.remindersEnabled}
          disabled={saving}
          label={t('groups.settings.cuotaReminders')}
          onValueChange={setReminders}
        />
      ) : null}
    </VStack>
  );
}

import { useState } from 'react';
import {
  DEFAULT_COSATECA_SETTINGS,
  DEFAULT_GROUP_TRANSPARENCY,
  type CosatecaAudience,
  type CosatecaSettings,
  type GroupTransparency,
  type GroupTransparencyView,
  type OrgJoinPolicy,
} from '@cultuvilla/shared/models/organization';
import type { ReactNode } from 'react';
import { saveCuotaSettings, watchCuotaSettings, type CuotaSettings } from '@cultuvilla/shared/services/cuotaService';
import { updateOrganization } from '@cultuvilla/shared/services/organizationService';
import { Card, Text, Toggle, VStack } from '../../primitives';
import { SegmentedToggle } from '../SegmentedToggle';
import { useT } from '../../../lib/i18n';
import { showAlert, showConfirm } from '../../../lib/dialogs';
import { useWatch } from '../../../lib/hooks/useWatch';

const TRANSPARENCY_VIEWS: readonly GroupTransparencyView[] = ['cuota', 'avisos', 'cuentas'];

/** A titled block of settings: the screen reads as a few questions, not one long list. */
function SettingsSection({ title, children, testID }: { title: string; children: ReactNode; testID?: string }) {
  return (
    <VStack gap={2} testID={testID}>
      <Text variant="caption" tone="muted" className="font-bold uppercase tracking-wide px-1 pt-4">
        {title}
      </Text>
      <Card variant="elevated">
        <VStack gap={4}>{children}</VStack>
      </Card>
    </VStack>
  );
}

function Hint({ children }: { children: string }) {
  return (
    <Text variant="caption" tone="muted">
      {children}
    </Text>
  );
}

/**
 * A group's rules, for its admins, under one heading per question: how one
 * joins (approval, and the contact data being a socio requires), what every
 * socio sees (the roster, the cuota's al día list, every aviso, the accounts),
 * who writes in the Charla, the cosateca and for whom, and, once the cuota is
 * configured, its reminders. An ayuntamiento always admits by approval, so it
 * has no switch for it. A member's own notifications are in Ajustes →
 * Notificaciones, not here.
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
  transparency = DEFAULT_GROUP_TRANSPARENCY,
  joinPolicy = 'approval',
  isAyuntamiento = false,
}: {
  orgId: string;
  uid: string;
  sociosListVisible: boolean;
  socioPhoneRequired?: boolean;
  socioEmailRequired?: boolean;
  hasRoster?: boolean;
  chatAdminsOnly?: boolean;
  cosateca?: CosatecaSettings;
  transparency?: GroupTransparency;
  joinPolicy?: OrgJoinPolicy;
  isAyuntamiento?: boolean;
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
      | { cosateca: CosatecaSettings }
      | { transparency: GroupTransparency }
      | { joinPolicy: OrgJoinPolicy },
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
  const setRequiresApproval = (next: boolean) => {
    if (next) return save({ joinPolicy: 'approval' });
    showConfirm(
      t('organization.joinPolicy.switchToOpenTitle'),
      t('organization.joinPolicy.switchToOpenBody'),
      () => save({ joinPolicy: 'open' }),
    );
  };
  const requiresApproval = joinPolicy === 'approval';
  return (
    <VStack gap={6} testID="group-settings">
      {!isAyuntamiento || hasRoster ? (
        <SettingsSection title={t('groups.settings.sections.entry')} testID="group-settings-entry">
          {!isAyuntamiento ? (
            <VStack gap={1}>
              <Toggle
                testID="group-settings-join-policy"
                value={requiresApproval}
                disabled={saving}
                label={t('organization.joinPolicy.label')}
                onValueChange={setRequiresApproval}
              />
              <Hint>{t(requiresApproval ? 'organization.joinPolicy.approvalHint' : 'organization.joinPolicy.openHint')}</Hint>
            </VStack>
          ) : null}
          {hasRoster ? (
            <>
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
        </SettingsSection>
      ) : null}
      {hasRoster ? (
        <SettingsSection title={t('groups.transparency.settings.title')} testID="group-settings-transparency">
          <Toggle
            testID="group-settings-socios-list-visible"
            value={sociosListVisible}
            disabled={saving}
            label={t('groups.settings.sociosListVisible')}
            onValueChange={(next) => save({ sociosListVisible: next })}
          />
          {TRANSPARENCY_VIEWS.map((view) => (
            <VStack key={view} gap={1}>
              <Toggle
                testID={`group-settings-transparency-${view}`}
                value={transparency[view]}
                disabled={saving}
                label={t(`groups.transparency.settings.${view}.label`)}
                onValueChange={(next) => save({ transparency: { ...transparency, [view]: next } })}
              />
              <Hint>{t(`groups.transparency.settings.${view}.hint`)}</Hint>
            </VStack>
          ))}
        </SettingsSection>
      ) : null}
      <SettingsSection title={t('groups.settings.sections.charla')} testID="group-settings-charla">
        <Toggle
          testID="group-settings-chat-admins-only"
          value={chatAdminsOnly}
          disabled={saving}
          label={t('groups.settings.chatAdminsOnly')}
          onValueChange={(next) => save({ chatAdminsOnly: next })}
        />
      </SettingsSection>
      <SettingsSection title={t('groups.settings.sections.cosateca')} testID="group-settings-cosateca-section">
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
      </SettingsSection>
      {cuota.data ? (
        <SettingsSection title={t('groups.settings.sections.cuota')} testID="group-settings-cuota">
          <Toggle
            testID="group-settings-cuota-reminders"
            value={cuota.data.remindersEnabled}
            disabled={saving}
            label={t('groups.settings.cuotaReminders')}
            onValueChange={setReminders}
          />
        </SettingsSection>
      ) : null}
    </VStack>
  );
}

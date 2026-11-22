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

/**
 * A group's rules, for its admins, under one heading per question: first what
 * the group uses (the cuota, where it has socios, and the cosateca, with whom
 * it is for; decided 2026-11-20, user), then how one
 * joins (approval, and the contact data being a socio requires), what every
 * socio sees (the roster, the cuota's al día list, every aviso, the accounts),
 * what socios (integrantes, in a group without a roster) can do — write in the
 * Charla and, where there are socios, send avisos to all of them — and, once the cuota is configured, its reminders. Each
 * switch's label reads alone under its heading, so none carries a hint.
 * Switching the cuota, the actas or the cuentas off hides their buttons, never their data. An ayuntamiento always admits by approval, so it
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
  sociosSendAvisos = false,
  cosateca = DEFAULT_COSATECA_SETTINGS,
  cuotaEnabled = true,
  actasEnabled = true,
  cuentasEnabled = true,
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
  sociosSendAvisos?: boolean;
  cosateca?: CosatecaSettings;
  cuotaEnabled?: boolean;
  actasEnabled?: boolean;
  cuentasEnabled?: boolean;
  transparency?: GroupTransparency;
  joinPolicy?: OrgJoinPolicy;
  isAyuntamiento?: boolean;
}) {
  const { t } = useT();
  const runsCuota = hasRoster && cuotaEnabled;
  const cuota = useWatch<CuotaSettings | null>(
    'groups:watchCuotaSettings',
    runsCuota ? orgId : null,
    runsCuota ? (next, error) => watchCuotaSettings(orgId, next, error) : null,
  );
  const [saving, setSaving] = useState(false);
  const save = (
    patch:
      | { sociosListVisible: boolean }
      | { chatAdminsOnly: boolean }
      | { sociosSendAvisos: boolean }
      | { socioPhoneRequired: boolean }
      | { socioEmailRequired: boolean }
      | { cosateca: CosatecaSettings }
      | { cuotaEnabled: boolean }
      | { actasEnabled: boolean }
      | { cuentasEnabled: boolean }
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
      <SettingsSection title={t('groups.settings.sections.features')} testID="group-settings-features">
        {hasRoster ? (
          <Toggle
            testID="group-settings-cuota-enabled"
            value={cuotaEnabled}
            disabled={saving}
            label={t('groups.settings.cuotaEnabled')}
            onValueChange={(next) => save({ cuotaEnabled: next })}
          />
        ) : null}
        {hasRoster ? (
          <Toggle
            testID="group-settings-actas-enabled"
            value={actasEnabled}
            disabled={saving}
            label={t('groups.settings.actasEnabled')}
            onValueChange={(next) => save({ actasEnabled: next })}
          />
        ) : null}
        {hasRoster ? (
          <Toggle
            testID="group-settings-cuentas-enabled"
            value={cuentasEnabled}
            disabled={saving}
            label={t('groups.settings.cuentasEnabled')}
            onValueChange={(next) => save({ cuentasEnabled: next })}
          />
        ) : null}
        <Toggle
          testID="group-settings-cosateca"
          value={cosateca.enabled}
          disabled={saving}
          label={t('groups.settings.cosateca')}
          onValueChange={(enabled) => save({ cosateca: { ...cosateca, enabled } })}
        />
      </SettingsSection>
      {!isAyuntamiento || hasRoster ? (
        <SettingsSection title={t('groups.settings.sections.entry')} testID="group-settings-entry">
          {!isAyuntamiento ? (
            <Toggle
              testID="group-settings-join-policy"
              value={requiresApproval}
              disabled={saving}
              label={t('organization.joinPolicy.label')}
              onValueChange={setRequiresApproval}
            />
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
          {TRANSPARENCY_VIEWS.filter((view) => (view !== 'cuota' || cuotaEnabled) && (view !== 'cuentas' || cuentasEnabled)).map((view) => (
            <Toggle
              key={view}
              testID={`group-settings-transparency-${view}`}
              value={transparency[view]}
              disabled={saving}
              label={t(`groups.transparency.settings.${view}`)}
              onValueChange={(next) => save({ transparency: { ...transparency, [view]: next } })}
            />
          ))}
        </SettingsSection>
      ) : null}
      {/* The ids predate the section's rename; the E2E flows tap them. The switch
          reads "can write", so it shows and saves the inverse of chatAdminsOnly. */}
      <SettingsSection
        title={t(hasRoster ? 'groups.settings.sections.membersCan.socios' : 'groups.settings.sections.membersCan.integrantes')}
        testID="group-settings-charla"
      >
        <Toggle
          testID="group-settings-chat-admins-only"
          value={!chatAdminsOnly}
          disabled={saving}
          label={t('groups.settings.chatMembersWrite')}
          onValueChange={(next) => save({ chatAdminsOnly: !next })}
        />
        {hasRoster ? (
          <Toggle
            testID="group-settings-socios-send-avisos"
            value={sociosSendAvisos}
            disabled={saving}
            label={t('groups.settings.sociosSendAvisos')}
            onValueChange={(next) => save({ sociosSendAvisos: next })}
          />
        ) : null}
      </SettingsSection>
      {/* How each tool works, apart from the switches that turn the tools on. */}
      {(runsCuota && cuota.data) || cosateca.enabled ? (
        <SettingsSection title={t('groups.settings.sections.tools')} testID="group-settings-cuota">
          {runsCuota && cuota.data ? (
            <Toggle
              testID="group-settings-cuota-reminders"
              value={cuota.data.remindersEnabled}
              disabled={saving}
              label={t('groups.settings.cuotaReminders')}
              onValueChange={setReminders}
            />
          ) : null}
          {cosateca.enabled ? (
            <VStack gap={2}>
              <Text>{t('groups.settings.cosatecaAudience.label')}</Text>
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
            </VStack>
          ) : null}
        </SettingsSection>
      ) : null}
    </VStack>
  );
}

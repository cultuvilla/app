import { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { buildCuotaExport } from '@cultuvilla/shared/export/cuotaExport';
import {
  computeCuotaStatuses,
  cuotaSigner,
  CUOTA_STATUSES,
  currentPeriodKey,
  periodDueDay,
  periodLabel,
  shiftPeriod,
  type CuotaStatus,
  type SocioCuotaStatus,
} from '@cultuvilla/shared/models/organization';
import {
  recordCuotaPayment,
  reverseCuotaPayment,
  saveCuotaSettings,
  setCuotaAssignment,
  watchCuotaAssignments,
  watchCuotaPeriodPayments,
  watchCuotaPeriodReminders,
  watchCuotaSettings,
  type CuotaAssignment,
  type CuotaPayment,
  type CuotaReminder,
  type CuotaSettings,
} from '@cultuvilla/shared/services/cuotaService';
import { watchOrgSocios, type Socio } from '@cultuvilla/shared/services/socioService';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { formatDate, formatDayKey } from '@cultuvilla/shared/utils';
import { Button, HStack, Pressable, Text, VStack } from '../../primitives';
import { SegmentedToggle } from '../SegmentedToggle';
import { ExportButton } from '../ExportButton';
import { CuotaSettingsSheet } from './CuotaSettingsSheet';
import { RecordPaymentSheet } from './RecordPaymentSheet';
import { CuotaAssignmentSheet } from './CuotaAssignmentSheet';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { showAlert, showConfirm } from '../../../lib/dialogs';
import { centsLabel, CUOTA_STATUS_TONE, todayKey } from '../../../lib/orgs/cuota';

type Filter = CuotaStatus | 'all';
type Sheet = { kind: 'settings' } | { kind: 'payment'; socio: Socio; status: SocioCuotaStatus } | { kind: 'assign'; socio: Socio } | null;

/**
 * The treasurer's view, in Gestionar: configure the cuota, walk the periods
 * with a status filter, record payments (and reverse a wrong one), set a
 * socio's tier or exemption, see which reminders went out, and export the
 * period as Excel or CSV.
 */
export function CuotaAdmin({
  orgId,
  orgName,
  uid,
  adminUids,
}: {
  orgId: string;
  orgName: string;
  uid: string;
  adminUids: string[];
}) {
  const { t } = useT();
  const settings = useWatch<CuotaSettings | null>('groups:watchCuotaSettings', orgId, (next, error) =>
    watchCuotaSettings(orgId, next, error),
  );
  const cuota = settings.data ?? null;
  const socios = useWatch<Socio[]>('groups:watchOrgSocios', orgId, (next, error) => watchOrgSocios(orgId, next, error));
  const assignments = useWatch<CuotaAssignment[]>(
    'groups:watchCuotaAssignments',
    cuota ? orgId : null,
    cuota ? (next, error) => watchCuotaAssignments(orgId, next, error) : null,
  );
  const [chosenPeriod, setChosenPeriod] = useState<string | null>(null);
  const current = cuota ? currentPeriodKey(cuota.periodicity) : null;
  // A period picked under another periodicity no longer exists: fall back to today's.
  const periodKey = chosenPeriod && current && chosenPeriod.length === current.length ? chosenPeriod : current;
  const payments = useWatch<CuotaPayment[]>(
    'groups:watchCuotaPeriodPayments',
    periodKey ? `${orgId}|${periodKey}` : null,
    periodKey ? (next, error) => watchCuotaPeriodPayments(orgId, periodKey, next, error) : null,
  );
  const reminders = useWatch<CuotaReminder[]>(
    'groups:watchCuotaPeriodReminders',
    periodKey ? `${orgId}|${periodKey}` : null,
    periodKey ? (next, error) => watchCuotaPeriodReminders(orgId, periodKey, next, error) : null,
  );
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);

  const rows = useMemo(() => socios.data ?? [], [socios.data]);
  const assignmentById = useMemo(() => Object.fromEntries((assignments.data ?? []).map((a) => [a.id, a])), [assignments.data]);
  const statuses = useMemo(() => {
    if (!cuota || !periodKey) return [];
    return computeCuotaStatuses({
      settings: cuota,
      periodKey,
      today: todayKey(),
      socios: rows,
      assignments: assignmentById,
      payments: payments.data ?? [],
    });
  }, [cuota, periodKey, rows, assignmentById, payments.data]);
  const socioById = useMemo(() => new Map(rows.map((s) => [s.id, s])), [rows]);
  const signer = cuotaSigner(rows, adminUids, cuota?.configuredBy ?? uid);

  const buildModel = useCallback(() => {
    // The button only renders with a cuota configured.
    if (!cuota || !periodKey) throw new Error('No cuota to export');
    return buildCuotaExport({
      orgName,
      periodKey,
      settings: cuota,
      statuses,
      socios: rows,
      assignments: assignmentById,
      payments: payments.data ?? [],
    });
  }, [orgName, periodKey, cuota, statuses, rows, assignmentById, payments.data]);

  if (settings.status !== 'ready' || socios.status !== 'ready') return null;
  const fail = () => showAlert(t('groups.cuota.error'));

  const settingsSheet = (
    <CuotaSettingsSheet
      visible={sheet?.kind === 'settings'}
      settings={cuota}
      onSave={(values) => saveCuotaSettings(orgId, values, uid)}
      onClose={() => setSheet(null)}
    />
  );

  if (!cuota || !periodKey) {
    return (
      <VStack gap={2} testID="cuota-admin">
        <Text tone="muted" variant="bodySm">
          {t('groups.cuota.admin.notConfigured')}
        </Text>
        <HStack>
          <Button testID="cuota-configure" onPress={() => setSheet({ kind: 'settings' })}>
            {t('groups.cuota.admin.configure')}
          </Button>
        </HStack>
        {settingsSheet}
      </VStack>
    );
  }

  const count = (status: CuotaStatus) => statuses.filter((s) => s.status === status).length;
  const shown = statuses
    .filter((s) => filter === 'all' || s.status === filter)
    .sort((a, b) => (socioById.get(a.socioId)?.displayName ?? '').localeCompare(socioById.get(b.socioId)?.displayName ?? ''));
  const reminderBySocio = new Map((reminders.data ?? []).map((r) => [r.socioId, r]));
  const reversed = new Set((payments.data ?? []).filter((p) => p.kind === 'reversal').map((p) => p.reversesId));
  const canGoBack = periodKey > cuota.startPeriod;

  const reverse = (p: CuotaPayment) =>
    showConfirm(
      t('groups.cuota.admin.confirmReverseTitle'),
      t('groups.cuota.admin.confirmReverseBody', { amount: centsLabel(p.amountCents) }),
      () => {
        reverseCuotaPayment(orgId, p, null, uid).catch(fail);
      },
      { confirmText: t('groups.cuota.admin.reverse'), cancelText: t('common.cancel') },
    );

  return (
    <VStack gap={2} testID="cuota-admin">
      <HStack gap={4} align="center">
        <ExportButton
          buildModel={buildModel}
          title={t('groups.cuota.admin.exportTitle')}
          body={t('groups.cuota.admin.exportBody', { count: statuses.length, period: periodLabel(periodKey) })}
          accessibilityLabel={t('groups.cuota.admin.exportTitle')}
          testID="cuota-export"
          xlsxTestID="cuota-export-xlsx"
          csvTestID="cuota-export-csv"
          scope="cuotaExport"
        />
        <Button variant="secondary" testID="cuota-edit-settings" onPress={() => setSheet({ kind: 'settings' })}>
          {t('groups.cuota.admin.editSettings')}
        </Button>
      </HStack>
      <Text variant="bodySm" tone="muted">
        {t('groups.cuota.admin.summary', {
          amount: centsLabel(cuota.amountCents),
          periodicity: t(`groups.cuota.periodicity.${cuota.periodicity}`),
          due: formatDayKey(periodDueDay(cuota, periodKey), 'dayMonth'),
        })}
      </Text>
      <Text variant="bodySm" tone="muted">
        {cuota.remindersEnabled
          ? t('groups.cuota.admin.remindersOn', { name: signer?.name ?? orgName })
          : t('groups.cuota.admin.remindersOff')}
      </Text>

      <HStack gap={4} align="center" justify="center" className="py-1">
        <Pressable
          testID="cuota-period-prev"
          accessibilityRole="button"
          accessibilityLabel={t('groups.cuota.admin.prevPeriod')}
          disabled={!canGoBack}
          onPress={() => setChosenPeriod(shiftPeriod(periodKey, -1))}
          className={canGoBack ? '' : 'opacity-30'}
        >
          <Ionicons name="chevron-back" size={iconSizes.md} color={colors.light.fg.accent} />
        </Pressable>
        <Text className="font-bold" testID="cuota-period">
          {periodLabel(periodKey)}
        </Text>
        <Pressable
          testID="cuota-period-next"
          accessibilityRole="button"
          accessibilityLabel={t('groups.cuota.admin.nextPeriod')}
          onPress={() => setChosenPeriod(shiftPeriod(periodKey, 1))}
        >
          <Ionicons name="chevron-forward" size={iconSizes.md} color={colors.light.fg.accent} />
        </Pressable>
      </HStack>

      <SegmentedToggle
        testID="cuota-filter"
        value={filter}
        options={[
          { value: 'all' as const, label: t('groups.cuota.admin.filterAll', { count: statuses.length }) },
          ...CUOTA_STATUSES.map((s) => ({
            value: s,
            label: t('groups.cuota.admin.filterStatus', { label: t(`groups.cuota.status.${s}`), count: count(s) }),
          })),
        ]}
        onChange={setFilter}
      />

      {shown.length === 0 ? (
        <Text tone="muted" variant="bodySm">
          {t('groups.cuota.admin.empty')}
        </Text>
      ) : null}

      {shown.map((s) => {
        const socio = socioById.get(s.socioId);
        if (!socio) return null;
        const reminder = reminderBySocio.get(s.socioId);
        const entries = (payments.data ?? [])
          .filter((p) => p.socioId === s.socioId)
          .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
        const detail =
          s.basis === 'household'
            ? t('groups.cuota.household', { name: socioById.get(s.householdOf ?? '')?.displayName ?? '—' })
            : s.basis === 'exempt'
              ? t('groups.cuota.exempt')
              : t('groups.cuota.paidOf', { paid: centsLabel(s.paidCents), owed: centsLabel(s.owedCents) });
        return (
          <VStack key={s.socioId} gap={1} className="py-2 border-b border-subtle" testID={`cuota-row-${s.socioId}`}>
            <HStack gap={2} align="center" justify="between">
              <Text className={socio.bajaAt ? 'font-bold text-muted' : 'font-bold'}>{socio.displayName}</Text>
              <Text variant="bodySm" tone={CUOTA_STATUS_TONE[s.status]} className="font-bold">
                {t(`groups.cuota.status.${s.status}`)}
              </Text>
            </HStack>
            <Text variant="bodySm" tone="muted">
              {detail}
            </Text>
            {reminder ? (
              <Text variant="caption" tone="muted">
                {t('groups.cuota.admin.reminderSent', { date: formatDate(reminder.sentAt) })}
              </Text>
            ) : null}
            <HStack gap={4} className="flex-wrap pt-1">
              {s.basis !== 'household' ? (
                <RowAction
                  testID={`cuota-record-${s.socioId}`}
                  label={t('groups.cuota.admin.recordPayment')}
                  onPress={() => setSheet({ kind: 'payment', socio, status: s })}
                />
              ) : null}
              <RowAction testID={`cuota-assign-${s.socioId}`} label={t('groups.cuota.admin.assign')} onPress={() => setSheet({ kind: 'assign', socio })} />
              {entries.length > 0 ? (
                <RowAction
                  testID={`cuota-history-${s.socioId}`}
                  label={t(open === s.socioId ? 'groups.cuota.admin.hideHistory' : 'groups.cuota.admin.showHistory')}
                  onPress={() => setOpen((v) => (v === s.socioId ? null : s.socioId))}
                />
              ) : null}
            </HStack>
            {open === s.socioId
              ? entries.map((p) => (
                  <HStack key={p.id} gap={2} align="center" justify="between" testID={`cuota-entry-${p.id}`}>
                    <Text variant="bodySm" tone={reversed.has(p.id) || p.kind === 'reversal' ? 'muted' : 'primary'} className="flex-1">
                      {[
                        t('groups.cuota.entryLine', {
                          period: periodLabel(p.periodKey),
                          amount: centsLabel(p.amountCents),
                          method: t(`groups.cuota.methods.${p.method}`),
                          date: formatDayKey(p.paidOn),
                        }),
                        p.kind === 'reversal' ? t('groups.cuota.reversal') : reversed.has(p.id) ? t('groups.cuota.reversed') : null,
                        p.note,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    {p.kind === 'payment' && !reversed.has(p.id) ? (
                      <RowAction testID={`cuota-reverse-${p.id}`} label={t('groups.cuota.admin.reverse')} onPress={() => reverse(p)} />
                    ) : null}
                  </HStack>
                ))
              : null}
          </VStack>
        );
      })}

      {settingsSheet}
      <RecordPaymentSheet
        visible={sheet?.kind === 'payment'}
        socioName={sheet?.kind === 'payment' ? sheet.socio.displayName : ''}
        suggestedCents={sheet?.kind === 'payment' ? Math.max(0, sheet.status.owedCents - sheet.status.paidCents) : 0}
        onSave={async (values) => {
          if (sheet?.kind !== 'payment') return;
          await recordCuotaPayment(orgId, { socioId: sheet.socio.id, periodKey, ...values }, uid);
        }}
        onClose={() => setSheet(null)}
      />
      <CuotaAssignmentSheet
        visible={sheet?.kind === 'assign'}
        socioName={sheet?.kind === 'assign' ? sheet.socio.displayName : ''}
        settings={cuota}
        assignment={sheet?.kind === 'assign' ? assignmentById[sheet.socio.id] : undefined}
        onSave={async (values) => {
          if (sheet?.kind !== 'assign') return;
          await setCuotaAssignment(orgId, sheet.socio.id, values, uid);
        }}
        onClose={() => setSheet(null)}
      />
    </VStack>
  );
}

function RowAction({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress}>
      <Text variant="bodySm" className="text-accent font-medium">
        {label}
      </Text>
    </Pressable>
  );
}

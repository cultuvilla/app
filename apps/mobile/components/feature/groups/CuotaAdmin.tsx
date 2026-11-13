import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { observability } from '@cultuvilla/shared';
import { buildCuotaExport } from '@cultuvilla/shared/export/cuotaExport';
import {
  computeCuotaStatuses,
  cuotaPriceFor,
  cuotaSigner,
  currentPeriodKey,
  periodDueDay,
  periodLabel,
  shiftPeriod,
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
import { formatDayKey } from '@cultuvilla/shared/utils';
import { Button, HStack, Input, Pressable, Text, VStack } from '../../primitives';
import { CuotaCashDesk, type DeskSocio } from './CuotaCashDesk';
import { CuotaSettingsSheet } from './CuotaSettingsSheet';
import { CuotaSocioSheet } from './CuotaSocioSheet';
import { OptionsSheet } from './OptionsSheet';
import { RecordPaymentSheet } from './RecordPaymentSheet';
import { CuotaAssignmentSheet } from './CuotaAssignmentSheet';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { showAlert, showConfirm } from '../../../lib/dialogs';
import { runExport, type ExportFormat } from '../../../lib/export/runExport';
import { centsLabel, CUOTA_STATUS_TONE, todayKey } from '../../../lib/orgs/cuota';
import {
  COLLECTION_FILTERS,
  inCollectionFilter,
  matchesSocio,
  summarizeCollection,
  type CollectionFilter,
} from '../../../lib/orgs/cuotaCollection';

type Sheet =
  | { kind: 'settings' }
  | { kind: 'menu' }
  | { kind: 'desk' }
  | { kind: 'socio'; socio: Socio }
  | { kind: 'payment'; socio: Socio; status: SocioCuotaStatus; quick: boolean }
  | { kind: 'assign'; socio: Socio }
  | null;

/**
 * The treasurer's collection list: collected vs total for the period, the
 * socios by chip and search, and "✓ Pagó" on each who owes, which asks only how
 * they paid. A row opens the socio's record (other amount, tier, payments and
 * "Anular"). Settings, export and reminders sit behind "⋯", and "Cobrar en la
 * mesa" opens the cash desk for the asamblea.
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
  const [filter, setFilter] = useState<CollectionFilter>('pending');
  const [query, setQuery] = useState('');
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
    // The menu only shows with a cuota configured.
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

  // First child of both branches below, so the save's own snapshot (which
  // switches to the configured branch before the write resolves) keeps this
  // modal mounted. Remounted, it re-presented over the old one and iOS never
  // dismissed it (e2e flow 13).
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
      <>
        {settingsSheet}
        <VStack gap={2} testID="cuota-admin">
          <Text tone="muted" variant="bodySm">
            {t('groups.cuota.admin.notConfigured')}
          </Text>
          <HStack>
            <Button testID="cuota-configure" onPress={() => setSheet({ kind: 'settings' })}>
              {t('groups.cuota.admin.configure')}
            </Button>
          </HStack>
        </VStack>
      </>
    );
  }

  const summary = summarizeCollection(statuses);
  const progress = summary.totalCents > 0 ? Math.min(1, summary.collectedCents / summary.totalCents) : 0;
  const count = (f: CollectionFilter) => statuses.filter((s) => inCollectionFilter(s, f)).length;
  const nameOf = (id: string) => socioById.get(id)?.displayName ?? '';
  const shown = statuses
    .filter((s) => inCollectionFilter(s, filter))
    .filter((s) => matchesSocio(query, nameOf(s.socioId), socioById.get(s.socioId)?.socioNumber ?? null))
    .sort((a, b) => nameOf(a.socioId).localeCompare(nameOf(b.socioId)));
  const reminderBySocio = new Map((reminders.data ?? []).map((r) => [r.socioId, r]));
  const reversed = new Set((payments.data ?? []).filter((p) => p.kind === 'reversal').map((p) => p.reversesId));
  const canGoBack = periodKey > cuota.startPeriod;
  const statusById = new Map(statuses.map((s) => [s.socioId, s]));

  const detailOf = (s: SocioCuotaStatus) =>
    s.basis === 'household'
      ? t('groups.cuota.household', { name: socioById.get(s.householdOf ?? '')?.displayName ?? '—' })
      : s.basis === 'exempt'
        ? t('groups.cuota.exempt')
        : s.basis === 'paid' || s.paidCents === 0
          ? centsLabel(s.basis === 'paid' ? s.paidCents : s.owedCents)
          : t('groups.cuota.paidOf', { paid: centsLabel(s.paidCents), owed: centsLabel(s.owedCents) });

  const reverse = (p: CuotaPayment) =>
    showConfirm(
      t('groups.cuota.admin.confirmReverseTitle'),
      t('groups.cuota.admin.confirmReverseBody', { amount: centsLabel(p.amountCents) }),
      () => {
        reverseCuotaPayment(orgId, p, null, uid).catch(fail);
      },
      { confirmText: t('groups.cuota.admin.reverse'), cancelText: t('common.cancel') },
    );

  const exportAs = (format: ExportFormat) => {
    runExport(buildModel(), format).catch((error: unknown) => {
      observability.captureError(error, { scope: 'cuotaExport', format });
      showAlert(t('event.export.error'));
    });
  };

  const pickMenu = (key: string) => {
    setSheet(null);
    if (key === 'settings') setSheet({ kind: 'settings' });
    else if (key === 'export-xlsx') exportAs('xlsx');
    else if (key === 'export-csv') exportAs('csv');
    else if (key === 'reminders') {
      saveCuotaSettings(orgId, { ...cuota, remindersEnabled: !cuota.remindersEnabled }, uid).catch(fail);
    }
  };

  const deskSocios: DeskSocio[] = statuses.flatMap((s) => {
    const socio = socioById.get(s.socioId);
    if (!socio || (s.basis !== 'unpaid' && s.basis !== 'paid')) return [];
    return [{ id: s.socioId, name: socio.displayName, socioNumber: socio.socioNumber, status: s }];
  });

  const socioSheet = sheet?.kind === 'socio' ? sheet : null;
  const socioSheetStatus = socioSheet ? statusById.get(socioSheet.socio.id) ?? null : null;

  return (
    <>
      {settingsSheet}
      <VStack gap={3} testID="cuota-admin">
        <HStack gap={2} align="center">
          <Pressable
            testID="cuota-period-prev"
            accessibilityRole="button"
            accessibilityLabel={t('groups.cuota.admin.prevPeriod')}
            disabled={!canGoBack}
            hitSlop={8}
            onPress={() => setChosenPeriod(shiftPeriod(periodKey, -1))}
            className={canGoBack ? '' : 'opacity-30'}
          >
            <Ionicons name="chevron-back" size={iconSizes.md} color={colors.light.fg.accent} />
          </Pressable>
          <Text variant="h3" className="font-bold" testID="cuota-period">
            {t('groups.cuota.periodTitle', { period: periodLabel(periodKey) })}
          </Text>
          <Pressable
            testID="cuota-period-next"
            accessibilityRole="button"
            accessibilityLabel={t('groups.cuota.admin.nextPeriod')}
            hitSlop={8}
            onPress={() => setChosenPeriod(shiftPeriod(periodKey, 1))}
          >
            <Ionicons name="chevron-forward" size={iconSizes.md} color={colors.light.fg.accent} />
          </Pressable>
          <View className="flex-1" />
          <Pressable
            testID="cuota-more"
            accessibilityRole="button"
            accessibilityLabel={t('groups.cuota.admin.more')}
            hitSlop={8}
            onPress={() => setSheet({ kind: 'menu' })}
          >
            <Ionicons name="ellipsis-horizontal" size={iconSizes.md} color={colors.light.fg.primary} />
          </Pressable>
        </HStack>

        <VStack gap={2} className="rounded-lg bg-surface-elevated border border-subtle p-4" testID="cuota-summary">
          <HStack gap={2} align="center" justify="between">
            <VStack className="flex-1">
              <Text variant="h1" className="font-bold" testID="cuota-collected">
                {centsLabel(summary.collectedCents)}
              </Text>
              <Text variant="bodySm" tone="muted">
                {t('groups.cuota.admin.ofTotal', { total: centsLabel(summary.totalCents) })}
              </Text>
            </VStack>
            <VStack className="items-end">
              <Text variant="h3" className="font-bold" testID="cuota-paid-count">
                {summary.paid}
              </Text>
              <Text variant="bodySm" tone="muted">
                {t('groups.cuota.admin.ofPaid', { count: summary.payers })}
              </Text>
            </VStack>
          </HStack>
          <View className="h-2 rounded-full bg-subtle overflow-hidden" testID="cuota-progress">
            <View className="h-full rounded-full bg-accent" style={{ width: `${Math.round(progress * 100)}%` }} />
          </View>
          <Text variant="caption" tone="muted">
            {t('groups.cuota.admin.summary', {
              amount: centsLabel(cuotaPriceFor(cuota, periodKey)),
              periodicity: t(`groups.cuota.periodicity.${cuota.periodicity}`),
              due: formatDayKey(periodDueDay(cuota, periodKey), 'dayMonth'),
            })}
          </Text>
        </VStack>

        <Button testID="cuota-desk-open" variant="secondary" fullWidth onPress={() => setSheet({ kind: 'desk' })}>
          {t('groups.cuota.desk.title')}
        </Button>

        <Input
          value={query}
          onChangeText={setQuery}
          placeholder={t('groups.cuota.admin.search')}
          autoCorrect={false}
          dense
          testID="cuota-search"
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" testID="cuota-filter">
          {COLLECTION_FILTERS.map((f) => {
            const chosen = f === filter;
            return (
              <Pressable
                key={f}
                testID={`cuota-filter-${f}`}
                accessibilityRole="button"
                accessibilityState={{ selected: chosen }}
                onPress={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full border ${chosen ? 'bg-accent border-accent' : 'bg-surface border-subtle'}`}
              >
                <Text variant="bodySm" tone={chosen ? 'onAccent' : 'primary'} className={chosen ? 'font-bold' : ''}>
                  {t(`groups.cuota.admin.filters.${f}`, { count: count(f) })}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {shown.length === 0 ? (
          <Text tone="muted" variant="bodySm" className="py-4 text-center" testID="cuota-empty">
            {t('groups.cuota.admin.empty')}
          </Text>
        ) : (
          <VStack className="rounded-lg bg-surface-elevated border border-subtle">
            {shown.map((s, i) => {
              const socio = socioById.get(s.socioId);
              if (!socio) return null;
              const partial = s.basis === 'unpaid' && s.paidCents > 0;
              return (
                <Pressable
                  key={s.socioId}
                  testID={`cuota-row-${s.socioId}`}
                  accessibilityRole="button"
                  onPress={() => setSheet({ kind: 'socio', socio })}
                  className={`px-3 py-2.5 ${i > 0 ? 'border-t border-subtle' : ''}`}
                >
                  <HStack gap={2} align="center">
                    <Text variant="bodySm" tone="muted" className="w-8 text-right">
                      {socio.socioNumber ?? ''}
                    </Text>
                    <VStack className="flex-1">
                      <Text className={socio.bajaAt ? 'text-muted' : ''}>{socio.displayName}</Text>
                      <Text variant="bodySm" tone={s.basis === 'unpaid' && s.status === 'vencida' ? 'danger' : 'muted'}>
                        {s.basis === 'unpaid' && s.status === 'vencida'
                          ? `${t('groups.cuota.status.vencida')} · ${detailOf(s)}`
                          : detailOf(s)}
                      </Text>
                    </VStack>
                    {s.basis === 'unpaid' ? (
                      <Pressable
                        testID={`cuota-record-${s.socioId}`}
                        accessibilityRole="button"
                        accessibilityLabel={partial ? t('groups.cuota.admin.payRest') : t('groups.cuota.admin.paid')}
                        hitSlop={6}
                        onPress={() => setSheet({ kind: 'payment', socio, status: s, quick: true })}
                        className={`flex-row items-center gap-1 rounded-full px-3 py-1.5 ${partial ? 'border border-accent' : 'bg-accent'}`}
                      >
                        <Ionicons
                          name={partial ? 'add' : 'checkmark'}
                          size={iconSizes.sm}
                          color={partial ? colors.light.fg.accent : colors.light.fg['on-accent']}
                        />
                        {partial ? null : (
                          <Text variant="bodySm" tone="onAccent" className="font-bold">
                            {t('groups.cuota.admin.paid')}
                          </Text>
                        )}
                      </Pressable>
                    ) : s.basis === 'paid' ? (
                      <Text variant="bodySm" tone={CUOTA_STATUS_TONE[s.status]} className="font-bold">
                        {t('groups.cuota.status.al_dia')}
                      </Text>
                    ) : null}
                  </HStack>
                </Pressable>
              );
            })}
          </VStack>
        )}

        <OptionsSheet
          visible={sheet?.kind === 'menu'}
          title={t('groups.cuota.title')}
          testID="cuota-menu"
          options={[
            { key: 'settings', label: t('groups.cuota.admin.menu.settings') },
            { key: 'export-xlsx', label: t('groups.cuota.admin.menu.exportXlsx') },
            { key: 'export-csv', label: t('groups.cuota.admin.menu.exportCsv') },
            {
              key: 'reminders',
              label: t(cuota.remindersEnabled ? 'groups.cuota.admin.menu.remindersOff' : 'groups.cuota.admin.menu.remindersOn'),
              description: cuota.remindersEnabled ? t('groups.cuota.admin.remindersOn', { name: signer?.name ?? orgName }) : undefined,
            },
          ]}
          onPick={pickMenu}
          onClose={() => setSheet(null)}
        />
        <CuotaSocioSheet
          visible={socioSheet !== null}
          name={socioSheet?.socio.displayName ?? ''}
          status={socioSheetStatus}
          detail={socioSheetStatus ? detailOf(socioSheetStatus) : ''}
          reminderSentAt={socioSheet ? reminderBySocio.get(socioSheet.socio.id)?.sentAt ?? null : null}
          entries={
            socioSheet
              ? (payments.data ?? [])
                  .filter((p) => p.socioId === socioSheet.socio.id)
                  .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
              : []
          }
          reversed={reversed}
          onRecord={() => {
            if (socioSheet && socioSheetStatus) setSheet({ kind: 'payment', socio: socioSheet.socio, status: socioSheetStatus, quick: false });
          }}
          onAssign={() => {
            if (socioSheet) setSheet({ kind: 'assign', socio: socioSheet.socio });
          }}
          onReverse={reverse}
          onClose={() => setSheet(null)}
        />
        <CuotaCashDesk
          visible={sheet?.kind === 'desk'}
          socios={deskSocios}
          onRecord={async (socioId, amountCents, method) => {
            await recordCuotaPayment(orgId, { socioId, periodKey, amountCents, method, paidOn: todayKey(), note: '' }, uid);
          }}
          onClose={() => setSheet(null)}
        />
        <RecordPaymentSheet
          visible={sheet?.kind === 'payment'}
          socioName={sheet?.kind === 'payment' ? sheet.socio.displayName : ''}
          suggestedCents={sheet?.kind === 'payment' ? Math.max(0, sheet.status.owedCents - sheet.status.paidCents) : 0}
          quick={sheet?.kind === 'payment' && sheet.quick}
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
          periodKey={periodKey}
          assignment={sheet?.kind === 'assign' ? assignmentById[sheet.socio.id] : undefined}
          onSave={async (values) => {
            if (sheet?.kind !== 'assign') return;
            await setCuotaAssignment(orgId, sheet.socio.id, values, uid);
          }}
          onClose={() => setSheet(null)}
        />
      </VStack>
    </>
  );
}

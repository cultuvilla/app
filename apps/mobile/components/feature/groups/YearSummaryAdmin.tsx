import { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { buildYearSummaryExport } from '@cultuvilla/shared/export/recordsExport';
import { buildYearSummary, periodLabel } from '@cultuvilla/shared/models/organization';
import { watchCuotaPaymentsForYear, type CuotaPayment } from '@cultuvilla/shared/services/cuotaService';
import {
  recordLedgerEntry,
  reverseLedgerEntry,
  watchLedgerEntriesForYear,
  type LedgerEntry,
} from '@cultuvilla/shared/services/recordsService';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { formatDayKey } from '@cultuvilla/shared/utils';
import { Button, Card, HStack, Pressable, Text, VStack } from '../../primitives';
import { ExportButton } from '../ExportButton';
import { LedgerEntrySheet } from './LedgerEntrySheet';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { showAlert, showConfirm } from '../../../lib/dialogs';
import { centsLabel, todayKey } from '../../../lib/orgs/cuota';

/**
 * The year's money for the asamblea, in Gestionar: cuota income (from the cuota
 * ledger, net of anulaciones), other income and expenses the treasurer notes
 * here, the balance, and the export. A summary, not bookkeeping.
 */
export function YearSummaryAdmin({ orgId, orgName, uid }: { orgId: string; orgName: string; uid: string }) {
  const { t } = useT();
  const thisYear = todayKey().slice(0, 4);
  const [year, setYear] = useState(thisYear);
  const [adding, setAdding] = useState(false);
  const cuota = useWatch<CuotaPayment[]>('groups:watchCuotaPaymentsForYear', `${orgId}|${year}`, (next, error) =>
    watchCuotaPaymentsForYear(orgId, year, next, error),
  );
  const ledger = useWatch<LedgerEntry[]>('groups:watchLedgerEntriesForYear', `${orgId}|${year}`, (next, error) =>
    watchLedgerEntriesForYear(orgId, year, next, error),
  );
  const summary = useMemo(
    () => buildYearSummary({ year, cuotaPayments: cuota.data ?? [], ledgerEntries: ledger.data ?? [] }),
    [year, cuota.data, ledger.data],
  );
  const buildModel = useCallback(() => buildYearSummaryExport({ orgName, summary }), [orgName, summary]);

  const shiftYear = (by: number) => setYear((y) => String(Number(y) + by));
  const reverse = (entry: LedgerEntry) =>
    showConfirm(
      t('groups.records.year.confirmReverseTitle'),
      t('groups.records.year.confirmReverseBody', { amount: centsLabel(entry.amountCents) }),
      () => {
        reverseLedgerEntry(orgId, entry, uid).catch(() => showAlert(t('groups.records.error')));
      },
      { confirmText: t('groups.records.year.reverse'), cancelText: t('common.cancel') },
    );

  const canGoForward = year < thisYear;

  return (
    <VStack gap={2} testID="year-summary">
      <HStack justify="between" align="center">
        <Text className="font-bold">{t('groups.records.year.title')}</Text>
        <ExportButton
          buildModel={buildModel}
          title={t('groups.records.year.exportTitle')}
          body={t('groups.records.year.exportBody', { year })}
          accessibilityLabel={t('groups.records.year.exportTitle')}
          testID="year-export"
          xlsxTestID="year-export-xlsx"
          csvTestID="year-export-csv"
          scope="yearSummaryExport"
        />
      </HStack>

      <HStack gap={4} align="center" justify="center" className="py-1">
        <Pressable testID="year-prev" accessibilityRole="button" accessibilityLabel={t('groups.records.year.prev')} onPress={() => shiftYear(-1)}>
          <Ionicons name="chevron-back" size={iconSizes.md} color={colors.light.fg.accent} />
        </Pressable>
        <Text className="font-bold" testID="year-label">
          {year}
        </Text>
        <Pressable
          testID="year-next"
          accessibilityRole="button"
          accessibilityLabel={t('groups.records.year.next')}
          disabled={!canGoForward}
          onPress={() => shiftYear(1)}
          className={canGoForward ? '' : 'opacity-30'}
        >
          <Ionicons name="chevron-forward" size={iconSizes.md} color={colors.light.fg.accent} />
        </Pressable>
      </HStack>

      {cuota.status === 'ready' && ledger.status === 'ready' ? (
        <>
          <Card testID="year-totals">
            <VStack gap={1}>
              <TotalLine label={t('groups.records.year.cuotas')} cents={summary.cuotaCents} />
              {summary.cuotaByPeriod.map((p) => (
                <Text key={p.periodKey} variant="caption" tone="muted">
                  {t('groups.records.year.cuotaPeriod', { period: periodLabel(p.periodKey), amount: centsLabel(p.cents) })}
                </Text>
              ))}
              <TotalLine label={t('groups.records.year.otherIncome')} cents={summary.otherIncomeCents} />
              <TotalLine label={t('groups.records.year.income')} cents={summary.incomeCents} bold />
              <TotalLine label={t('groups.records.year.expenses')} cents={summary.expenseCents} bold />
              <TotalLine label={t('groups.records.year.balance')} cents={summary.balanceCents} bold testID="year-balance" />
            </VStack>
          </Card>

          <HStack justify="between" align="center" className="pt-1">
            <Text className="font-bold">{t('groups.records.year.entries')}</Text>
            <Button size="md" variant="secondary" onPress={() => setAdding(true)} testID="ledger-add">
              {t('groups.records.year.add')}
            </Button>
          </HStack>
          {summary.entries.length === 0 ? (
            <Text variant="bodySm" tone="muted">
              {t('groups.records.year.noEntries')}
            </Text>
          ) : (
            summary.entries.map(({ entry, reversed }) => (
              <HStack key={entry.id} gap={2} align="center" justify="between" className="py-1 border-b border-subtle" testID={`ledger-entry-${entry.id}`}>
                <VStack className="flex-1">
                  <Text className={reversed ? 'text-muted' : ''}>{entry.concept}</Text>
                  <Text variant="caption" tone="muted">
                    {[
                      formatDayKey(entry.on),
                      t(`groups.records.year.form.kind.${entry.kind}`),
                      entry.category ?? t('groups.records.year.noCategory'),
                      reversed ? t('groups.records.year.reversed') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </VStack>
                <Text tone={reversed ? 'muted' : entry.kind === 'expense' ? 'danger' : 'success'} className="font-bold">
                  {`${entry.kind === 'expense' ? '−' : '+'}${centsLabel(entry.amountCents)}`}
                </Text>
                {!reversed ? (
                  <Pressable testID={`ledger-reverse-${entry.id}`} accessibilityRole="button" onPress={() => reverse(entry)}>
                    <Text variant="bodySm" className="text-accent font-medium">
                      {t('groups.records.year.reverse')}
                    </Text>
                  </Pressable>
                ) : null}
              </HStack>
            ))
          )}
          <Text variant="caption" tone="muted">
            {t('groups.records.year.eventsNote')}
          </Text>
        </>
      ) : null}

      <LedgerEntrySheet
        visible={adding}
        onSave={async (values) => {
          await recordLedgerEntry(orgId, values, uid);
        }}
        onClose={() => setAdding(false)}
      />
    </VStack>
  );
}

function TotalLine({ label, cents, bold = false, testID }: { label: string; cents: number; bold?: boolean; testID?: string }) {
  return (
    <HStack justify="between" align="center" testID={testID}>
      <Text className={bold ? 'font-bold' : ''}>{label}</Text>
      <Text className={bold ? 'font-bold' : ''}>{centsLabel(cents)}</Text>
    </HStack>
  );
}

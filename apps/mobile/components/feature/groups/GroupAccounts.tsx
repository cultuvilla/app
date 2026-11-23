import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { buildYearSummary, periodLabel } from '@cultuvilla/shared/models/organization';
import { fetchTransparentCuotaIncome } from '@cultuvilla/shared/services/groupTransparencyService';
import { watchLedgerEntriesForYear, type LedgerEntry } from '@cultuvilla/shared/services/recordsService';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { formatDayKey } from '@cultuvilla/shared/utils';
import { Card, HStack, Pressable, Text, VStack } from '../../primitives';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { centsLabel, todayKey } from '../../../lib/orgs/cuota';
import { useGroupTransparency } from '../../../lib/orgs/useGroupTransparency';

function TotalLine({ label, cents, bold, testID }: { label: string; cents: number; bold?: boolean; testID?: string }) {
  return (
    <HStack justify="between" align="center">
      <Text className={bold ? 'font-bold' : ''}>{label}</Text>
      <Text className={bold ? 'font-bold' : ''} testID={testID}>
        {centsLabel(cents)}
      </Text>
    </HStack>
  );
}

/**
 * "Cuentas públicas": a socio's read-only view of the year's accounts — the
 * cuota's income as totals per period (from the callable, which never sends
 * one socio's payment), the ledger the junta keeps (readable by the rules
 * while the switch is on), and the balance. The junta's own copy, with the
 * export and the entries' editing, is the Registros' Cuentas door.
 */
export function GroupAccounts({ orgId }: { orgId: string }) {
  const { t } = useT();
  const thisYear = todayKey().slice(0, 4);
  const [year, setYear] = useState(thisYear);
  const ledger = useWatch<LedgerEntry[]>('groups:watchLedgerEntriesForYear', `${orgId}|${year}`, (next, error) =>
    watchLedgerEntriesForYear(orgId, year, next, error),
  );
  const income = useGroupTransparency(`cuentas|${orgId}|${year}`, () => fetchTransparentCuotaIncome(orgId, year));
  const summary = useMemo(() => buildYearSummary({ year, cuotaPayments: [], ledgerEntries: ledger.data ?? [] }), [year, ledger.data]);

  const shiftYear = (by: number) => setYear((y) => String(Number(y) + by));
  const canGoForward = year < thisYear;
  const failed = ledger.status === 'error' || income.status === 'error';
  const cuotaCents = income.status === 'ready' ? income.data.cuotaCents : 0;
  const incomeCents = cuotaCents + summary.otherIncomeCents;

  return (
    <VStack gap={2} testID="group-accounts">
      <HStack gap={4} align="center" className="py-1">
        <Pressable testID="group-accounts-prev" accessibilityRole="button" accessibilityLabel={t('groups.transparency.cuentas.prev')} onPress={() => shiftYear(-1)}>
          <Ionicons name="chevron-back" size={iconSizes.md} color={colors.light.fg.accent} />
        </Pressable>
        <Text className="font-bold" testID="group-accounts-year">
          {year}
        </Text>
        <Pressable
          testID="group-accounts-next"
          accessibilityRole="button"
          accessibilityLabel={t('groups.transparency.cuentas.next')}
          disabled={!canGoForward}
          onPress={() => shiftYear(1)}
          className={canGoForward ? '' : 'opacity-30'}
        >
          <Ionicons name="chevron-forward" size={iconSizes.md} color={colors.light.fg.accent} />
        </Pressable>
      </HStack>

      {failed ? (
        <Text tone="muted" variant="bodySm" testID="group-accounts-error">
          {t('groups.transparency.error')}
        </Text>
      ) : ledger.status === 'ready' && income.status === 'ready' ? (
        <>
          <Card testID="group-accounts-totals">
            <VStack gap={1}>
              <TotalLine label={t('groups.transparency.cuentas.cuotas')} cents={cuotaCents} />
              {income.data.cuotaByPeriod.map((p) => (
                <Text key={p.periodKey} variant="caption" tone="muted">
                  {t('groups.transparency.cuentas.cuotaPeriod', { period: periodLabel(p.periodKey), amount: centsLabel(p.cents) })}
                </Text>
              ))}
              <TotalLine label={t('groups.transparency.cuentas.otherIncome')} cents={summary.otherIncomeCents} />
              <TotalLine label={t('groups.transparency.cuentas.income')} cents={incomeCents} bold />
              <TotalLine label={t('groups.transparency.cuentas.expenses')} cents={summary.expenseCents} bold />
              <TotalLine
                label={t('groups.transparency.cuentas.balance')}
                cents={incomeCents - summary.expenseCents}
                bold
                testID="group-accounts-balance"
              />
            </VStack>
          </Card>

          <Text className="font-bold pt-1">{t('groups.transparency.cuentas.entries')}</Text>
          {summary.entries.length === 0 ? (
            <Text variant="bodySm" tone="muted">
              {t('groups.transparency.cuentas.noEntries')}
            </Text>
          ) : (
            summary.entries.map(({ entry, reversed }) => (
              <HStack key={entry.id} gap={2} align="center" justify="between" className="py-1 border-b border-subtle" testID={`group-accounts-entry-${entry.id}`}>
                <VStack className="flex-1">
                  <Text className={reversed ? 'text-muted' : ''}>{entry.concept}</Text>
                  <Text variant="caption" tone="muted">
                    {[formatDayKey(entry.on), entry.category, reversed ? t('groups.transparency.cuentas.reversed') : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </VStack>
                <Text tone={reversed ? 'muted' : entry.kind === 'expense' ? 'danger' : 'success'} className="font-bold">
                  {`${entry.kind === 'expense' ? '−' : '+'}${centsLabel(entry.amountCents)}`}
                </Text>
              </HStack>
            ))
          )}
        </>
      ) : null}
    </VStack>
  );
}

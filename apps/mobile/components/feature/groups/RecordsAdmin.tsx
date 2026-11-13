import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { buildYearSummary, compareActas, isActiveSocio } from '@cultuvilla/shared/models/organization';
import { watchCuotaPaymentsForYear, type CuotaPayment } from '@cultuvilla/shared/services/cuotaService';
import { watchActas, watchLedgerEntriesForYear, type Acta, type LedgerEntry } from '@cultuvilla/shared/services/recordsService';
import { watchOrgSocios, type Socio } from '@cultuvilla/shared/services/socioService';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { formatDayKey, type RecordsDoor } from '@cultuvilla/shared/utils';
import { HStack, Pressable, Text, VStack } from '../../primitives';
import { AsambleaChecklist } from './AsambleaChecklist';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { groupRecordsHref } from '../../../lib/navigation/routes';
import { centsLabel, todayKey } from '../../../lib/orgs/cuota';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * "Registros" for groups with a socio roster: the association's folder. Ahead
 * of an asamblea, what is missing for it; then three doors — the libro de
 * socios, the actas and the accounts — each to its own screen.
 */
export function RecordsAdmin({ orgId, orgName }: { orgId: string; orgName: string }) {
  const { t } = useT();
  const year = todayKey().slice(0, 4);
  const socios = useWatch<Socio[]>('groups:watchOrgSocios', orgId, (next, error) => watchOrgSocios(orgId, next, error));
  const actas = useWatch<Acta[]>('groups:watchActas', orgId, (next, error) => watchActas(orgId, next, error));
  const cuota = useWatch<CuotaPayment[]>('groups:watchCuotaPaymentsForYear', `${orgId}|${year}`, (next, error) =>
    watchCuotaPaymentsForYear(orgId, year, next, error),
  );
  const ledger = useWatch<LedgerEntry[]>('groups:watchLedgerEntriesForYear', `${orgId}|${year}`, (next, error) =>
    watchLedgerEntriesForYear(orgId, year, next, error),
  );

  const libro = useMemo(() => {
    if (socios.status !== 'ready') return null;
    const rows = socios.data ?? [];
    const active = rows.filter(isActiveSocio).length;
    return rows.length === 0 ? t('groups.records.libro.empty') : t('groups.records.libro.summary', { active, bajas: rows.length - active });
  }, [socios.status, socios.data, t]);

  const lastActa = useMemo(() => {
    if (actas.status !== 'ready') return null;
    const latest = [...(actas.data ?? [])].sort(compareActas)[0];
    if (!latest) return t('groups.records.actas.empty');
    const heading = latest.title ?? t(`groups.records.actas.body.${latest.body}`);
    return t('groups.records.doors.lastActa', { heading, date: formatDayKey(latest.heldOn) });
  }, [actas.status, actas.data, t]);

  const balance = useMemo(() => {
    if (cuota.status !== 'ready' || ledger.status !== 'ready') return null;
    const summary = buildYearSummary({ year, cuotaPayments: cuota.data ?? [], ledgerEntries: ledger.data ?? [] });
    return t('groups.records.doors.balance', { amount: centsLabel(summary.balanceCents) });
  }, [year, cuota.status, cuota.data, ledger.status, ledger.data, t]);

  return (
    <VStack gap={3} testID="records-admin">
      <AsambleaChecklist orgId={orgId} orgName={orgName} />
      <Door door="libro" orgId={orgId} icon="book-outline" title={t('groups.records.doors.libro')} summary={libro} />
      <Door door="actas" orgId={orgId} icon="document-text-outline" title={t('groups.records.doors.actas')} summary={lastActa} />
      <Door
        door="cuentas"
        orgId={orgId}
        icon="wallet-outline"
        title={t('groups.records.doors.cuentasYear', { year })}
        summary={balance}
      />
    </VStack>
  );
}

function Door({
  door,
  orgId,
  icon,
  title,
  summary,
}: {
  door: RecordsDoor;
  orgId: string;
  icon: IconName;
  title: string;
  summary: string | null;
}) {
  return (
    <Pressable
      testID={`records-door-${door}`}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => router.push(groupRecordsHref(orgId, door))}
      className="rounded-lg p-4 bg-surface-elevated shadow-sm"
    >
      <HStack gap={3} align="center">
        <VStack className="h-12 w-12 rounded-md bg-subtle items-center justify-center">
          <Ionicons name={icon} size={iconSizes.lg} color={colors.light.fg.accent} />
        </VStack>
        <VStack className="flex-1" gap={1}>
          <Text className="font-bold">{title}</Text>
          {summary ? (
            <Text variant="bodySm" tone="muted" numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
        </VStack>
        <Ionicons name="chevron-forward" size={iconSizes.sm} color={colors.light.fg.muted} />
      </HStack>
    </Pressable>
  );
}

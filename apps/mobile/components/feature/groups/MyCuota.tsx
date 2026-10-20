import { useMemo } from 'react';
import {
  computeCuotaStatuses,
  cuotaConcept,
  currentPeriodKey,
  isActiveSocio,
  periodLabel,
  type SocioCuotaStatus,
} from '@cultuvilla/shared/models/organization';
import {
  watchCuotaAssignmentsOf,
  watchCuotaSettings,
  watchSocioCuotaPayments,
  type CuotaAssignment,
  type CuotaPayment,
  type CuotaSettings,
} from '@cultuvilla/shared/services/cuotaService';
import { watchMySocios, type Socio } from '@cultuvilla/shared/services/socioService';
import { formatDayKey } from '@cultuvilla/shared/utils';
import { Card, HStack, Text, VStack } from '../../primitives';
import { DetailSectionHeading } from '../DetailSectionHeading';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { centsLabel, CUOTA_STATUS_TONE, todayKey } from '../../../lib/orgs/cuota';

/**
 * A member's cuota: the status of their own row and of the personas a cargo
 * they answer for, how to pay, and every entry the treasurer recorded. Hidden
 * until an admin configures the cuota.
 */
export function MyCuota({ orgId, uid }: { orgId: string; uid: string }) {
  const { t } = useT();
  const settings = useWatch<CuotaSettings | null>('groups:watchCuotaSettings', orgId, (next, error) =>
    watchCuotaSettings(orgId, next, error),
  );
  const mine = useWatch<Socio[]>('groups:watchMySocios', `${orgId}|${uid}`, (next, error) =>
    watchMySocios(orgId, uid, next, error),
  );
  const rows = useMemo(() => (mine.data ?? []).filter(isActiveSocio), [mine.data]);
  const ids = useMemo(() => rows.map((r) => r.id).sort(), [rows]);
  const idsKey = ids.join(',');
  const assignments = useWatch<CuotaAssignment[]>(
    'groups:watchCuotaAssignmentsOf',
    settings.data && ids.length > 0 ? `${orgId}|${idsKey}` : null,
    settings.data && ids.length > 0 ? (next, error) => watchCuotaAssignmentsOf(orgId, ids, next, error) : null,
  );
  const payments = useWatch<CuotaPayment[]>(
    'groups:watchSocioCuotaPayments',
    settings.data && ids.length > 0 ? `${orgId}|${idsKey}` : null,
    settings.data && ids.length > 0 ? (next, error) => watchSocioCuotaPayments(orgId, ids, next, error) : null,
  );

  const cuota = settings.data;
  const periodKey = cuota ? currentPeriodKey(cuota.periodicity) : null;
  const statuses = useMemo<SocioCuotaStatus[]>(() => {
    if (!cuota || !periodKey) return [];
    return computeCuotaStatuses({
      settings: cuota,
      periodKey,
      today: todayKey(),
      socios: rows,
      assignments: Object.fromEntries((assignments.data ?? []).map((a) => [a.id, a])),
      payments: payments.data ?? [],
    });
  }, [cuota, periodKey, rows, assignments.data, payments.data]);

  if (!cuota || !periodKey || rows.length === 0 || payments.status !== 'ready') return null;

  const nameOf = (socioId: string | null) => rows.find((r) => r.id === socioId)?.displayName ?? '';
  const own = rows.find((r) => r.kind === 'member') ?? rows[0];
  const reversed = new Set((payments.data ?? []).filter((p) => p.kind === 'reversal').map((p) => p.reversesId));

  const statusLine = (s: SocioCuotaStatus): string => {
    if (s.basis === 'household') return t('groups.cuota.household', { name: nameOf(s.householdOf) });
    if (s.basis === 'exempt') return t('groups.cuota.exempt');
    if (s.status === 'al_dia') return centsLabel(s.paidCents);
    const due = t(s.status === 'vencida' ? 'groups.cuota.overdueSince' : 'groups.cuota.dueOn', { date: formatDayKey(s.dueOn, 'long') });
    const paid = s.paidCents > 0 ? t('groups.cuota.paidOf', { paid: centsLabel(s.paidCents), owed: centsLabel(s.owedCents) }) : centsLabel(s.owedCents);
    return `${paid} · ${due}`;
  };

  return (
    <VStack gap={2} testID="my-cuota">
      <DetailSectionHeading>{t('groups.cuota.myTitle')}</DetailSectionHeading>
      <Text tone="muted" variant="bodySm">
        {t('groups.cuota.periodTitle', { period: periodLabel(periodKey) })}
      </Text>
      {statuses.map((s) => (
        <HStack key={s.socioId} gap={3} align="center" justify="between" className="py-1" testID={`my-cuota-row-${s.socioId}`}>
          <VStack gap={0} className="flex-1">
            <Text className="font-bold">{nameOf(s.socioId)}</Text>
            <Text variant="bodySm" tone="muted">
              {statusLine(s)}
            </Text>
          </VStack>
          <Text variant="bodySm" tone={CUOTA_STATUS_TONE[s.status]} className="font-bold">
            {t(`groups.cuota.status.${s.status}`)}
          </Text>
        </HStack>
      ))}

      {cuota.bizum || cuota.iban || cuota.payInstructions ? (
        <Card testID="my-cuota-how-to-pay">
          <VStack gap={1}>
            <Text className="font-bold">{t('groups.cuota.howToPay')}</Text>
            {cuota.bizum ? <Text selectable>{t('groups.cuota.bizum', { value: cuota.bizum })}</Text> : null}
            {cuota.iban ? <Text selectable>{t('groups.cuota.iban', { value: cuota.iban })}</Text> : null}
            {own && (cuota.bizum || cuota.iban) ? (
              <Text selectable variant="bodySm" tone="muted">
                {t('groups.cuota.concept', { value: cuotaConcept(periodKey, own.displayName) })}
              </Text>
            ) : null}
            {cuota.payInstructions ? <Text variant="bodySm">{cuota.payInstructions}</Text> : null}
          </VStack>
        </Card>
      ) : null}

      <Text className="font-bold pt-2">{t('groups.cuota.history')}</Text>
      {(payments.data ?? []).length === 0 ? (
        <Text tone="muted" variant="bodySm">
          {t('groups.cuota.noHistory')}
        </Text>
      ) : (
        (payments.data ?? []).map((p) => (
          <Text key={p.id} variant="bodySm" tone={reversed.has(p.id) ? 'muted' : 'primary'} testID={`my-cuota-entry-${p.id}`}>
            {[
              rows.length > 1 ? nameOf(p.socioId) : null,
              t('groups.cuota.entryLine', {
                period: periodLabel(p.periodKey),
                amount: centsLabel(p.amountCents),
                method: t(`groups.cuota.methods.${p.method}`),
                date: formatDayKey(p.paidOn),
              }),
              p.kind === 'reversal' ? t('groups.cuota.reversal') : reversed.has(p.id) ? t('groups.cuota.reversed') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ))
      )}
    </VStack>
  );
}

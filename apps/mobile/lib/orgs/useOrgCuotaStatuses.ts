import { useMemo } from 'react';
import { computeCuotaStatuses, currentPeriodKey, type SocioCuotaStatus } from '@cultuvilla/shared/models/organization';
import {
  watchCuotaAssignments,
  watchCuotaPeriodPayments,
  watchCuotaSettings,
  type CuotaAssignment,
  type CuotaPayment,
  type CuotaSettings,
} from '@cultuvilla/shared/services/cuotaService';
import type { Socio } from '@cultuvilla/shared/services/socioService';
import { useWatch } from '../hooks/useWatch';
import { todayKey } from './cuota';

const NONE: ReadonlyMap<string, SocioCuotaStatus> = new Map();

/**
 * Every socio's cuota status for the current period, keyed by socio id — what
 * the junta sees on the libro. Reads the same listeners as the Cuota screen.
 * `configured` is false while the group has no cuota, and the map is empty.
 * A disabled hook (a plain member) reads nothing: the ledger is the junta's.
 */
export function useOrgCuotaStatuses(
  orgId: string,
  socios: Socio[],
  enabled: boolean,
): { configured: boolean; statuses: ReadonlyMap<string, SocioCuotaStatus> } {
  const settings = useWatch<CuotaSettings | null>(
    'groups:watchCuotaSettings',
    enabled ? orgId : null,
    enabled ? (next, error) => watchCuotaSettings(orgId, next, error) : null,
  );
  const cuota = enabled ? (settings.data ?? null) : null;
  const periodKey = cuota ? currentPeriodKey(cuota.periodicity) : null;
  const assignments = useWatch<CuotaAssignment[]>(
    'groups:watchCuotaAssignments',
    cuota ? orgId : null,
    cuota ? (next, error) => watchCuotaAssignments(orgId, next, error) : null,
  );
  const payments = useWatch<CuotaPayment[]>(
    'groups:watchCuotaPeriodPayments',
    periodKey ? `${orgId}|${periodKey}` : null,
    periodKey ? (next, error) => watchCuotaPeriodPayments(orgId, periodKey, next, error) : null,
  );

  const statuses = useMemo(() => {
    if (!cuota || !periodKey || payments.status !== 'ready') return NONE;
    const list = computeCuotaStatuses({
      settings: cuota,
      periodKey,
      today: todayKey(),
      socios,
      assignments: Object.fromEntries((assignments.data ?? []).map((a) => [a.id, a])),
      payments: payments.data ?? [],
    });
    return new Map(list.map((s) => [s.socioId, s]));
  }, [cuota, periodKey, socios, assignments.data, payments.status, payments.data]);

  return { configured: !!cuota, statuses };
}

import { useMemo } from 'react';
import {
  computeCuotaStatuses,
  currentPeriodKey,
  isActiveSocio,
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
import { useWatch } from '../hooks/useWatch';
import { todayKey } from './cuota';

export interface MyCuotaState {
  cuota: CuotaSettings | null;
  periodKey: string | null;
  /** The active socio rows the user is, or answers for. */
  rows: Socio[];
  payments: CuotaPayment[];
  statuses: SocioCuotaStatus[];
  /** Every read has answered: an unconfigured cuota or no socio row is final, not loading. */
  settled: boolean;
}

/**
 * The current period's cuota for the rows a member is or answers for — shared
 * by the member's cuota screen and the group home's summary line. A null `uid`
 * reads nothing (an org with no cuota).
 */
export function useMyCuota(orgId: string, uid: string | null): MyCuotaState {
  const settings = useWatch<CuotaSettings | null>(
    'groups:watchCuotaSettings',
    uid ? orgId : null,
    uid ? (next, error) => watchCuotaSettings(orgId, next, error) : null,
  );
  const mine = useWatch<Socio[]>(
    'groups:watchMySocios',
    uid ? `${orgId}|${uid}` : null,
    uid ? (next, error) => watchMySocios(orgId, uid, next, error) : null,
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


  const tracked = !!cuota && ids.length > 0;
  const settled =
    settings.status === 'ready' && mine.status === 'ready' && (!tracked || payments.status === 'ready');
  return { cuota: cuota ?? null, periodKey, rows, payments: payments.data ?? [], statuses, settled };
}

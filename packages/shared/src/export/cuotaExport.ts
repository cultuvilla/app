/**
 * The cuota period list as an export model — the same `RosterExportModel` the
 * event roster uses, so `toCsv` and the app's xlsx writer serve both. One row
 * per socio of the period, with the status the app shows.
 */
import { formatDate } from '../utils/format';
import type { CuotaAssignmentData, CuotaPaymentData, CuotaPaymentMethod, CuotaSettingsData } from '../models/organization/CuotaDataModel';
import { periodLabel, type CuotaSocio, type CuotaStatus, type SocioCuotaStatus } from '../models/organization/cuotaStatus';
import type { RosterCell, RosterColumn, RosterExportModel } from './rosterExport';

export const CUOTA_STATUS_LABEL: Record<CuotaStatus, string> = {
  al_dia: 'Al día',
  pendiente: 'Pendiente',
  vencida: 'Vencida',
};

export const CUOTA_METHOD_LABEL: Record<CuotaPaymentMethod, string> = {
  efectivo: 'Efectivo',
  bizum: 'Bizum',
  transferencia: 'Transferencia',
  domiciliacion: 'Domiciliación',
};

const KIND_LABEL: Record<CuotaSocio['kind'], string> = {
  member: 'Con la app',
  persona: 'A cargo de otro socio',
  typed: 'Sin la app',
};

export interface CuotaExportInput {
  orgName: string;
  periodKey: string;
  settings: CuotaSettingsData;
  statuses: SocioCuotaStatus[];
  socios: CuotaSocio[];
  assignments: Partial<Record<string, CuotaAssignmentData>>;
  /** The period's ledger entries. */
  payments: (CuotaPaymentData & { id: string })[];
  generatedAt?: Date;
}

function safeFileSegment(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'grupo'
  );
}

export function buildCuotaExport(input: CuotaExportInput): RosterExportModel {
  const { orgName, periodKey, settings, statuses, assignments, generatedAt = new Date() } = input;
  const socioById = new Map(input.socios.map((s) => [s.id, s]));
  const reversed = new Set(input.payments.filter((p) => p.kind === 'reversal').map((p) => p.reversesId));
  const livePayments = input.payments.filter((p) => p.kind === 'payment' && !reversed.has(p.id) && p.periodKey === periodKey);

  const columns: RosterColumn[] = [
    { key: 'row', header: 'Nº', type: 'number', width: 6 },
    { key: 'name', header: 'Socio', type: 'text', width: 32 },
    { key: 'kind', header: 'Tipo', type: 'text', width: 20 },
    { key: 'tier', header: 'Cuota', type: 'text', width: 22 },
    { key: 'owed', header: 'Importe', type: 'euros', width: 12 },
    { key: 'paid', header: 'Pagado', type: 'euros', width: 12 },
    { key: 'status', header: 'Estado', type: 'text', width: 12 },
    { key: 'method', header: 'Método', type: 'text', width: 18 },
    { key: 'paidOn', header: 'Fecha de pago', type: 'dateOnly', width: 16 },
  ];

  const tierLabel = (s: SocioCuotaStatus): string => {
    if (s.basis === 'household') return `Familiar de ${socioById.get(s.householdOf ?? '')?.displayName ?? '—'}`;
    const a = assignments[s.socioId];
    if (a?.exempt) return 'Exento';
    if (a && a.customAmountCents !== null) return 'Importe propio';
    return settings.tiers.find((t) => t.id === a?.tierId)?.name ?? 'General';
  };

  const sorted = [...statuses].sort((a, b) =>
    (socioById.get(a.socioId)?.displayName ?? '').localeCompare(socioById.get(b.socioId)?.displayName ?? ''),
  );

  const rows: RosterCell[][] = sorted.map((s, index) => {
    const mine = livePayments.filter((p) => p.socioId === s.socioId).sort((a, b) => a.paidOn.localeCompare(b.paidOn));
    const methods = [...new Set(mine.map((p) => CUOTA_METHOD_LABEL[p.method]))].join(', ');
    const last = mine[mine.length - 1]?.paidOn;
    const socio = socioById.get(s.socioId);
    return [
      index + 1,
      socio?.displayName ?? '',
      socio ? KIND_LABEL[socio.kind] : '',
      tierLabel(s),
      s.owedCents / 100,
      s.paidCents / 100,
      CUOTA_STATUS_LABEL[s.status],
      methods || null,
      // UTC midnight, like the roster's birth dates: a calendar day, not an instant.
      last ? new Date(`${last}T00:00:00Z`) : null,
    ];
  });

  const count = (status: CuotaStatus) => statuses.filter((s) => s.status === status).length;
  const label = periodLabel(periodKey);
  return {
    fileName: `cuotas-${safeFileSegment(label)}-${safeFileSegment(orgName)}`,
    title: `Cuota ${label} — ${orgName}`,
    subtitle: `Generado: ${formatDate(generatedAt, 'datetime')}`,
    sheetName: `Cuota ${label}`.slice(0, 31),
    columns,
    rows,
    summary: `Al día: ${String(count('al_dia'))}   ·   Pendientes: ${String(count('pendiente'))}   ·   Vencidas: ${String(count('vencida'))}   ·   Total: ${String(statuses.length)}`,
  };
}

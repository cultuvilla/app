/**
 * The group's records as exports: the libro de socios and the yearly summary
 * as `RosterExportModel`s (so `toCsv` and the app's xlsx writer serve them),
 * and an acta as plain text to share or paste into the libro de actas.
 */
import { formatDate, formatDayKey, formatPrice } from '../utils/format';
import { madridDayKey } from '../models/event/EventDataModel';
import { periodLabel } from '../models/organization/cuotaStatus';
import type { ActaBody, ActaData, LedgerEntryData } from '../models/organization/RecordsDataModel';
import type { OrgAdminTitle, SocioData } from '../models/organization/SocioDataModel';
import type { YearSummary } from '../models/organization/recordsLogic';
import { libroDeSocios } from '../models/organization/recordsLogic';
import type { RosterCell, RosterColumn, RosterExportModel } from './rosterExport';

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

/** A calendar day as UTC midnight, the way the xlsx writer and `toCsv` print a `dateOnly` cell. */
function dayCell(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

const cents = (value: number) => formatPrice(value / 100);

// ── Libro de socios ──────────────────────────────────────────────────────────

const SOCIO_KIND_LABEL: Record<SocioData['kind'], string> = {
  member: 'Con la app',
  persona: 'A cargo de otro socio',
  typed: 'Sin la app',
};

const ADMIN_TITLE_LABEL: Record<OrgAdminTitle, string> = {
  presidente: 'Presidencia',
  secretario: 'Secretaría',
  tesorero: 'Tesorería',
  vocal: 'Vocal',
  otro: 'Junta',
};

export interface LibroSociosInput {
  orgName: string;
  socios: (SocioData & { id: string })[];
  generatedAt?: Date;
}

/** Every socio row ever, ordered by alta: socio number, name, kind, cargo, alta, baja. */
export function buildLibroSociosExport(input: LibroSociosInput): RosterExportModel {
  const { orgName, generatedAt = new Date() } = input;
  const byUid = new Map(input.socios.filter((s) => s.uid && s.bajaAt === null).map((s) => [s.uid, s.displayName]));
  const columns: RosterColumn[] = [
    { key: 'socioNumber', header: 'Nº socio', type: 'number', width: 9 },
    { key: 'name', header: 'Socio', type: 'text', width: 32 },
    { key: 'kind', header: 'Tipo', type: 'text', width: 22 },
    { key: 'responsible', header: 'A cargo de', type: 'text', width: 28 },
    { key: 'title', header: 'Cargo', type: 'text', width: 14 },
    { key: 'alta', header: 'Alta', type: 'dateOnly', width: 14 },
    { key: 'baja', header: 'Baja', type: 'dateOnly', width: 14 },
  ];
  const ordered = libroDeSocios(input.socios);
  const rows: RosterCell[][] = ordered.map((s) => [
    s.socioNumber,
    s.displayName,
    SOCIO_KIND_LABEL[s.kind],
    s.responsibleUid ? (byUid.get(s.responsibleUid) ?? null) : null,
    s.adminTitle ? ADMIN_TITLE_LABEL[s.adminTitle] : null,
    dayCell(madridDayKey(s.altaAt)),
    s.bajaAt ? dayCell(madridDayKey(s.bajaAt)) : null,
  ]);
  const active = ordered.filter((s) => s.bajaAt === null).length;
  return {
    fileName: `libro-socios-${safeFileSegment(orgName)}`,
    title: `Libro de socios — ${orgName}`,
    subtitle: `Generado: ${formatDate(generatedAt, 'datetime')}`,
    sheetName: 'Libro de socios',
    columns,
    rows,
    summary: `Altas: ${String(active)}   ·   Bajas: ${String(ordered.length - active)}   ·   Total: ${String(ordered.length)}`,
  };
}

// ── Yearly summary ───────────────────────────────────────────────────────────

export interface YearSummaryExportInput {
  orgName: string;
  summary: YearSummary<LedgerEntryData & { id: string }>;
  generatedAt?: Date;
}

/**
 * The year's money for the asamblea: one income row per cuota period paid
 * this year, then every manual entry by day. Cancelled entries are left out —
 * the sheet is what the asamblea approves, not the audit trail.
 */
export function buildYearSummaryExport(input: YearSummaryExportInput): RosterExportModel {
  const { orgName, summary, generatedAt = new Date() } = input;
  const columns: RosterColumn[] = [
    { key: 'date', header: 'Fecha', type: 'dateOnly', width: 14 },
    { key: 'kind', header: 'Tipo', type: 'text', width: 12 },
    { key: 'concept', header: 'Concepto', type: 'text', width: 40 },
    { key: 'category', header: 'Categoría', type: 'text', width: 20 },
    { key: 'income', header: 'Ingreso', type: 'euros', width: 14 },
    { key: 'expense', header: 'Gasto', type: 'euros', width: 14 },
  ];
  const cuotaRows: RosterCell[][] = summary.cuotaByPeriod.map((p) => [
    null,
    'Ingreso',
    `Cuotas de socios ${periodLabel(p.periodKey)} (${String(p.payments)} pagos)`,
    'Cuotas',
    p.cents / 100,
    null,
  ]);
  const entryRows: RosterCell[][] = summary.entries
    .filter((e) => !e.reversed)
    .map(({ entry }) => [
      dayCell(entry.on),
      entry.kind === 'income' ? 'Ingreso' : 'Gasto',
      entry.concept,
      entry.category,
      entry.kind === 'income' ? entry.amountCents / 100 : null,
      entry.kind === 'expense' ? entry.amountCents / 100 : null,
    ]);
  return {
    fileName: `cuentas-${summary.year}-${safeFileSegment(orgName)}`,
    title: `Cuentas ${summary.year} — ${orgName}`,
    subtitle: `Generado: ${formatDate(generatedAt, 'datetime')}`,
    sheetName: `Cuentas ${summary.year}`,
    columns,
    rows: [...cuotaRows, ...entryRows],
    summary: `Ingresos: ${cents(summary.incomeCents)}   ·   Gastos: ${cents(summary.expenseCents)}   ·   Saldo: ${cents(summary.balanceCents)}`,
  };
}

// ── Actas ────────────────────────────────────────────────────────────────────

export const ACTA_BODY_LABEL: Record<ActaBody, string> = {
  asamblea_general: 'Asamblea general',
  junta_directiva: 'Junta directiva',
  otro: 'Reunión',
};

/** The acta's heading: its own title, else the body's name. */
export function actaHeading(acta: Pick<ActaData, 'body' | 'title'>): string {
  return acta.title ?? ACTA_BODY_LABEL[acta.body];
}

/** An acta as text, in the order a libro de actas records it. */
export function actaText(acta: ActaData, orgName: string): string {
  const lines: string[] = [`ACTA — ${actaHeading(acta)}`, orgName, '', `Fecha: ${formatDayKey(acta.heldOn, 'long')}`];
  if (acta.place) lines.push(`Lugar: ${acta.place}`);
  if (acta.title) lines.push(`Órgano: ${ACTA_BODY_LABEL[acta.body]}`);

  const present = acta.attendees.length + acta.otherAttendees;
  lines.push('', `Asistentes (${String(present)}):`);
  for (const a of acta.attendees) lines.push(`- ${a.name}`);
  if (acta.otherAttendees > 0) {
    lines.push(`- ${String(acta.otherAttendees)} ${acta.otherAttendees === 1 ? 'persona más' : 'personas más'}`);
  }

  lines.push('', 'Orden del día:');
  if (acta.agenda.length === 0) lines.push('—');
  acta.agenda.forEach((item, i) => lines.push(`${String(i + 1)}. ${item}`));

  lines.push('', 'Acuerdos:');
  if (acta.agreements.length === 0) lines.push('—');
  acta.agreements.forEach((item, i) => lines.push(`${String(i + 1)}. ${item}`));

  return `${lines.join('\n')}\n`;
}

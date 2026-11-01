import { describe, it, expect } from 'vitest';
import { actaText, buildLibroSociosExport, buildYearSummaryExport } from '../../src/export/recordsExport';
import { toCsv } from '../../src/export/rosterExport';
import { buildCuotaPaymentData } from '../../src/models/organization/CuotaDataModel';
import { buildActaData, buildLedgerEntryData } from '../../src/models/organization/RecordsDataModel';
import { buildYearSummary } from '../../src/models/organization/recordsLogic';
import { buildSocioData } from '../../src/models/organization/SocioDataModel';

const generatedAt = new Date('2026-10-21T10:00:00Z');

describe('buildLibroSociosExport', () => {
  it('lists every row ever by alta, with socio number, kind, cargo, who answers for a persona, alta and baja', () => {
    const ana = { id: 'a', ...buildSocioData({ kind: 'member', socioNumber: 57, displayName: 'Ana', uid: 'u-ana', adminTitle: 'tesorero', altaAt: new Date('2025-03-01T10:00:00Z'), createdBy: 'u-ana' }) };
    const nene = { id: 'n', ...buildSocioData({ kind: 'persona', displayName: 'Nene', responsibleUid: 'u-ana', altaAt: new Date('2025-04-01T10:00:00Z'), createdBy: 'u-ana' }) };
    const gone = {
      id: 'g',
      ...buildSocioData({ kind: 'typed', displayName: 'Benito', altaAt: new Date('2024-01-10T10:00:00Z'), createdBy: 'u-ana' }),
      bajaAt: new Date('2026-02-01T10:00:00Z'),
    };
    const model = buildLibroSociosExport({ orgName: 'La Anduela', socios: [ana, nene, gone], generatedAt });
    expect(model.fileName).toBe('libro-socios-la-anduela');
    expect(model.summary).toBe('Altas: 2   ·   Bajas: 1   ·   Total: 3');
    const csv = toCsv(model, { bom: false }).split('\r\n');
    expect(csv[0]).toBe('Nº socio;Socio;Tipo;A cargo de;Cargo;Alta;Baja');
    expect(csv[1]).toBe(';Benito;Sin la app;;;10/01/2024;01/02/2026');
    expect(csv[2]).toBe('57;Ana;Con la app;;Tesorería;01/03/2025;');
    expect(csv[3]).toBe(';Nene;A cargo de otro socio;Ana;;01/04/2025;');
  });
});

describe('buildYearSummaryExport', () => {
  it('prints one row per cuota period, then the live entries, and the totals underneath', () => {
    const summary = buildYearSummary({
      year: '2026',
      cuotaPayments: [{ id: 'c1', ...buildCuotaPaymentData({ socioId: 's', periodKey: '2026', amountCents: 3000, method: 'bizum', paidOn: '2026-02-01', recordedBy: 'a' }) }],
      ledgerEntries: [
        { id: 'e1', ...buildLedgerEntryData({ kind: 'expense', amountCents: 12050, on: '2026-08-01', concept: 'Orquesta', category: 'Fiestas', recordedBy: 'a' }) },
      ],
    });
    const model = buildYearSummaryExport({ orgName: 'La Anduela', summary, generatedAt });
    expect(model.title).toBe('Cuentas 2026 — La Anduela');
    const csv = toCsv(model, { bom: false }).split('\r\n');
    expect(csv[1]).toMatch(/^;Ingreso;Cuotas de socios 2026 \(1 pagos\);Cuotas;30,00\s€;$/);
    expect(csv[2]).toMatch(/^01\/08\/2026;Gasto;Orquesta;Fiestas;;120,50\s€$/);
    expect(model.summary).toMatch(/Ingresos: 30,00\s€ {3}· {3}Gastos: 120,50\s€ {3}· {3}Saldo: -90,50\s€/);
  });
});

describe('actaText', () => {
  it('writes the acta in libro order: heading, date, place, attendees, agenda, acuerdos', () => {
    const acta = buildActaData({
      body: 'asamblea_general',
      heldOn: '2026-03-15',
      place: 'Salón del ayuntamiento',
      attendees: [{ socioId: 's1', name: 'Ana' }],
      otherAttendees: 2,
      agenda: ['Cuentas'],
      agreements: ['Se aprueban las cuentas'],
      createdBy: 'a',
    });
    const text = actaText(acta, 'La Anduela');
    expect(text).toContain('ACTA — Asamblea general\nLa Anduela');
    expect(text).toContain('Lugar: Salón del ayuntamiento');
    expect(text).toContain('Asistentes (3):\n- Ana\n- 2 personas más');
    expect(text).toContain('Orden del día:\n1. Cuentas');
    expect(text).toContain('Acuerdos:\n1. Se aprueban las cuentas');
  });
});

import { describe, it, expect } from 'vitest';
import { buildCuotaExport } from '../../src/export/cuotaExport';
import { toCsv } from '../../src/export/rosterExport';
import { buildCuotaPaymentData, buildCuotaReversalData, buildCuotaSettingsData } from '../../src/models/organization/CuotaDataModel';
import { computeCuotaStatuses, type CuotaSocio } from '../../src/models/organization/cuotaStatus';

const settings = buildCuotaSettingsData({
  amountCents: 3000, periodicity: 'yearly', dueMonth: 3, dueDay: 1, graceDays: 30, startPeriod: '2026',
  tiers: [{ id: 'fam', name: 'Familiar', amountCents: 5000, coversPersonas: true }], configuredBy: 'admin',
});
const socio = (id: string, over: Partial<CuotaSocio> = {}): CuotaSocio => ({
  id, kind: 'member', displayName: id, uid: id, responsibleUid: null, adminTitle: null,
  altaAt: new Date('2025-01-01T10:00:00Z'), bajaAt: null, ...over,
});
const pay = (id: string, socioId: string, amountCents: number, paidOn: string, method: 'bizum' | 'efectivo' = 'bizum') => ({
  id, ...buildCuotaPaymentData({ socioId, periodKey: '2026', amountCents, method, paidOn, recordedBy: 'admin' }),
});

describe('buildCuotaExport', () => {
  const socios = [
    socio('Ana', { uid: 'u-ana' }),
    socio('Nene', { kind: 'persona', uid: null, responsibleUid: 'u-ana' }),
    socio('Benito', { kind: 'typed', uid: null }),
  ];
  const assignments = { Ana: { tierId: 'fam', exempt: false, customAmountCents: null, updatedBy: 'a', updatedAt: new Date() } };
  const wrong = pay('p2', 'Benito', 3000, '2026-02-01', 'efectivo');
  const payments = [
    pay('p1', 'Ana', 5000, '2026-02-10'),
    wrong,
    { id: 'rev_p2', ...buildCuotaReversalData(wrong, { paidOn: '2026-02-02', recordedBy: 'admin' }) },
  ];
  const statuses = computeCuotaStatuses({ settings, periodKey: '2026', today: '2026-04-15', socios, assignments, payments });
  const model = buildCuotaExport({
    orgName: 'Asociación La Anduela', periodKey: '2026', settings, statuses, socios, assignments, payments,
    generatedAt: new Date('2026-04-15T10:00:00Z'),
  });

  it('has one row per socio with tier, amounts, status and the live payment', () => {
    expect(model.columns.map((c) => c.header)).toEqual(['Nº', 'Socio', 'Tipo', 'Cuota', 'Importe', 'Pagado', 'Estado', 'Método', 'Fecha de pago']);
    expect(model.rows).toEqual([
      [1, 'Ana', 'Con la app', 'Familiar', 50, 50, 'Al día', 'Bizum', new Date('2026-02-10T00:00:00Z')],
      [2, 'Benito', 'Sin la app', 'General', 30, 0, 'Vencida', null, null],
      [3, 'Nene', 'A cargo de otro socio', 'Familiar de Ana', 0, 0, 'Al día', null, null],
    ]);
    expect(model.summary).toContain('Al día: 2');
    expect(model.summary).toContain('Vencidas: 1');
    expect(model.fileName).toBe('cuotas-2026-asociacion-la-anduela');
  });

  it('renders as a Spanish CSV with money and days', () => {
    // Intl puts a no-break space before the euro sign.
    const csv = toCsv(model).replace(/\u00a0/g, ' ');
    expect(csv).toContain('1;Ana;Con la app;Familiar;50,00 €;50,00 €;Al día;Bizum;10/02/2026');
  });
});

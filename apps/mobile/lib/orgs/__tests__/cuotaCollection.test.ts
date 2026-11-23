import type { SocioCuotaStatus } from '@cultuvilla/shared/models/organization';
import {
  addToTally,
  EMPTY_TALLY,
  foldSearch,
  inCollectionFilter,
  matchesSocio,
  summarizeCollection,
} from '../cuotaCollection';

function status(socioId: string, over: Partial<SocioCuotaStatus>): SocioCuotaStatus {
  return { socioId, status: 'pendiente', basis: 'unpaid', owedCents: 2500, paidCents: 0, dueOn: '2026-11-30', householdOf: null, ...over };
}

const PAID = status('a', { status: 'al_dia', basis: 'paid', paidCents: 2500 });
const PARTIAL = status('b', { paidCents: 1000 });
const LATE = status('c', { status: 'vencida' });
const EXEMPT = status('d', { status: 'al_dia', basis: 'exempt', owedCents: 0 });
const HOUSEHOLD = status('e', { status: 'pendiente', basis: 'household', owedCents: 0, householdOf: 'b' });

describe('cuota collection', () => {
  it('sums collected vs owed, leaving out household rows and the exempt from the count', () => {
    expect(summarizeCollection([PAID, PARTIAL, LATE, EXEMPT, HOUSEHOLD])).toEqual({
      collectedCents: 3500,
      totalCents: 7500,
      payers: 3,
      paid: 1,
    });
  });

  it('puts each socio under its chip', () => {
    const all = [PAID, PARTIAL, LATE, EXEMPT, HOUSEHOLD];
    const ids = (f: Parameters<typeof inCollectionFilter>[1]) => all.filter((s) => inCollectionFilter(s, f)).map((s) => s.socioId);
    expect(ids('pending')).toEqual(['b', 'c']);
    expect(ids('vencida')).toEqual(['c']);
    expect(ids('paid')).toEqual(['a']);
    expect(ids('exempt')).toEqual(['d', 'e']);
  });

  it('finds a socio by name without accents or case, or by number', () => {
    expect(foldSearch('  Álvaro ')).toBe('alvaro');
    expect(matchesSocio('alv', 'Álvaro Gil', null)).toBe(true);
    expect(matchesSocio('41', 'Maite López', 41)).toBe(true);
    expect(matchesSocio('4', 'Maite López', 41)).toBe(false);
    expect(matchesSocio('', 'Anyone', null)).toBe(true);
  });

  it('keeps a running tally per method', () => {
    const tally = addToTally(addToTally(addToTally(EMPTY_TALLY, 'efectivo', 2500), 'bizum', 2500), 'efectivo', 1000);
    expect(tally).toEqual({ count: 3, byMethod: { efectivo: 3500, bizum: 2500 } });
  });
});

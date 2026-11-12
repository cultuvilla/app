import { buildSocioData } from '@cultuvilla/shared/models/organization';
import type { Socio } from '@cultuvilla/shared/services/socioService';
import type { SocioCuotaStatus } from '@cultuvilla/shared/models/organization';
import { bookCounts, filterBook, initialsOf, linkCandidates, matchesSocioQuery, owesCuota, responsibleName } from '../socioRoster';
import { pickGroupId } from '../lastGroup';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));

function row(id: string, overrides: Partial<Socio>): Socio {
  return { id, ...buildSocioData({ kind: 'member', displayName: id, createdBy: 'x' }), ...overrides };
}

const berta = row('Berta', { uid: 'u-berta' });
const hija = row('Hija', { kind: 'persona', personId: 'p', responsibleUid: 'u-ana' });
const rows: Socio[] = [
  berta,
  row('Ana', { uid: 'u-ana' }),
  hija,
  row('Paco', { kind: 'typed' }),
  row('Carlos', { uid: 'u-carlos', bajaAt: new Date() }),
];

describe('socio roster view', () => {
  const status = (socioId: string, s: Partial<SocioCuotaStatus>): SocioCuotaStatus => ({
    socioId, status: 'pendiente', basis: 'unpaid', owedCents: 2500, paidCents: 0, dueOn: '2026-11-30', householdOf: null, ...s,
  });
  const statuses = new Map([
    ['Ana', status('Ana', { status: 'al_dia', basis: 'paid' })],
    ['Berta', status('Berta', { status: 'vencida' })],
    ['Hija', status('Hija', { basis: 'household', householdOf: 'Ana', owedCents: 0 })],
    ['Paco', status('Paco', {})],
  ]);

  it('files each socio under the chips, by name', () => {
    expect(filterBook(rows, 'activos', '', statuses).map((r) => r.id)).toEqual(['Ana', 'Berta', 'Hija', 'Paco']);
    expect(filterBook(rows, 'bajas', '', statuses).map((r) => r.id)).toEqual(['Carlos']);
    expect(filterBook(rows, 'sinApp', '', statuses).map((r) => r.id)).toEqual(['Paco']);
    expect(filterBook(rows, 'pendiente', '', statuses).map((r) => r.id)).toEqual(['Berta', 'Paco']);
    expect(bookCounts(rows, statuses)).toEqual({ activos: 4, pendiente: 2, sinApp: 1, bajas: 1 });
  });

  it('leaves out of "cuota pendiente" a persona the household pays for', () => {
    expect(owesCuota(statuses.get('Hija'))).toBe(false);
    expect(owesCuota(statuses.get('Ana'))).toBe(false);
    expect(owesCuota(undefined)).toBe(false);
    expect(owesCuota(statuses.get('Berta'))).toBe(true);
  });

  it('searches by name, ignoring accents and case, or by the exact number', () => {
    const maria = row('María Gómez', { socioNumber: 41 });
    expect(matchesSocioQuery(maria, 'maria')).toBe(true);
    expect(matchesSocioQuery(maria, ' GÓM ')).toBe(true);
    expect(matchesSocioQuery(maria, '41')).toBe(true);
    expect(matchesSocioQuery(maria, '4')).toBe(false);
    expect(matchesSocioQuery(maria, '')).toBe(true);
    expect(filterBook(rows, 'activos', 'ber', statuses).map((r) => r.id)).toEqual(['Berta']);
  });

  it('makes initials from the first two words', () => {
    expect(initialsOf('maría lópez garcía')).toBe('ML');
    expect(initialsOf('  ')).toBe('');
  });

  it('offers only active app members as link targets', () => {
    expect(linkCandidates(rows).map((r) => r.id).sort()).toEqual(['Ana', 'Berta']);
  });

  it("names a persona's responsible member", () => {
    expect(responsibleName(hija, rows)).toBe('Ana');
    expect(responsibleName(berta, rows)).toBeNull();
  });
});

describe('pickGroupId', () => {
  it('reopens the remembered group while the user still belongs to it', () => {
    expect(pickGroupId(['a', 'b'], 'b')).toBe('b');
  });

  it('falls back to the first group otherwise', () => {
    expect(pickGroupId(['a', 'b'], 'gone')).toBe('a');
    expect(pickGroupId(['a'], null)).toBe('a');
    expect(pickGroupId([], 'a')).toBeNull();
  });
});

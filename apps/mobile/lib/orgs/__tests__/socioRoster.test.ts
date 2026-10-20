import { buildSocioData } from '@cultuvilla/shared/models/organization';
import type { Socio } from '@cultuvilla/shared/services/socioService';
import { linkCandidates, responsibleName, visibleSocios } from '../socioRoster';
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
  it('lists active socios by name and hides bajas unless asked', () => {
    expect(visibleSocios(rows, false).map((r) => r.id)).toEqual(['Ana', 'Berta', 'Hija', 'Paco']);
    expect(visibleSocios(rows, true).map((r) => r.id)).toEqual(['Ana', 'Berta', 'Hija', 'Paco', 'Carlos']);
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

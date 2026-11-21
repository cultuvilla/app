import { render } from '@testing-library/react-native';
import { buildSocioData, type SocioCuotaStatus } from '@cultuvilla/shared/models/organization';
import { MySocioRecord } from '../MySocioRecord';
import { useMyCuota } from '../../../../lib/orgs/useMyCuota';

jest.mock('../../../../lib/i18n', () => ({
  useT: () => ({ locale: 'es', t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${Object.values(v).map(String).join('|')}` : k) }),
}));
jest.mock('../../../../lib/orgs/useMyCuota', () => ({ useMyCuota: jest.fn() }));
jest.mock('../MyPersonasSocios', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MyPersonasSocios: () => <Text testID="personas" /> };
});

const own = { id: 's-me', ...buildSocioData({ kind: 'member', displayName: 'Ana', uid: 'u1', socioNumber: 47, createdBy: 'x' }) };
const status = (s: Partial<SocioCuotaStatus>): SocioCuotaStatus => ({
  socioId: 's-me', status: 'pendiente', basis: 'unpaid', owedCents: 2500, paidCents: 0, dueOn: '2026-11-30', householdOf: null, ...s,
});
const cuota = (over: Partial<ReturnType<typeof useMyCuota>>) =>
  jest.mocked(useMyCuota).mockReturnValue({ cuota: null, periodKey: null, rows: [], payments: [], statuses: [], settled: true, ...over });

describe('MySocioRecord', () => {
  it('shows the socio number and this period’s cuota above the personas', () => {
    cuota({ periodKey: '2026', rows: [own], statuses: [status({ status: 'al_dia', basis: 'paid' })] });
    const r = render(<MySocioRecord orgId="org1" uid="u1" />);
    expect(r.getByTestId('my-socio-number').props.children).toBe('groups.socios.myNumber:47');
    expect(r.getByTestId('my-socio-cuota')).toBeTruthy();
    expect(r.getByTestId('personas')).toBeTruthy();
  });

  it('shows no cuota while the group has none, and "Socio" before a number is given', () => {
    cuota({ rows: [{ ...own, socioNumber: null }] });
    const r = render(<MySocioRecord orgId="org1" uid="u1" />);
    expect(r.getByTestId('my-socio-number').props.children).toBe('groups.socios.mySocio');
    expect(r.queryByTestId('my-socio-cuota')).toBeNull();
  });

  it('keeps the personas when the member row has not arrived yet', () => {
    cuota({});
    const r = render(<MySocioRecord orgId="org1" uid="u1" />);
    expect(r.getByTestId('my-socio-record')).toBeTruthy();
    expect(r.queryByTestId('my-socio-number')).toBeNull();
    expect(r.getByTestId('personas')).toBeTruthy();
  });
});

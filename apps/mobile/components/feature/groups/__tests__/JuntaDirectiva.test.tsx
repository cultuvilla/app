import { render } from '@testing-library/react-native';
import { buildSocioData } from '@cultuvilla/shared/models/organization';
import { resetWatchers, setWatched, watchersOf } from '../../../../test/watchers';
import { JuntaDirectiva } from '../JuntaDirectiva';

jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/orgs/useOrgMembers', () => ({
  useMemberFaces: () => ({
    'u-pres': { name: 'Carmen Ruiz', photoURL: null },
    'u-tes': { name: 'Julián Martín', photoURL: 'https://x/j.jpg' },
    'u-vocal': { name: 'Ana Sanz', photoURL: null },
  }),
}));
jest.mock('@cultuvilla/shared/services/socioService', () => ({
  watchOrgSocios: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('socios'),
}));

const row = (uid: string, adminTitle: 'presidente' | 'tesorero' | null) => ({
  id: `s-${uid}`,
  ...buildSocioData({ kind: 'member', displayName: uid, uid, adminTitle, createdBy: 'x' }),
});

beforeEach(() => {
  resetWatchers();
  setWatched('socios', [row('u-tes', 'tesorero'), row('u-pres', 'presidente'), row('u-vocal', null)]);
});

describe('JuntaDirectiva', () => {
  it('lists the admins with their cargo, presidencia first', () => {
    const r = render(<JuntaDirectiva orgId="org1" adminUids={['u-vocal', 'u-tes', 'u-pres']} canReadRoster />);
    const order = r.getAllByTestId(/^junta-u-/).map((n) => n.props.testID as string);
    expect(order).toEqual(['junta-u-pres', 'junta-u-tes', 'junta-u-vocal']);
    expect(r.getByText('groups.titles.presidente')).toBeTruthy();
    expect(r.getByText('Carmen')).toBeTruthy();
  });

  it('shows the faces without cargos when the member cannot read the roster', () => {
    const r = render(<JuntaDirectiva orgId="org1" adminUids={['u-pres']} canReadRoster={false} />);
    expect(watchersOf('socios')).toHaveLength(0);
    expect(r.getByText('groups.socios.juntaMember')).toBeTruthy();
  });

  it('renders nothing for a group with no admins', () => {
    const r = render(<JuntaDirectiva orgId="org1" adminUids={[]} canReadRoster />);
    expect(r.queryByTestId('junta-directiva')).toBeNull();
  });
});

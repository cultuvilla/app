import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { setOrgMemberRole } from '@cultuvilla/shared/services/orgMemberService';
import { setSocioAdminTitle } from '@cultuvilla/shared/services/socioService';
import { buildSocioData } from '@cultuvilla/shared/models/organization';
import { resetWatchers, setWatched, watchersOf } from '../../../../test/watchers';
import { AddToJuntaButton, JuntaDirectiva } from '../JuntaDirectiva';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@cultuvilla/shared/services/orgMemberService', () => ({
  setOrgMemberRole: jest.fn().mockResolvedValue(undefined),
}));
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
  setSocioAdminTitle: jest.fn().mockResolvedValue(undefined),
}));

const row = (uid: string, adminTitle: 'presidente' | 'tesorero' | null) => ({
  id: `s-${uid}`,
  ...buildSocioData({ kind: 'member', displayName: uid, uid, adminTitle, createdBy: 'x' }),
});

beforeEach(() => {
  resetWatchers();
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  setWatched('socios', [row('u-tes', 'tesorero'), row('u-pres', 'presidente'), row('u-vocal', null), row('u-new', null)]);
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

describe('JuntaDirectiva for an admin', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const renderAdmin = () =>
    render(<JuntaDirectiva orgId="org1" adminUids={['u-pres', 'u-tes']} canReadRoster canManage currentUid="u-pres" />);
  const settle = () => act(() => jest.runAllTimers());
  const renderAdd = () => render(<AddToJuntaButton orgId="org1" adminUids={['u-pres', 'u-tes']} />);

  it('stays read-only for a socio', () => {
    const r = render(<JuntaDirectiva orgId="org1" adminUids={['u-pres']} canReadRoster />);
    expect(r.queryByTestId('junta-add')).toBeNull();
    fireEvent.press(r.getByTestId('junta-u-pres'));
    expect(r.queryByTestId('junta-face-sheet')).toBeNull();
  });

  it('adds a socio with the app to the junta with a cargo: the role first, then the cargo', async () => {
    const r = renderAdd();
    fireEvent.press(r.getByTestId('junta-add'));
    expect(r.getByTestId('junta-add-sheet')).toBeTruthy();
    expect(r.queryByTestId('junta-add-sheet-s-u-tes')).toBeNull();
    fireEvent.press(r.getByTestId('junta-add-sheet-s-u-new'));
    settle();
    expect(r.getByTestId('junta-add-title-sheet')).toBeTruthy();
    fireEvent.press(r.getByTestId('junta-add-title-sheet-vocal'));
    await waitFor(() => expect(setSocioAdminTitle).toHaveBeenCalledWith('org1', 's-u-new', 'vocal'));
    expect(setOrgMemberRole).toHaveBeenCalledWith('org1', 'u-new', 'admin');
    expect(jest.mocked(setOrgMemberRole).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(setSocioAdminTitle).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('gives no cargo when the role change is refused', async () => {
    jest.mocked(setOrgMemberRole).mockRejectedValueOnce(new Error('permission-denied'));
    const r = renderAdd();
    fireEvent.press(r.getByTestId('junta-add'));
    fireEvent.press(r.getByTestId('junta-add-sheet-s-u-new'));
    settle();
    fireEvent.press(r.getByTestId('junta-add-title-sheet-vocal'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('organization.membersList.roleChangeError'));
    expect(setSocioAdminTitle).not.toHaveBeenCalled();
  });

  it('changes a cargo, and takes someone out of the junta after confirming', async () => {
    const r = renderAdmin();
    fireEvent.press(r.getByTestId('junta-u-tes'));
    fireEvent.press(r.getByTestId('junta-face-sheet-title'));
    settle();
    expect(r.getByTestId('junta-title-sheet')).toBeTruthy();
    fireEvent.press(r.getByTestId('junta-title-sheet-secretario'));
    expect(setSocioAdminTitle).toHaveBeenCalledWith('org1', 's-u-tes', 'secretario');

    fireEvent.press(r.getByTestId('junta-u-tes'));
    fireEvent.press(r.getByTestId('junta-face-sheet-remove'));
    settle();
    const buttons = (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as { onPress?: () => void }[];
    buttons.at(-1)?.onPress?.();
    expect(setOrgMemberRole).toHaveBeenCalledWith('org1', 'u-tes', 'member');
  });

  it('offers their own face only the cargo', () => {
    const r = renderAdmin();
    fireEvent.press(r.getByTestId('junta-u-pres'));
    expect(r.getByTestId('junta-face-sheet-title')).toBeTruthy();
    expect(r.queryByTestId('junta-face-sheet-remove')).toBeNull();
  });
});

import { Alert } from 'react-native';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { buildSocioData } from '@cultuvilla/shared/models/organization';
import { addPersonaSocio, setSocioBaja } from '@cultuvilla/shared/services/socioService';
import { emitWatched, resetWatchers, setWatched } from '../../../../test/watchers';
import { MyPersonasSocios } from '../MyPersonasSocios';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('@cultuvilla/shared/services/personService', () => ({
  watchPersonsByCreator: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('persons'),
}));
jest.mock('@cultuvilla/shared/services/socioService', () => ({
  watchMySocios: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('mySocios'),
  addPersonaSocio: jest.fn().mockResolvedValue('new'),
  setSocioBaja: jest.fn().mockResolvedValue(undefined),
}));

function person(id: string, givenName: string, userId: string | null = null) {
  return {
    id, givenName, middleNames: [], firstSurname: 'García', secondSurname: null, nickname: null,
    userId, deathDate: null, burialPlace: null, createdBy: 'u1',
  };
}

beforeEach(() => {
  resetWatchers();
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

describe('MyPersonasSocios', () => {
  it('offers a member with no personas a cargo the way to add one', () => {
    setWatched('persons', [person('self', 'Ana', 'u1')]);
    setWatched('mySocios', []);
    const { getByTestId, queryByTestId } = render(<MyPersonasSocios orgId="org1" uid="u1" />);
    expect(queryByTestId('persona-socio-add-self')).toBeNull();
    fireEvent.press(getByTestId('persona-socio-new'));
    expect(mockPush).toHaveBeenCalledWith('/persona/new');
  });

  it('makes a persona a socio, answerable to the member', async () => {
    setWatched('persons', [person('self', 'Ana', 'u1'), person('kid', 'Lucía')]);
    setWatched('mySocios', []);
    const { getByTestId } = render(<MyPersonasSocios orgId="org1" uid="u1" />);
    expect(getByTestId('my-personas-socios')).toBeTruthy();
    fireEvent.press(getByTestId('persona-socio-add-kid'));
    await waitFor(() =>
      expect(addPersonaSocio).toHaveBeenCalledWith('org1', { id: 'kid', displayName: 'Lucía García' }, 'u1'),
    );
  });

  it('says so when the persona is already a socio (added from another device), and recovers', async () => {
    jest.mocked(addPersonaSocio).mockRejectedValueOnce(new Error('permission-denied'));
    setWatched('persons', [person('kid', 'Lucía')]);
    setWatched('mySocios', []);
    const { getByTestId, queryByTestId } = render(<MyPersonasSocios orgId="org1" uid="u1" />);
    fireEvent.press(getByTestId('persona-socio-add-kid'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('groups.personas.error'));
    expect(queryByTestId('persona-socio-add-kid-spinner')).toBeNull();
    expect(getByTestId('persona-socio-add-kid')).toBeTruthy();
  });

  it('a successful add shows the persona as a socio once the roster delivers it', async () => {
    setWatched('persons', [person('kid', 'Lucía')]);
    setWatched('mySocios', []);
    const { getByTestId, findByTestId } = render(<MyPersonasSocios orgId="org1" uid="u1" />);
    fireEvent.press(getByTestId('persona-socio-add-kid'));
    await act(async () => {});
    emitWatched('mySocios', [
      { id: 's-kid', ...buildSocioData({ kind: 'persona', displayName: 'Lucía', personId: 'kid', responsibleUid: 'u1', createdBy: 'u1' }) },
    ]);
    expect(await findByTestId('persona-socio-remove-kid')).toBeTruthy();
  });

  it('gives a persona socio the baja after confirming', async () => {
    setWatched('persons', [person('kid', 'Lucía')]);
    setWatched('mySocios', [
      { id: 's-kid', ...buildSocioData({ kind: 'persona', displayName: 'Lucía', personId: 'kid', responsibleUid: 'u1', createdBy: 'u1' }) },
    ]);
    const { getByTestId } = render(<MyPersonasSocios orgId="org1" uid="u1" />);
    fireEvent.press(getByTestId('persona-socio-remove-kid'));
    const buttons = (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as { onPress?: () => void }[];
    buttons.at(-1)?.onPress?.();
    expect(setSocioBaja).toHaveBeenCalledWith('org1', expect.objectContaining({ id: 's-kid', personId: 'kid' }));
    await act(async () => {});
  });
});

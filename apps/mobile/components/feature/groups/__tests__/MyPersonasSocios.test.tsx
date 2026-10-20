import { Alert } from 'react-native';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { buildSocioData } from '@cultuvilla/shared/models/organization';
import { addPersonaSocio, setSocioBaja } from '@cultuvilla/shared/services/socioService';
import { resetWatchers, setWatched } from '../../../../test/watchers';
import { MyPersonasSocios } from '../MyPersonasSocios';

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
  it('is hidden for a member with no personas a cargo', () => {
    setWatched('persons', [person('self', 'Ana', 'u1')]);
    setWatched('mySocios', []);
    const { queryByTestId } = render(<MyPersonasSocios orgId="org1" uid="u1" />);
    expect(queryByTestId('my-personas-socios')).toBeNull();
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

  it('gives a persona socio the baja after confirming', async () => {
    setWatched('persons', [person('kid', 'Lucía')]);
    setWatched('mySocios', [
      { id: 's-kid', ...buildSocioData({ kind: 'persona', displayName: 'Lucía', personId: 'kid', responsibleUid: 'u1', createdBy: 'u1' }) },
    ]);
    const { getByTestId } = render(<MyPersonasSocios orgId="org1" uid="u1" />);
    fireEvent.press(getByTestId('persona-socio-remove-kid'));
    const buttons = (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as { onPress?: () => void }[];
    buttons.at(-1)?.onPress?.();
    expect(setSocioBaja).toHaveBeenCalledWith('org1', 's-kid');
    await act(async () => {});
  });
});

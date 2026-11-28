import { Alert } from 'react-native';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { buildSocioData } from '@cultuvilla/shared/models/organization';
import { addPersonaSocio, setSocioBaja } from '@cultuvilla/shared/services/socioService';
import { emitWatched, resetWatchers, setWatched } from '../../../../test/watchers';
import { AddPersonaSocio, MyPersonasSocios } from '../MyPersonasSocios';

const mockPush = jest.fn();
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('@cultuvilla/shared/services/personService', () =>
  jest
    .requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/personService')>(
      '@cultuvilla/shared/services/personService',
      () => ({
        watchPersonsByCreator: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('persons'),
      }),
    ),
);
jest.mock('@cultuvilla/shared/services/socioService', () =>
  jest
    .requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/socioService')>(
      '@cultuvilla/shared/services/socioService',
      () => ({
        watchMySocios: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('mySocios'),
        addPersonaSocio: jest.fn().mockResolvedValue('new'),
        setSocioBaja: jest.fn().mockResolvedValue(undefined),
      }),
    ),
);

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

const lucia = { id: 's-kid', ...buildSocioData({ kind: 'persona', displayName: 'Lucía', personId: 'kid', responsibleUid: 'u1', createdBy: 'u1' }) };

describe('MyPersonasSocios', () => {
  it('shows nothing while no persona a cargo is a socio', () => {
    setWatched('persons', [person('self', 'Ana', 'u1'), person('kid', 'Lucía')]);
    setWatched('mySocios', []);
    const { queryByTestId } = render(<MyPersonasSocios orgId="org1" uid="u1" />);
    expect(queryByTestId('my-personas-socios')).toBeNull();
  });

  it('gives a persona socio the baja after confirming', async () => {
    setWatched('persons', [person('kid', 'Lucía')]);
    setWatched('mySocios', [lucia]);
    const { getByTestId } = render(<MyPersonasSocios orgId="org1" uid="u1" />);
    fireEvent.press(getByTestId('persona-socio-remove-kid'));
    const buttons = (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as { onPress?: () => void }[];
    buttons.at(-1)?.onPress?.();
    expect(setSocioBaja).toHaveBeenCalledWith('org1', expect.objectContaining({ id: 's-kid', personId: 'kid' }));
    await act(async () => {});
  });
});

describe('AddPersonaSocio', () => {
  it('with nobody to pick, goes straight to adding a persona', () => {
    setWatched('persons', [person('self', 'Ana', 'u1')]);
    setWatched('mySocios', []);
    const { getByTestId, queryByTestId } = render(<AddPersonaSocio orgId="org1" uid="u1" />);
    fireEvent.press(getByTestId('persona-socio-add'));
    expect(mockPush).toHaveBeenCalledWith('/persona/new');
    expect(queryByTestId('persona-socio-pick-self')).toBeNull();
  });

  it('is one button: pick who becomes a socio, answerable to the member', async () => {
    setWatched('persons', [person('kid', 'Lucía'), person('kid2', 'Pablo'), person('old', 'Juan')]);
    setWatched('mySocios', [{ ...lucia, personId: 'old', id: 's-old' }]);
    const { getByTestId, queryByTestId } = render(<AddPersonaSocio orgId="org1" uid="u1" />);
    expect(queryByTestId('persona-socio-pick-kid')).toBeNull();
    fireEvent.press(getByTestId('persona-socio-add'));
    expect(getByTestId('persona-socio-sheet')).toBeTruthy();
    expect(getByTestId('persona-socio-pick-kid2')).toBeTruthy();
    expect(queryByTestId('persona-socio-pick-old')).toBeNull();
    fireEvent.press(getByTestId('persona-socio-pick-kid'));
    await waitFor(() =>
      expect(addPersonaSocio).toHaveBeenCalledWith('org1', { id: 'kid', displayName: 'Lucía García' }, 'u1'),
    );
  });

  it('offers a new persona from the sheet too', () => {
    setWatched('persons', [person('kid', 'Lucía')]);
    setWatched('mySocios', []);
    const { getByTestId } = render(<AddPersonaSocio orgId="org1" uid="u1" />);
    fireEvent.press(getByTestId('persona-socio-add'));
    fireEvent.press(getByTestId('persona-socio-new'));
    expect(mockPush).toHaveBeenCalledWith('/persona/new');
  });

  it('says so when the add fails, and lets the member try again', async () => {
    jest.mocked(addPersonaSocio).mockRejectedValueOnce(new Error('permission-denied'));
    setWatched('persons', [person('kid', 'Lucía')]);
    setWatched('mySocios', []);
    const { getByTestId } = render(<AddPersonaSocio orgId="org1" uid="u1" />);
    fireEvent.press(getByTestId('persona-socio-add'));
    fireEvent.press(getByTestId('persona-socio-pick-kid'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('groups.personas.error'));
    expect(getByTestId('persona-socio-pick-kid').props.accessibilityState).toMatchObject({ busy: false, disabled: false });
  });
});

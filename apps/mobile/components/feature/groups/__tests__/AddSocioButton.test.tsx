import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { addTypedSocio } from '@cultuvilla/shared/services/socioService';
import { resetWatchers, setWatched } from '../../../../test/watchers';
import { AddSocioButton } from '../AddSocioButton';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('@cultuvilla/shared/services/personService', () => ({
  watchPersonsByCreator: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('persons'),
}));
jest.mock('@cultuvilla/shared/services/socioService', () => {
  const { mockWatcher } = jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers');
  return {
    watchOrgSocios: mockWatcher('socios'),
    watchMySocios: mockWatcher('mySocios'),
    addTypedSocio: jest.fn().mockResolvedValue('new'),
    addPersonaSocio: jest.fn().mockResolvedValue('new'),
    setSocioBaja: jest.fn().mockResolvedValue(undefined),
  };
});

const kid = {
  id: 'kid', givenName: 'Lucía', middleNames: [], firstSurname: 'García', secondSurname: null, nickname: null,
  userId: null, deathDate: null, burialPlace: null, createdBy: 'u-admin',
};

beforeEach(() => {
  jest.useFakeTimers();
  resetWatchers();
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  setWatched('socios', []);
  setWatched('persons', [kid]);
  setWatched('mySocios', []);
});
afterEach(() => jest.useRealTimers());

function openTyped() {
  const r = render(<AddSocioButton orgId="org1" uid="u-admin" isAdmin />);
  fireEvent.press(r.getByTestId('socios-add'));
  expect(r.getByTestId('socios-add-sheet')).toBeTruthy();
  fireEvent.press(r.getByTestId('socios-add-sheet-typed'));
  act(() => jest.runAllTimers());
  expect(r.getByTestId('typed-socio-sheet')).toBeTruthy();
  return r;
}

describe('AddSocioButton', () => {
  it('lets a socio add only a persona a cargo, straight away', () => {
    const r = render(<AddSocioButton orgId="org1" uid="u1" isAdmin={false} />);
    expect(r.queryByTestId('socios-add')).toBeNull();
    fireEvent.press(r.getByTestId('persona-socio-add'));
    expect(r.getByTestId('persona-socio-sheet')).toBeTruthy();
  });

  it('asks an admin whom: a persona a cargo opens the picker', () => {
    const r = render(<AddSocioButton orgId="org1" uid="u-admin" isAdmin />);
    fireEvent.press(r.getByTestId('socios-add'));
    fireEvent.press(r.getByTestId('socios-add-sheet-persona'));
    act(() => jest.runAllTimers());
    expect(r.getByTestId('persona-socio-pick-kid')).toBeTruthy();
  });

  it('types in a new socio', async () => {
    const r = openTyped();
    fireEvent.changeText(r.getByTestId('typed-socio-name'), 'Lola');
    fireEvent.press(r.getByTestId('typed-socio-consent'));
    fireEvent.changeText(r.getByTestId('typed-socio-phone'), '622');
    fireEvent.changeText(r.getByTestId('typed-socio-email'), '');
    fireEvent.press(r.getByTestId('typed-socio-save'));
    await waitFor(() =>
      expect(addTypedSocio).toHaveBeenCalledWith('org1', { displayName: 'Lola', socioNumber: null, phone: '622', email: '' }, 'u-admin'),
    );
  });

  it('closes the sheet once the new socio is saved', async () => {
    const r = openTyped();
    fireEvent.changeText(r.getByTestId('typed-socio-name'), 'Lola');
    fireEvent.press(r.getByTestId('typed-socio-consent'));
    fireEvent.press(r.getByTestId('typed-socio-save'));
    await waitFor(() => expect(addTypedSocio).toHaveBeenCalled());
    await act(async () => {});
    expect(r.queryByTestId('typed-socio-sheet')).toBeNull();
  });

  it('keeps the sheet open and says so when the write is refused', async () => {
    jest.mocked(addTypedSocio).mockRejectedValueOnce(new Error('permission-denied'));
    const r = openTyped();
    fireEvent.changeText(r.getByTestId('typed-socio-name'), 'Lola');
    fireEvent.press(r.getByTestId('typed-socio-consent'));
    fireEvent.press(r.getByTestId('typed-socio-save'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('groups.socios.error'));
    expect(r.getByTestId('typed-socio-sheet')).toBeTruthy();
    expect(r.getByTestId('typed-socio-name').props.value).toBe('Lola');
  });
});

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { BuryFab } from '../BuryFab';
import * as personService from '@cultuvilla/shared/services/personService';

jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => cb(),
}));
jest.mock('@cultuvilla/shared/services/personService', () =>
  jest
    .requireActual<typeof import('../../../test/fakeModule')>('../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/personService')>('@cultuvilla/shared/services/personService', () => ({
      updatePerson: async () => undefined,
    })),
);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const asMock = <T,>(fn: T) => fn as unknown as jest.Mock;

const personas = [
  { id: 'own', userId: 'u1', givenName: 'Yo', middleNames: [], firstSurname: 'Mismo', secondSurname: null, nickname: null },
  { id: 'dep', userId: null, givenName: 'Abuelo', middleNames: [], firstSurname: 'Juan', secondSurname: null, nickname: null },
];

describe('BuryFab', () => {
  beforeEach(() => {
    asMock(personService.getPersonsByCreator).mockResolvedValue(personas);
    asMock(personService.updatePerson).mockClear();
  });

  it('shows only personas a cargo (userId === null) and writes a burial on confirm', async () => {
    const onChanged = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <BuryFab municipalityId="m1" placeId="c1" userId="u1" buriedHereIds={[]} onChanged={onChanged} />,
    );
    fireEvent.press(getByTestId('bury-fab'));
    await waitFor(() => expect(getByTestId('buried-persona-dep')).toBeTruthy());
    // Own persona is filtered out.
    expect(queryByTestId('buried-persona-own')).toBeNull();

    fireEvent.press(getByTestId('buried-persona-dep'));
    fireEvent.press(getByTestId('buried-confirm'));

    await waitFor(() =>
      expect(personService.updatePerson).toHaveBeenCalledWith('dep', {
        burialPlace: { municipalityId: 'm1', placeId: 'c1' },
        deathDate: null,
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('auto-advances to the date phase for the first persona a cargo created from zero', async () => {
    asMock(personService.getPersonsByCreator)
      .mockResolvedValueOnce([]) // initial focus load: zero personas a cargo
      .mockResolvedValueOnce([
        { id: 'new-dep', userId: null, givenName: 'Nueva', middleNames: [], firstSurname: 'Persona', secondSurname: null, nickname: null },
      ]); // focus reload after returning from /person/new

    const { getByTestId } = render(
      <BuryFab municipalityId="m1" placeId="c1" userId="u1" buriedHereIds={[]} onChanged={jest.fn()} />,
    );

    fireEvent.press(getByTestId('bury-fab'));
    await waitFor(() => expect(getByTestId('buried-create')).toBeTruthy());

    fireEvent.press(getByTestId('buried-create'));

    await waitFor(() => expect(getByTestId('buried-confirm')).toBeTruthy());
  });
});

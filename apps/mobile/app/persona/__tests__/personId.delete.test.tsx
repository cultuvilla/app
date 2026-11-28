import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import PersonDetailScreen from '../[personId]';

// Persona delete lives in the edit-screen header (DeleteHeaderButton). It is a
// hard delete, shown ONLY for a dependent persona the caller created
// (createdBy == uid && userId == null) — matching the persons delete rule.

const basePerson = {
  id: 'p-1',
  givenName: 'Ana',
  middleNames: [],
  firstSurname: 'Gil',
  secondSurname: null,
  nickname: null,
  sex: null,
  birthday: null,
  birthPlace: null,
  municipalityLinks: [],
  biography: null,
  occupations: [],
  photoURL: null,
};

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@cultuvilla/shared/services/personService', () =>
  jest
    .requireActual<typeof import('../../../test/fakeModule')>('../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/personService')>(
      '@cultuvilla/shared/services/personService',
      () => ({
        createPerson: jest.fn(),
        getPerson: jest.fn(),
        updatePerson: jest.fn(),
        deletePerson: jest.fn().mockResolvedValue(undefined),
      }),
    ),
);
jest.mock('@cultuvilla/shared/services/imageService', () =>
  jest
    .requireActual<typeof import('../../../test/fakeModule')>('../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/imageService')>(
      '@cultuvilla/shared/services/imageService',
      () => ({ uploadUserPhoto: jest.fn() }),
    ),
);
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'uid-1' }, profile: { activeMunicipalityId: null } }),
}));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ personId: 'p-1', edit: '1' }),
}));
// Stub the heavy form + residence editors so the screen renders standalone.
jest.mock('../../../components/feature/PersonForm', () => ({ PersonForm: () => null }));
jest.mock('../../../components/feature/MembershipVillageEditor', () => ({ MembershipVillageEditor: () => null }));
jest.mock('../../../components/feature/ResidenceLinksEditor', () => ({ ResidenceLinksEditor: () => null }));

describe('PersonDetailScreen — persona delete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
  });

  it('shows delete for a dependent persona and hard-deletes on confirm', async () => {
    const personService = require('@cultuvilla/shared/services/personService');
    (personService.getPerson as jest.Mock).mockResolvedValue({ ...basePerson, createdBy: 'uid-1', userId: null });
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, btns) => {
      btns?.find((b) => b.style === 'destructive')?.onPress?.();
    });

    const { findByLabelText } = render(<PersonDetailScreen />);
    fireEvent.press(await findByLabelText('common.delete'));
    await waitFor(() => expect(personService.deletePerson).toHaveBeenCalledWith('p-1'));
    spy.mockRestore();
  });

  it('hides delete for the caller’s own account-persona', async () => {
    const personService = require('@cultuvilla/shared/services/personService');
    (personService.getPerson as jest.Mock).mockResolvedValue({ ...basePerson, createdBy: 'uid-1', userId: 'uid-1' });

    const { queryByLabelText } = render(<PersonDetailScreen />);
    await waitFor(() => expect(personService.getPerson).toHaveBeenCalled());
    expect(queryByLabelText('common.delete')).toBeNull();
  });
});

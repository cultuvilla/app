import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import OrganizeVillageScreen from '../[municipalityId]';

// Vary the profile per test (must be `mock`-prefixed to be usable in a jest factory).
let mockProfile: { telephone: string | null; displayName?: string } | null = null;
let mockPerson: Record<string, unknown> | null = null;
let mockMunicipality: Record<string, unknown> | null = null;

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ municipalityId: 'muni-1' }),
}));
jest.mock('../../../../lib/auth/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'uid-1' }, profile: mockProfile }),
}));
jest.mock('@cultuvilla/shared/services/organizerRequestService', () => ({
  requestOrganizeVillage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/userService', () => ({
  patchUserProfile: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/personService', () => ({
  watchPersonByUserId: jest.fn((_uid: string, _viewer: string, onNext: (p: unknown) => void) => {
    onNext(mockPerson);
    return () => {};
  }),
}));
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  watchMunicipality: jest.fn((_id: string, onNext: (m: unknown) => void) => {
    onNext(mockMunicipality);
    return () => {};
  }),
}));
// Thin useCallable so the real submit callable runs and we can assert on the services.
jest.mock('../../../../lib/useCallable', () => ({
  useCallable: (opts: { callable: (...a: unknown[]) => Promise<unknown>; onSuccess?: (r: unknown) => void }) => ({
    fire: async (...args: unknown[]) => {
      const r = await opts.callable(...args);
      await opts.onSuccess?.(r);
      return r;
    },
    isPending: false,
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));

describe('OrganizeVillageScreen phone field', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfile = null;
    mockPerson = null;
    mockMunicipality = null;
  });

  it('keeps the invalid-phone error hidden until Confirmar/submit is pressed', async () => {
    const organizerRequestService = require('@cultuvilla/shared/services/organizerRequestService');
    const { getByTestId, queryByText, getByText } = render(<OrganizeVillageScreen />);

    fireEvent.changeText(getByTestId('organizer-phone'), '123'); // invalid for +34
    expect(queryByText('event.register.phoneInvalid')).toBeNull();

    await act(async () => {
      fireEvent.press(getByTestId('organize-submit'));
    });
    expect(getByText('event.register.phoneInvalid')).toBeTruthy();
    expect(organizerRequestService.requestOrganizeVillage).not.toHaveBeenCalled();
  });

  it('submits the phone in E.164 form and files the organizer request', async () => {
    const organizerRequestService = require('@cultuvilla/shared/services/organizerRequestService');
    const userService = require('@cultuvilla/shared/services/userService');
    const { getByTestId } = render(<OrganizeVillageScreen />);

    fireEvent.changeText(getByTestId('organizer-phone'), '600 111 222');
    await act(async () => {
      fireEvent.press(getByTestId('organize-submit'));
    });

    await waitFor(() => {
      expect(userService.patchUserProfile).toHaveBeenCalledWith('uid-1', { telephone: '+34600111222' });
    });
    expect(organizerRequestService.requestOrganizeVillage).toHaveBeenCalledWith({
      municipalityId: 'muni-1',
      motivation: null,
    });
  });

  it('prefills the national part and prefix from a stored E.164 telephone', () => {
    mockProfile = { telephone: '+34612345678' };
    const { getByTestId } = render(<OrganizeVillageScreen />);
    expect(getByTestId('organizer-phone').props.value).toBe('612345678');
    expect(getByTestId('organizer-phone-prefix')).toBeTruthy();
  });
});

describe('OrganizeVillageScreen carnet preview', () => {
  const municipality = {
    id: 'muni-1',
    name: 'Matabuena',
    escudoUrl: null,
    escudoThumbUrl: null,
    escudoManualUrl: null,
  };
  const person = {
    id: 'p-1',
    givenName: 'Lucía',
    middleNames: [],
    firstSurname: 'Martín',
    secondSurname: null,
    sex: 'female',
    photoURL: 'https://example.com/lucia.jpg',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockProfile = { telephone: null, displayName: 'Lucía Martín' };
    mockPerson = null;
    mockMunicipality = null;
  });

  it('shows the applicant their own carnet for this pueblo', () => {
    mockPerson = person;
    mockMunicipality = municipality;
    const { getByTestId, queryByTestId } = render(<OrganizeVillageScreen />);
    expect(getByTestId('organize-carnet')).toBeTruthy();
    expect(getByTestId('ambassador-carnet-name')).toHaveTextContent('Lucía Martín');
    expect(getByTestId('avatar-ambassador-seal')).toBeTruthy();
    expect(queryByTestId('organize-carnet-add-photo')).toBeNull();
  });

  it('nudges an applicant without a photo towards their profile', () => {
    const { router } = require('expo-router');
    mockPerson = { ...person, photoURL: null };
    mockMunicipality = municipality;
    const { getByTestId } = render(<OrganizeVillageScreen />);
    fireEvent.press(getByTestId('organize-carnet-add-photo'));
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('waits for the pueblo before drawing the carnet', () => {
    mockPerson = person;
    const { queryByTestId } = render(<OrganizeVillageScreen />);
    expect(queryByTestId('organize-carnet')).toBeNull();
  });
});

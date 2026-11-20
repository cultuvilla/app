import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import CompleteProfileScreen from '../completar-perfil';
import { observability } from '@cultuvilla/shared';

jest.mock('@cultuvilla/shared', () => ({
  ...jest.requireActual('@cultuvilla/shared'),
  observability: { trackEvent: jest.fn() },
}));
jest.mock('@cultuvilla/shared/services/personService', () => ({
  createPerson: jest.fn().mockResolvedValue('person-1'),
  updatePerson: jest.fn().mockResolvedValue(undefined),
  getPersonByUserId: jest.fn().mockResolvedValue(null),
  updateResidenceBarrio: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/userService', () => ({
  createUserProfile: jest.fn().mockResolvedValue(undefined),
  patchUserProfile: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/villageMemberService', () => ({
  ensureVillageMembership: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/occupationService', () => ({
  recordOccupation: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/imageService', () => ({
  uploadUserPhoto: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  getMunicipality: jest.fn().mockResolvedValue(null),
  getBarrios: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../lib/auth/pendingVillage', () => ({
  readPendingVillage: jest.fn().mockResolvedValue(null),
  clearPendingVillage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockAbandonSignUp = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'uid-1', email: 'a@b.test', displayName: null },
    profile: null,
    refreshProfile: jest.fn().mockResolvedValue(undefined),
    abandonSignUp: mockAbandonSignUp,
  }),
}));
// Auto-accept the confirm so the escape hatch can be exercised headlessly.
jest.mock('../../../lib/dialogs', () => ({
  showConfirm: jest.fn((_title: string, _body: string, onConfirm: () => void) => onConfirm()),
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));
jest.mock('../../../lib/i18n', () => ({
  useT: () => ({
    locale: 'es',
    t: (key: string) => {
      const map: Record<string, string> = {
        'onboarding.completeProfile.title': 'Completa tu perfil',
        'onboarding.completeProfile.accountSection': 'Tu cuenta',
        'onboarding.completeProfile.telephone': 'Teléfono (opcional)',
        'onboarding.completeProfile.village': 'Tu pueblo (opcional)',
        'onboarding.completeProfile.givenName': 'Nombre',
        'onboarding.completeProfile.firstSurname': 'Primer apellido',
        'onboarding.completeProfile.secondSurname': 'Segundo apellido (opcional)',
        'onboarding.completeProfile.photo': 'Foto de perfil (opcional)',
        'onboarding.completeProfile.nickname': 'Apodo (opcional)',
        'onboarding.completeProfile.sex': 'Sexo (opcional)',
        'onboarding.completeProfile.sex_female': 'Mujer',
        'onboarding.completeProfile.sex_male': 'Hombre',
        'onboarding.completeProfile.sex_other': 'Otro',
        'onboarding.completeProfile.birthday': 'Fecha de nacimiento',
        'onboarding.completeProfile.birthPlace': 'Lugar de nacimiento (opcional)',
        'onboarding.completeProfile.biography': 'Biografía (opcional)',
        'onboarding.completeProfile.submit': 'Crear perfil',
        'onboarding.completeProfile.requiredFields': 'El nombre y el primer apellido son obligatorios.',
        'onboarding.completeProfile.error': 'No se pudo guardar el perfil',
        'profile.personForm.stepIdentity': 'Identidad',
        'profile.personForm.stepResidence': 'Origen y residencia',
        'profile.personForm.stepAbout': 'Sobre ti',
        'profile.personForm.village': 'Tu pueblo (opcional)',
        'profile.personForm.barrio': 'Barrio (opcional)',
        'profile.personForm.wholeVillage': 'Todo el pueblo',
        'auth.signOut': 'Cerrar sesión',
        'common.cancel': 'Cancelar',
        'common.stepper.next': 'Siguiente',
        'common.stepper.back': 'Atrás',
      };
      return map[key] ?? key;
    },
  }),
}));

describe('CompleteProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks doesn't reset implementations, so restore the no-village
    // default each test — otherwise a per-test override leaks forward.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pendingVillage = require('../../../lib/auth/pendingVillage');
    (pendingVillage.readPendingVillage as jest.Mock).mockResolvedValue(null);
  });

  it('rejects submit when name or surnames are empty (stays on step 1)', async () => {
    const { getByText, queryByText } = render(<CompleteProfileScreen />);
    // On step 1, press Next without filling in any name.
    await act(async () => {
      fireEvent.press(getByText('Siguiente'));
    });
    // Still on the identity step — residence step is not shown.
    expect(queryByText('Origen y residencia')).toBeNull();
  });

  it('writes person first, then account; displayName is set by the Cloud Function trigger', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const personService = require('@cultuvilla/shared/services/personService');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const userService = require('@cultuvilla/shared/services/userService');
    const order: string[] = [];
    (personService.createPerson as jest.Mock).mockImplementation(async () => { order.push('person'); return 'person-1'; });
    (userService.createUserProfile as jest.Mock).mockImplementation(async () => { order.push('user'); });

    const { getByText, getByLabelText, getByTestId } = render(<CompleteProfileScreen />);

    // Step 1: fill identity fields.
    fireEvent.changeText(getByLabelText('Nombre'), 'Ana');
    fireEvent.changeText(getByLabelText('Primer apellido'), 'García');
    fireEvent.changeText(getByLabelText('Segundo apellido (opcional)'), 'López');
    fireEvent.press(getByText('Mujer')); // sex is required to advance
    // Terms acceptance lives at the end of step 1, which is gated on it.
    fireEvent.press(getByTestId('accept-terms'));
    fireEvent.press(getByText('Siguiente'));

    // Step 2: fill birthday (required when requireFirstSurname=true).
    fireEvent.press(getByTestId('birthday-year'));
    fireEvent.press(getByTestId('birthday-year-option-1990'));
    fireEvent.press(getByTestId('birthday-month'));
    fireEvent.press(getByTestId('birthday-month-option-4'));
    fireEvent.press(getByTestId('birthday-day'));
    fireEvent.press(getByTestId('birthday-day-option-5'));
    fireEvent.press(getByText('Siguiente'));

    // Step 3: submit.
    await act(async () => {
      fireEvent.press(getByText('Crear perfil'));
    });

    await waitFor(() => {
      expect(order).toEqual(['person', 'user']);
    });
    expect(personService.createPerson).toHaveBeenCalledWith(
      expect.objectContaining({
        givenName: 'Ana',
        firstSurname: 'García',
        secondSurname: 'López',
        birthday: { year: 1990, month: 5, day: 5 },
        userId: 'uid-1',
        createdBy: 'uid-1',
      }),
    );
    expect(userService.createUserProfile).toHaveBeenCalledWith(
      'uid-1',
      expect.objectContaining({ personId: 'person-1', termsVersion: '1.0' }),
    );
    // Client must NOT send displayName — firestore.rules forbid it and the
    // trigger (functions/src/users/syncPersonDenormalization.ts) is the only writer.
    const userArgs = (userService.createUserProfile as jest.Mock).mock.calls[0][1];
    expect(userArgs).not.toHaveProperty('displayName');
  });

  it('lets a person with one surname finish (second surname is optional, stored as null)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const personService = require('@cultuvilla/shared/services/personService');
    const { getByText, getByLabelText, getByTestId } = render(<CompleteProfileScreen />);

    fireEvent.changeText(getByLabelText('Nombre'), 'Ana');
    fireEvent.changeText(getByLabelText('Primer apellido'), 'García');
    fireEvent.press(getByText('Mujer'));
    fireEvent.press(getByTestId('accept-terms'));
    fireEvent.press(getByText('Siguiente'));

    fireEvent.press(getByTestId('birthday-year'));
    fireEvent.press(getByTestId('birthday-year-option-1990'));
    fireEvent.press(getByTestId('birthday-month'));
    fireEvent.press(getByTestId('birthday-month-option-4'));
    fireEvent.press(getByTestId('birthday-day'));
    fireEvent.press(getByTestId('birthday-day-option-5'));
    fireEvent.press(getByText('Siguiente'));

    await act(async () => {
      fireEvent.press(getByText('Crear perfil'));
    });

    await waitFor(() => {
      expect(personService.createPerson).toHaveBeenCalledWith(
        expect.objectContaining({ givenName: 'Ana', firstSurname: 'García', secondSurname: null }),
      );
    });
  });

  it('creates the user doc before joining a village (users/{uid} must exist before setActiveMunicipality)', async () => {
    // Regression: joinVillage -> setActiveMunicipality does an updateDoc on
    // users/{uid}. If that runs before the profile write creates the doc, the
    // update rule dereferences a null `resource.data` and Firestore denies it
    // ("Missing or insufficient permissions"), aborting onboarding. So the
    // account write MUST precede the village membership write.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const personService = require('@cultuvilla/shared/services/personService');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const userService = require('@cultuvilla/shared/services/userService');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const villageMemberService = require('@cultuvilla/shared/services/villageMemberService');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pendingVillage = require('../../../lib/auth/pendingVillage');

    // A village picked at registration (arrives via the pendingVillage seam) so
    // ensureVillageMembership runs during submit.
    (pendingVillage.readPendingVillage as jest.Mock).mockResolvedValue('muni-1');

    const order: string[] = [];
    (personService.createPerson as jest.Mock).mockImplementation(async () => { order.push('person'); return 'person-1'; });
    (userService.createUserProfile as jest.Mock).mockImplementation(async () => { order.push('user'); });
    (villageMemberService.ensureVillageMembership as jest.Mock).mockImplementation(async () => { order.push('village'); });

    const { getByText, getByLabelText, getByTestId } = render(<CompleteProfileScreen />);
    // Let the mount effect resolve readPendingVillage and commit municipalityId
    // before we submit, so ensureVillageMembership actually runs.
    await act(async () => { await Promise.resolve(); });

    fireEvent.changeText(getByLabelText('Nombre'), 'Ana');
    fireEvent.changeText(getByLabelText('Primer apellido'), 'García');
    fireEvent.changeText(getByLabelText('Segundo apellido (opcional)'), 'López');
    fireEvent.press(getByText('Mujer'));
    // Terms acceptance lives at the end of step 1, which is gated on it.
    fireEvent.press(getByTestId('accept-terms'));
    fireEvent.press(getByText('Siguiente'));

    fireEvent.press(getByTestId('birthday-year'));
    fireEvent.press(getByTestId('birthday-year-option-1990'));
    fireEvent.press(getByTestId('birthday-month'));
    fireEvent.press(getByTestId('birthday-month-option-4'));
    fireEvent.press(getByTestId('birthday-day'));
    fireEvent.press(getByTestId('birthday-day-option-5'));
    fireEvent.press(getByText('Siguiente'));

    await act(async () => {
      fireEvent.press(getByText('Crear perfil'));
    });

    await waitFor(() => {
      expect(villageMemberService.ensureVillageMembership).toHaveBeenCalled();
      expect(userService.createUserProfile).toHaveBeenCalled();
    });
    // The account doc must be written before the village membership.
    expect(order.indexOf('user')).toBeLessThan(order.indexOf('village'));
    expect(order).toEqual(['person', 'user', 'village']);
    expect(observability.trackEvent).toHaveBeenCalledWith(
      'onboarding.complete.success',
      { municipalityId: 'muni-1' },
    );
  });

  it('does not advance past step 1 until the terms are accepted', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const userService = require('@cultuvilla/shared/services/userService');

    const { getByText, getByLabelText, queryByTestId } = render(<CompleteProfileScreen />);

    fireEvent.changeText(getByLabelText('Nombre'), 'Ana');
    fireEvent.changeText(getByLabelText('Primer apellido'), 'García');
    fireEvent.changeText(getByLabelText('Segundo apellido (opcional)'), 'López');
    fireEvent.press(getByText('Mujer'));
    // Terms live at the end of step 1 and gate it: pressing Next without
    // accepting them must keep us on step 1 (birthday belongs to step 2).
    await act(async () => {
      fireEvent.press(getByText('Siguiente'));
    });

    expect(queryByTestId('birthday-year')).toBeNull();
    expect(userService.createUserProfile).not.toHaveBeenCalled();
  });

  it('asks nothing about usage statistics — the full-screen page asks later', () => {
    const { queryByTestId } = render(<CompleteProfileScreen />);
    expect(queryByTestId('accept-terms')).toBeTruthy();
    expect(queryByTestId('analytics-consent-yes')).toBeNull();
    expect(queryByTestId('analytics-consent-no')).toBeNull();
  });

  it('does not offer under-14 birth years in the picker (self-registration age gate)', async () => {
    const { getByText, getByLabelText, getByTestId, queryByTestId } = render(<CompleteProfileScreen />);

    fireEvent.changeText(getByLabelText('Nombre'), 'Ana');
    fireEvent.changeText(getByLabelText('Primer apellido'), 'García');
    fireEvent.changeText(getByLabelText('Segundo apellido (opcional)'), 'López');
    fireEvent.press(getByText('Mujer'));
    // Terms acceptance lives at the end of step 1, which is gated on it.
    fireEvent.press(getByTestId('accept-terms'));
    fireEvent.press(getByText('Siguiente'));

    fireEvent.press(getByTestId('birthday-year'));

    // The current year (age 0) must not be selectable; a comfortably-old year is.
    const thisYear = new Date().getFullYear();
    expect(queryByTestId(`birthday-year-option-${thisYear}`)).toBeNull();
    expect(queryByTestId(`birthday-year-option-${thisYear - 20}`)).not.toBeNull();
  });

  it('offers a sign-out escape hatch — the screen is the only route a wrong-email sign-in can reach', () => {
    const { getByTestId } = render(<CompleteProfileScreen />);

    fireEvent.press(getByTestId('onboarding-abandon'));

    expect(mockAbandonSignUp).toHaveBeenCalledTimes(1);
  });
});

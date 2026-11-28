// apps/mobile/components/feature/__tests__/RegisterFabBirthYear.test.tsx
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { RegisterFab } from '../RegisterFab';
import {
  getUserRegistrations,
  registerToEvent,
  getMySeatTokens,
  getGroupRegistrations,
} from '@cultuvilla/shared/services/registrationService';
import { getPersonsByCreator } from '@cultuvilla/shared/services/personService';
import { showConfirm } from '../../../lib/dialogs';
import type { DeepLink } from '@cultuvilla/shared/services/deepLinkService';
import { partialOf } from '../../../test/fakeModule';

const mockOfferPush = jest.fn();
jest.mock('../../../lib/push/PushProvider', () => ({
  usePush: () => ({
    offerPush: mockOfferPush,
    permission: 'undetermined',
    refreshPermission: jest.fn(),
    requestPermission: jest.fn(),
  }),
}));
jest.mock('../../../lib/registrations/MyRegistrationsContext', () => ({
  useMyRegistrations: () => ({ ribbonFor: () => null, refresh: jest.fn() }),
}));
jest.mock('@cultuvilla/shared', () => ({
  ...jest.requireActual('@cultuvilla/shared'),
  observability: { trackEvent: jest.fn() },
}));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// Unlike the sibling suite, this one keeps the confirm dialog inert so each
// test decides whether the user said yes.
jest.mock('../../../lib/dialogs', () => ({ showConfirm: jest.fn(), showAlert: jest.fn() }));
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn() },
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
  };
});
jest.mock('@cultuvilla/shared/services/registrationService', () =>
  jest
    .requireActual<typeof import('../../../test/fakeModule')>('../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/registrationService')>(
      '@cultuvilla/shared/services/registrationService',
    ),
);
const mockSeatLink = partialOf<DeepLink>({ url: 'https://x.test', kind: 'invite', resource: 'event' });
jest.mock('@cultuvilla/shared/services/deepLinkService', () =>
  jest
    .requireActual<typeof import('../../../test/fakeModule')>('../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/deepLinkService')>(
      '@cultuvilla/shared/services/deepLinkService',
      () => ({
        getSeatClaimLink: () => mockSeatLink,
      }),
    ),
);
jest.mock('../../../lib/deeplink/useShareDeepLink', () => ({
  useShareDeepLink: () => jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/personService', () =>
  jest
    .requireActual<typeof import('../../../test/fakeModule')>('../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/personService')>(
      '@cultuvilla/shared/services/personService',
    ),
);

const mockShowConfirm = showConfirm as jest.Mock;
const mockRegisterToEvent = registerToEvent as jest.Mock;
const mockGetPersonsByCreator = getPersonsByCreator as jest.Mock;

/** Accept whatever the component last asked to confirm. */
function acceptConfirm() {
  const onConfirm = mockShowConfirm.mock.calls.at(-1)?.[2] as () => void;
  act(() => {
    onConfirm();
  });
}

const baseProps = {
  eventId: 'e1',
  userId: 'u1',
  personId: 'p1',
  name: 'Ana',
  eventTitle: 'Taller infantil', villageSlug: 'villa', visibilityOrgId: null,
  telephoneRequired: false,
};

// A children's taller: born 2014–2020.
const kidsWindow = { minBirthYear: 2014, maxBirthYear: 2020 };

const kid = {
  id: 'p2',
  givenName: 'Hijo',
  middleNames: [],
  nickname: null,
  firstSurname: 'García',
  secondSurname: null,
  userId: null,
  birthday: { year: 2016, month: 3, day: 2 },
};
const teen = { ...kid, id: 'p3', givenName: 'Mayor', birthday: { year: 2005, month: 1, day: 1 } };
const undated = { ...kid, id: 'p4', givenName: 'Sinfecha', birthday: null };

beforeEach(() => {
  jest.clearAllMocks();
  (getUserRegistrations as jest.Mock).mockResolvedValue([]);
  mockGetPersonsByCreator.mockResolvedValue([]);
  (getMySeatTokens as jest.Mock).mockResolvedValue([]);
  (getGroupRegistrations as jest.Mock).mockResolvedValue([]);
  mockRegisterToEvent.mockResolvedValue({ registrations: [], openSeats: [] });
});

describe('RegisterFab — birth-year window', () => {
  it('registers without asking when the event advertises no window', async () => {
    mockGetPersonsByCreator.mockResolvedValue([teen]);
    const { getByTestId, getByText } = render(<RegisterFab {...baseProps} ownBirthYear={1990} />);
    await waitFor(() => expect(getByText('event.register.cta')).toBeTruthy());

    fireEvent.press(getByTestId('register-fab'));
    fireEvent.press(getByTestId('attendee-row-p3'));
    fireEvent.press(getByTestId('attendee-confirm'));

    await waitFor(() => expect(mockRegisterToEvent).toHaveBeenCalled());
    expect(mockShowConfirm).not.toHaveBeenCalled();
  });

  it('registers without asking when every selected persona is inside the window', async () => {
    mockGetPersonsByCreator.mockResolvedValue([kid]);
    const { getByTestId, getByText } = render(
      <RegisterFab {...baseProps} ownBirthYear={1985} birthYearWindow={kidsWindow} />,
    );
    await waitFor(() => expect(getByText('event.register.cta')).toBeTruthy());

    fireEvent.press(getByTestId('register-fab'));
    fireEvent.press(getByTestId('attendee-row-p2'));
    fireEvent.press(getByTestId('attendee-confirm'));

    await waitFor(() => expect(mockRegisterToEvent).toHaveBeenCalled());
    expect(mockShowConfirm).not.toHaveBeenCalled();
  });

  it('asks to confirm — and registers on yes — when a persona is outside the window', async () => {
    mockGetPersonsByCreator.mockResolvedValue([teen]);
    const { getByTestId, getByText } = render(
      <RegisterFab {...baseProps} ownBirthYear={1985} birthYearWindow={kidsWindow} />,
    );
    await waitFor(() => expect(getByText('event.register.cta')).toBeTruthy());

    fireEvent.press(getByTestId('register-fab'));
    fireEvent.press(getByTestId('attendee-row-p3'));
    fireEvent.press(getByTestId('attendee-confirm'));

    expect(mockShowConfirm).toHaveBeenCalledTimes(1);
    expect(mockShowConfirm.mock.calls[0]?.[0]).toBe('event.register.birthYearTitle');
    expect(mockRegisterToEvent).not.toHaveBeenCalled();

    acceptConfirm();
    await waitFor(() =>
      expect(mockRegisterToEvent).toHaveBeenCalledWith('e1', [
        { personId: 'p3', name: 'Mayor García' },
      ]),
    );
  });

  it('registers nobody when the user backs out of the confirm', async () => {
    mockGetPersonsByCreator.mockResolvedValue([teen]);
    const { getByTestId, getByText } = render(
      <RegisterFab {...baseProps} ownBirthYear={1985} birthYearWindow={kidsWindow} />,
    );
    await waitFor(() => expect(getByText('event.register.cta')).toBeTruthy());

    fireEvent.press(getByTestId('register-fab'));
    fireEvent.press(getByTestId('attendee-row-p3'));
    fireEvent.press(getByTestId('attendee-confirm'));

    expect(mockShowConfirm).toHaveBeenCalledTimes(1);
    // The dialog mock never calls back, i.e. the user cancelled.
    expect(mockRegisterToEvent).not.toHaveBeenCalled();
  });

  it('flags the caller themselves, not just their dependents', async () => {
    const { getByTestId, getByText } = render(
      <RegisterFab {...baseProps} ownBirthYear={1985} birthYearWindow={kidsWindow} />,
    );
    await waitFor(() => expect(getByText('event.register.cta')).toBeTruthy());

    fireEvent.press(getByTestId('register-fab'));
    fireEvent.press(getByTestId('attendee-row-p1'));
    fireEvent.press(getByTestId('attendee-confirm'));

    expect(mockShowConfirm).toHaveBeenCalledTimes(1);
  });

  it('never asks about a persona with no recorded birth year', async () => {
    mockGetPersonsByCreator.mockResolvedValue([undated]);
    const { getByTestId, getByText } = render(
      <RegisterFab {...baseProps} ownBirthYear={2016} birthYearWindow={kidsWindow} />,
    );
    await waitFor(() => expect(getByText('event.register.cta')).toBeTruthy());

    fireEvent.press(getByTestId('register-fab'));
    fireEvent.press(getByTestId('attendee-row-p4'));
    fireEvent.press(getByTestId('attendee-confirm'));

    await waitFor(() => expect(mockRegisterToEvent).toHaveBeenCalled());
    expect(mockShowConfirm).not.toHaveBeenCalled();
  });

  it('does not re-ask about a persona who is already registered', async () => {
    // The teen is out of range but already on the roster; ticking a second,
    // in-range persona must not drag them back through the prompt.
    (getUserRegistrations as jest.Mock).mockResolvedValue([
      { id: 'rA', personId: 'p3', status: 'confirmed' },
    ]);
    mockGetPersonsByCreator.mockResolvedValue([kid, teen]);
    const { getByTestId, getByText } = render(
      <RegisterFab {...baseProps} ownBirthYear={1985} birthYearWindow={kidsWindow} />,
    );
    await waitFor(() => expect(getByText('event.register.signedUpCount')).toBeTruthy());

    fireEvent.press(getByTestId('register-fab'));
    fireEvent.press(getByTestId('attendee-row-p2'));
    fireEvent.press(getByTestId('attendee-confirm'));

    await waitFor(() => expect(mockRegisterToEvent).toHaveBeenCalled());
    expect(mockShowConfirm).not.toHaveBeenCalled();
  });
});

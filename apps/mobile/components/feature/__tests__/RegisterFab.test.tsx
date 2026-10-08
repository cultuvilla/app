// apps/mobile/components/feature/__tests__/RegisterFab.test.tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { RegisterFab } from '../RegisterFab';
import {
  getUserRegistrations,
  registerToEvent,
  getMySeatTokens,
  getGroupRegistrations,
  cancelRegistration,
} from '@cultuvilla/shared/services/registrationService';
import { getPersonsByCreator } from '@cultuvilla/shared/services/personService';
import { patchUserProfile } from '@cultuvilla/shared/services/userService';
import { observability } from '@cultuvilla/shared';

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
jest.mock('../../../lib/dialogs', () => ({
  showConfirm: (_t: string, _m: string, onConfirm: () => void) => onConfirm(),
  showAlert: jest.fn(),
}));
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn() },
    // Run the focus callback once after mount, like a real initial focus.
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
  };
});
jest.mock('@cultuvilla/shared/services/registrationService', () => ({
  getUserRegistrations: jest.fn(),
  registerToEvent: jest.fn(),
  cancelRegistration: jest.fn(),
  getMySeatTokens: jest.fn(),
  getGroupRegistrations: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/deepLinkService', () => ({
  getSeatClaimLink: (target: { id: string; title: string; villageSlug: string }, token: string) => {
    const { seatClaimPath } = jest.requireActual('@cultuvilla/shared/utils');
    const path = seatClaimPath(target, token);
    return { url: `https://x.test${path}`, path, kind: 'invite', resource: 'event' };
  },
}));
jest.mock('../../../lib/deeplink/useShareDeepLink', () => ({
  useShareDeepLink: () => mockShareDeepLink,
}));
const mockShareDeepLink = jest.fn().mockResolvedValue(undefined);
jest.mock('@cultuvilla/shared/services/userService', () => ({ patchUserProfile: jest.fn() }));
jest.mock('@cultuvilla/shared/services/personService', () => ({
  getPersonsByCreator: jest.fn(),
}));

const mockGetUserRegistrations = getUserRegistrations as jest.Mock;
const mockRegisterToEvent = registerToEvent as jest.Mock;
const mockCancelRegistration = cancelRegistration as jest.Mock;
const mockGetPersonsByCreator = getPersonsByCreator as jest.Mock;

/** registerToEvent resolves { registrations, openSeats } since group sign-ups. */
function wrapRegs(registrations: unknown[]) {
  return { registrations, openSeats: [] };
}

const baseProps = {
  eventId: 'e1',
  userId: 'u1',
  personId: 'p1',
  name: 'Ana',
  eventTitle: 'Fiestas de San Juan', villageSlug: 'villa', visibilityOrgId: null,
  telephoneRequired: false,
};

// A dependent persona created by the user (shape used by buildNameWithNickname).
const dep = {
  id: 'p2',
  givenName: 'Hijo',
  middleNames: [],
  nickname: null,
  firstSurname: 'García',
  secondSurname: null,
  userId: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUserRegistrations.mockResolvedValue([]);
  mockGetPersonsByCreator.mockResolvedValue([]);
  (getMySeatTokens as jest.Mock).mockResolvedValue([]);
  (getGroupRegistrations as jest.Mock).mockResolvedValue([]);
  mockShareDeepLink.mockClear();
  (observability.trackEvent as jest.Mock).mockClear();
});

describe('RegisterFab', () => {
  it('shows the sign-up CTA and opens the attendee sheet on tap', async () => {
    const { getByTestId, getByText } = render(<RegisterFab {...baseProps} />);
    await waitFor(() => expect(getByText('event.register.cta')).toBeTruthy());

    fireEvent.press(getByTestId('register-fab'));
    // Sheet opened with the caller's own persona as a row.
    expect(getByTestId('attendee-row-p1')).toBeTruthy();
  });

  it('shows a group count label when personas are already registered', async () => {
    mockGetUserRegistrations.mockResolvedValue([{ id: 'rA', personId: 'p1', status: 'confirmed' }]);
    const { getByText } = render(<RegisterFab {...baseProps} />);
    await waitFor(() => expect(getByText('event.register.signedUpCount')).toBeTruthy());
  });

  it('shows two pills when the caller has both confirmed and waitlisted personas', async () => {
    mockGetUserRegistrations.mockResolvedValue([
      { id: 'rA', personId: 'p1', status: 'confirmed' },
      { id: 'rB', personId: 'p2', status: 'waitlisted' },
    ]);
    const { getByTestId, getByText } = render(<RegisterFab {...baseProps} />);
    await waitFor(() => expect(getByTestId('register-fab-waitlist')).toBeTruthy());
    // Confirmed pill (default testID) alongside the waitlist pill, each labelled.
    expect(getByTestId('register-fab')).toBeTruthy();
    expect(getByText('event.register.signedUpCount')).toBeTruthy();
    expect(getByText('event.register.waitlistedCount')).toBeTruthy();
  });

  it('shows only the waitlist pill when every persona is waitlisted', async () => {
    mockGetUserRegistrations.mockResolvedValue([{ id: 'rB', personId: 'p1', status: 'waitlisted' }]);
    const { getByTestId, queryByTestId, getByText } = render(<RegisterFab {...baseProps} />);
    await waitFor(() => expect(getByText('event.register.waitlistedCount')).toBeTruthy());
    // The waitlist pill claims the primary testID so the sheet is still openable.
    expect(getByTestId('register-fab')).toBeTruthy();
    expect(queryByTestId('register-fab-waitlist')).toBeNull();
  });

  it('registers newly-selected personas (self + dependent) in one call', async () => {
    mockGetPersonsByCreator.mockResolvedValue([dep]);
    mockRegisterToEvent.mockResolvedValue(wrapRegs([
      { id: 'rA', status: 'confirmed', position: 1, isMember: true },
      { id: 'rB', status: 'confirmed', position: 2, isMember: false },
    ]));
    const { getByTestId, getByText } = render(<RegisterFab {...baseProps} />);
    await waitFor(() => expect(getByText('event.register.cta')).toBeTruthy());

    fireEvent.press(getByTestId('register-fab'));
    fireEvent.press(getByTestId('attendee-row-p1'));
    fireEvent.press(getByTestId('attendee-row-p2'));
    fireEvent.press(getByTestId('attendee-confirm'));

    await waitFor(() =>
      expect(mockRegisterToEvent).toHaveBeenCalledWith('e1', [
        { personId: 'p1', name: 'Ana' },
        { personId: 'p2', name: 'Hijo García' },
      ]),
    );
    expect(observability.trackEvent).toHaveBeenCalledWith('event.signup.success', { villageId: undefined });
    // A booked seat is the moment the push soft ask earns its place.
    await waitFor(() => expect(mockOfferPush).toHaveBeenCalledWith('event_signup'));
  });

  it('saves a newly typed sign-up phone to the profile', async () => {
    mockGetPersonsByCreator.mockResolvedValue([]);
    mockRegisterToEvent.mockResolvedValue(wrapRegs([{ id: 'rA', status: 'confirmed', position: 1, isMember: true }]));
    (patchUserProfile as jest.Mock).mockResolvedValue(undefined);
    const onPhoneSaved = jest.fn();
    const { getByTestId, getByText } = render(
      <RegisterFab {...baseProps} telephoneRequired savedPhone={null} onPhoneSaved={onPhoneSaved} />,
    );
    await waitFor(() => expect(getByText('event.register.cta')).toBeTruthy());

    fireEvent.press(getByTestId('register-fab'));
    fireEvent.press(getByTestId('attendee-row-p1'));
    fireEvent.changeText(getByTestId('attendee-phone'), '600111222');
    fireEvent.press(getByTestId('attendee-confirm'));

    await waitFor(() => expect(patchUserProfile).toHaveBeenCalledWith('u1', { telephone: '+34600111222' }));
    await waitFor(() => expect(onPhoneSaved).toHaveBeenCalled());
  });

  it('does not rewrite the profile when the prefilled phone is kept', async () => {
    mockGetPersonsByCreator.mockResolvedValue([]);
    mockRegisterToEvent.mockResolvedValue(wrapRegs([{ id: 'rA', status: 'confirmed', position: 1, isMember: true }]));
    const { getByTestId, getByText } = render(
      <RegisterFab {...baseProps} telephoneRequired savedPhone="+34600111222" />,
    );
    await waitFor(() => expect(getByText('event.register.cta')).toBeTruthy());

    fireEvent.press(getByTestId('register-fab'));
    fireEvent.press(getByTestId('attendee-row-p1'));
    fireEvent.press(getByTestId('attendee-confirm'));

    await waitFor(() =>
      expect(mockRegisterToEvent).toHaveBeenCalledWith('e1', [{ personId: 'p1', name: 'Ana', phone: '+34600111222' }]),
    );
    expect(patchUserProfile).not.toHaveBeenCalled();
  });

  it('shows a dependent full name with the apodo in parentheses, not the apodo alone', async () => {
    const depNick = {
      id: 'p2',
      givenName: 'Jose',
      middleNames: [],
      nickname: 'Pepe',
      firstSurname: 'García',
      secondSurname: null,
      userId: null,
    };
    mockGetPersonsByCreator.mockResolvedValue([depNick]);
    const { getByTestId, getByText, queryByText } = render(<RegisterFab {...baseProps} />);
    await waitFor(() => expect(getByText('event.register.cta')).toBeTruthy());

    fireEvent.press(getByTestId('register-fab'));
    expect(getByText('Jose García (Pepe)')).toBeTruthy();
    expect(queryByText('Pepe')).toBeNull();
  });

  // Reproduces production data: getPersonsByCreator returns the caller's OWN
  // persona (createdBy == uid, userId == uid) alongside the dependents
  // (createdBy == uid, userId == null). Only the own persona must be dropped;
  // every dependent must appear as a tickable row.
  it('lists every dependent when the creator query also returns the own persona', async () => {
    const self = { id: 'p1', givenName: 'Ana', middleNames: [], nickname: null, firstSurname: 'López', secondSurname: null, userId: 'u1' };
    const dep1 = { id: 'p2', givenName: 'Jose', middleNames: [], nickname: null, firstSurname: 'García', secondSurname: null, userId: null };
    const dep2 = { id: 'p3', givenName: 'Jos', middleNames: [], nickname: null, firstSurname: 'Ruiz', secondSurname: null, userId: null };
    mockGetPersonsByCreator.mockResolvedValue([self, dep1, dep2]);
    const { getByTestId, getByText, queryByTestId } = render(<RegisterFab {...baseProps} />);
    await waitFor(() => expect(getByText('event.register.cta')).toBeTruthy());

    fireEvent.press(getByTestId('register-fab'));
    // Own persona rendered from props (once, not duplicated by the creator query).
    expect(getByTestId('attendee-row-p1')).toBeTruthy();
    // Both dependents must be listed.
    expect(getByTestId('attendee-row-p2')).toBeTruthy();
    expect(getByTestId('attendee-row-p3')).toBeTruthy();
    // And no second copy of the own persona.
    expect(queryByTestId('attendee-row-p1')).toBe(getByTestId('attendee-row-p1'));
  });

  // Regression: the two reads are independent, so a failing getUserRegistrations
  // (e.g. a missing Firestore index) must NOT blank the dependent list. Before
  // the fix they shared one Promise.all and a rejection hid every dependent.
  it('still lists dependents when getUserRegistrations rejects', async () => {
    mockGetUserRegistrations.mockRejectedValue(new Error('FAILED_PRECONDITION: missing index'));
    mockGetPersonsByCreator.mockResolvedValue([dep]);
    const { getByTestId, getByText } = render(<RegisterFab {...baseProps} />);
    await waitFor(() => expect(getByText('event.register.cta')).toBeTruthy());

    fireEvent.press(getByTestId('register-fab'));
    expect(getByTestId('attendee-row-p1')).toBeTruthy(); // self
    expect(getByTestId('attendee-row-p2')).toBeTruthy(); // dependent survives the reg failure
  });

  it('cancels a deselected registered persona after a single combined confirm', async () => {
    mockGetUserRegistrations.mockResolvedValue([
      { id: 'rA', personId: 'p1', status: 'confirmed' },
      { id: 'rB', personId: 'p2', status: 'confirmed' },
    ]);
    mockGetPersonsByCreator.mockResolvedValue([dep]);
    mockCancelRegistration.mockResolvedValue(undefined);
    const { getByTestId, getByText } = render(<RegisterFab {...baseProps} />);
    await waitFor(() => expect(getByText('event.register.signedUpCount')).toBeTruthy());

    fireEvent.press(getByTestId('register-fab'));
    fireEvent.press(getByTestId('attendee-row-p2')); // untick the dependent
    fireEvent.press(getByTestId('attendee-confirm'));

    await waitFor(() => expect(mockCancelRegistration).toHaveBeenCalledWith('e1', 'rB'));
  });

  it('threads the villageId prop into the success event', async () => {
    mockRegisterToEvent.mockResolvedValue(wrapRegs([{ id: 'rA', status: 'confirmed', position: 1, isMember: true }]));
    const { getByTestId, getByText } = render(<RegisterFab {...baseProps} villageId="m1" />);
    await waitFor(() => expect(getByText('event.register.cta')).toBeTruthy());

    fireEvent.press(getByTestId('register-fab'));
    fireEvent.press(getByTestId('attendee-row-p1'));
    fireEvent.press(getByTestId('attendee-confirm'));

    await waitFor(() =>
      expect(observability.trackEvent).toHaveBeenCalledWith('event.signup.success', { villageId: 'm1' }),
    );
  });

  // Regression: a failure in the post-signup cancel loop must NOT also fire
  // EVENT_SIGNUP_ERROR once the signup itself already succeeded — that would
  // record both a success and an error for the same operation.
  it('does not fire EVENT_SIGNUP_ERROR when signup succeeds but a later cancel fails', async () => {
    mockGetUserRegistrations.mockResolvedValue([{ id: 'rB', personId: 'p2', status: 'confirmed' }]);
    mockGetPersonsByCreator.mockResolvedValue([dep]);
    mockRegisterToEvent.mockResolvedValue(wrapRegs([{ id: 'rA', status: 'confirmed', position: 1, isMember: true }]));
    mockCancelRegistration.mockRejectedValue(new Error('cancel failed'));
    const { getByTestId, getByText } = render(<RegisterFab {...baseProps} />);
    await waitFor(() => expect(getByText('event.register.signedUpCount')).toBeTruthy());

    fireEvent.press(getByTestId('register-fab'));
    fireEvent.press(getByTestId('attendee-row-p1')); // add self
    fireEvent.press(getByTestId('attendee-row-p2')); // untick the dependent (triggers cancel)
    fireEvent.press(getByTestId('attendee-confirm'));

    await waitFor(() => expect(mockCancelRegistration).toHaveBeenCalled());
    expect(observability.trackEvent).toHaveBeenCalledWith('event.signup.success', { villageId: undefined });
    expect(observability.trackEvent).not.toHaveBeenCalledWith('event.signup.error', expect.anything());
  });
});

describe('RegisterFab — group sign-up', () => {
  const groupProps = { ...baseProps, groupSize: 2 };

  it('pre-ticks the caller and refuses to confirm until the group is exactly full', async () => {
    mockGetPersonsByCreator.mockResolvedValue([dep]);
    const { getByTestId } = render(<RegisterFab {...groupProps} />);
    await waitFor(() => expect(getByTestId('register-fab')).toBeTruthy());
    fireEvent.press(getByTestId('register-fab'));

    // The booker's own persona is seated without a tap — one of two seats
    // filled, so confirm stays disabled.
    await waitFor(() =>
      expect(getByTestId('group-row-p1').props.accessibilityState.checked).toBe(true),
    );
    expect(getByTestId('group-confirm').props.accessibilityState.disabled).toBe(true);

    fireEvent.press(getByTestId('group-row-p2'));
    expect(getByTestId('group-confirm').props.accessibilityState.disabled).toBe(false);
  });

  it('prefills the group phone and saves a changed one after the group is booked', async () => {
    mockGetPersonsByCreator.mockResolvedValue([dep]);
    mockRegisterToEvent.mockResolvedValue(wrapRegs([
      { id: 'rA', status: 'confirmed', position: 1, isMember: true },
      { id: 'rB', status: 'confirmed', position: 2, isMember: false },
    ]));
    (patchUserProfile as jest.Mock).mockResolvedValue(undefined);
    const onPhoneSaved = jest.fn();
    const { getByTestId } = render(
      <RegisterFab {...groupProps} telephoneRequired savedPhone="+34600111222" onPhoneSaved={onPhoneSaved} />,
    );
    await waitFor(() => expect(getByTestId('register-fab')).toBeTruthy());
    fireEvent.press(getByTestId('register-fab'));
    fireEvent.press(getByTestId('group-row-p2'));

    expect(getByTestId('group-phone').props.value).toBe('600111222');
    fireEvent.changeText(getByTestId('group-phone'), '600333444');
    fireEvent.press(getByTestId('group-confirm'));

    await waitFor(() =>
      expect(mockRegisterToEvent).toHaveBeenCalledWith(
        'e1',
        [
          { personId: 'p1', name: 'Ana', phone: '+34600333444' },
          { personId: 'p2', name: 'Hijo García', phone: '+34600333444' },
        ],
        0,
      ),
    );
    await waitFor(() => expect(patchUserProfile).toHaveBeenCalledWith('u1', { telephone: '+34600333444' }));
    await waitFor(() => expect(onPhoneSaved).toHaveBeenCalled());
  });

  it('books a persona plus an open seat and lands on the summary, not a share sheet', async () => {
    mockRegisterToEvent.mockResolvedValue({
      registrations: [
        { id: 'rA', status: 'confirmed', position: 1, isMember: true },
        { id: 'rB', status: 'confirmed', position: 2, isMember: false },
      ],
      openSeats: [{ registrationId: 'rB', token: 'tok_xyz' }],
    });
    // Empty on the first load (nothing booked yet), the booked group after.
    mockGetUserRegistrations.mockResolvedValue([
      { id: 'rA', personId: 'p1', name: 'Ana', status: 'confirmed', isOpenSeat: false },
      { id: 'rB', personId: '', name: 'Plaza libre', status: 'confirmed', isOpenSeat: true },
    ]);
    mockGetUserRegistrations.mockResolvedValueOnce([]);
    (getMySeatTokens as jest.Mock).mockResolvedValue([
      { token: 'tok_xyz', registrationId: 'rB', consumed: false },
    ]);
    const { getByTestId } = render(<RegisterFab {...groupProps} />);
    await waitFor(() => expect(getByTestId('register-fab')).toBeTruthy());
    fireEvent.press(getByTestId('register-fab'));

    // Own persona is already ticked; the open seat is a row, not a counter.
    await waitFor(() =>
      expect(getByTestId('group-row-p1').props.accessibilityState.checked).toBe(true),
    );
    fireEvent.press(getByTestId('group-open-seat-0'));
    expect(getByTestId('group-open-seat-0').props.accessibilityState.checked).toBe(true);

    fireEvent.press(getByTestId('group-confirm'));

    await waitFor(() =>
      expect(mockRegisterToEvent).toHaveBeenCalledWith(
        'e1',
        [{ personId: 'p1', name: 'Ana' }],
        1,
      ),
    );
    // The OS share sheet is no longer fired unasked — the summary's send-link
    // row is where the user chooses to hand the seat over.
    await waitFor(() => expect(getByTestId('group-summary')).toBeTruthy());
    expect(mockShareDeepLink).not.toHaveBeenCalled();
  });

  it('will not let the group overflow its size', async () => {
    mockGetPersonsByCreator.mockResolvedValue([dep]);
    const { getByTestId } = render(<RegisterFab {...groupProps} />);
    await waitFor(() => expect(getByTestId('register-fab')).toBeTruthy());
    fireEvent.press(getByTestId('register-fab'));

    await waitFor(() =>
      expect(getByTestId('group-row-p1').props.accessibilityState.checked).toBe(true),
    );
    fireEvent.press(getByTestId('group-row-p2'));
    // Group already full: ticking the open-seat row must refuse a third seat.
    fireEvent.press(getByTestId('group-open-seat-0'));
    expect(getByTestId('group-open-seat-0').props.accessibilityState.checked).toBe(false);
  });

  it('offers one open-seat row short of the group size', async () => {
    const { getByTestId, queryByTestId } = render(
      <RegisterFab {...baseProps} groupSize={3} />,
    );
    await waitFor(() => expect(getByTestId('register-fab')).toBeTruthy());
    fireEvent.press(getByTestId('register-fab'));

    // The booker occupies the third seat, so a group of pure open seats is
    // unreachable by construction.
    expect(getByTestId('group-open-seat-0')).toBeTruthy();
    expect(getByTestId('group-open-seat-1')).toBeTruthy();
    expect(queryByTestId('group-open-seat-2')).toBeNull();
  });

  it('shows the existing group with a share link instead of the builder', async () => {
    mockGetUserRegistrations.mockResolvedValue([
      { id: 'rA', personId: 'p1', name: 'Ana', status: 'confirmed', isOpenSeat: false },
      { id: 'rB', personId: '', name: 'Plaza libre', status: 'confirmed', isOpenSeat: true },
    ]);
    (getMySeatTokens as jest.Mock).mockResolvedValue([
      { token: 'tok_xyz', registrationId: 'rB', consumed: false },
    ]);
    const { getByTestId, queryByTestId } = render(<RegisterFab {...groupProps} />);
    await waitFor(() => expect(getByTestId('register-fab')).toBeTruthy());
    fireEvent.press(getByTestId('register-fab'));

    await waitFor(() => expect(getByTestId('group-summary')).toBeTruthy());
    expect(queryByTestId('group-confirm')).toBeNull();
    expect(getByTestId('group-share-rB')).toBeTruthy();
    // The claimed seat has no link to hand out.
    expect(queryByTestId('group-share-rA')).toBeNull();

    // The invite copy reads "…una plaza en «{name}»", so the slot is the event.
    fireEvent.press(getByTestId('group-share-rB'));
    await waitFor(() => expect(mockShareDeepLink).toHaveBeenCalled());
    expect(mockShareDeepLink.mock.calls[0][0].url).toBe('https://x.test/villa/evento/fiestas-de-san-juan_e1/plaza/tok_xyz');
    expect(mockShareDeepLink.mock.calls[0][1]).toBe('Fiestas de San Juan');
  });

  it('keeps a seat a guest has claimed in the owner’s group summary', async () => {
    // Claiming moves `userId` to the guest, so the owner's own-registration
    // query no longer returns that seat — the groupOwnerId read is what keeps
    // the group whole on screen.
    mockGetUserRegistrations.mockResolvedValue([
      { id: 'rA', personId: 'p1', name: 'Ana', status: 'confirmed', isOpenSeat: false },
    ]);
    (getGroupRegistrations as jest.Mock).mockResolvedValue([
      { id: 'rA', personId: 'p1', name: 'Ana', status: 'confirmed', isOpenSeat: false },
      { id: 'rB', personId: 'p9', name: 'Bruno', status: 'confirmed', isOpenSeat: false },
    ]);
    const { getByTestId } = render(<RegisterFab {...groupProps} />);
    await waitFor(() => expect(getByTestId('register-fab')).toBeTruthy());
    fireEvent.press(getByTestId('register-fab'));

    await waitFor(() => expect(getByTestId('group-seat-rA')).toBeTruthy());
    expect(getByTestId('group-seat-rB')).toBeTruthy();
  });

  it('still shows the group when the groupOwnerId read is denied', async () => {
    mockGetUserRegistrations.mockResolvedValue([
      { id: 'rA', personId: 'p1', name: 'Ana', status: 'confirmed', isOpenSeat: false },
    ]);
    (getGroupRegistrations as jest.Mock).mockRejectedValue(new Error('permission-denied'));
    const { getByTestId } = render(<RegisterFab {...groupProps} />);
    await waitFor(() => expect(getByTestId('register-fab')).toBeTruthy());
    fireEvent.press(getByTestId('register-fab'));

    await waitFor(() => expect(getByTestId('group-seat-rA')).toBeTruthy());
  });

  it('cancels the whole group from the summary', async () => {
    mockGetUserRegistrations.mockResolvedValue([
      { id: 'rA', personId: 'p1', name: 'Ana', status: 'confirmed', isOpenSeat: false },
      { id: 'rB', personId: '', name: 'Plaza libre', status: 'confirmed', isOpenSeat: true },
    ]);
    mockCancelRegistration.mockResolvedValue({ action: 'delete-group', removedRegistrationIds: ['rA', 'rB'] });
    const { getByTestId } = render(<RegisterFab {...groupProps} />);
    await waitFor(() => expect(getByTestId('register-fab')).toBeTruthy());
    fireEvent.press(getByTestId('register-fab'));

    await waitFor(() => expect(getByTestId('group-cancel')).toBeTruthy());
    fireEvent.press(getByTestId('group-cancel'));

    // One call with any seat of the group — the server cascades from there.
    await waitFor(() => expect(mockCancelRegistration).toHaveBeenCalledWith('e1', 'rA'));
  });
});

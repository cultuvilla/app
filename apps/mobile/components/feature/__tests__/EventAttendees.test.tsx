import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { EventAttendees } from '../EventAttendees';
import {
  getEventRegistrations,
  getRegistrationPrivate,
  cancelRegistration,
  setRegistrationPaid,
} from '@cultuvilla/shared/services/registrationService';

jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/dialogs', () => ({
  showConfirm: (_t: string, _m: string, onConfirm: () => void) => onConfirm(),
  showAlert: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/registrationService', () => ({
  getEventRegistrations: jest.fn(),
  getRegistrationPrivate: jest.fn(),
  cancelRegistration: jest.fn().mockResolvedValue(undefined),
  setRegistrationPaid: jest.fn().mockResolvedValue(undefined),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

const mockGet = getEventRegistrations as jest.Mock;
const mockPrivate = getRegistrationPrivate as jest.Mock;
const mockCancel = cancelRegistration as jest.Mock;

/** The trash icons only exist once the heading's "Editar" toggle is on. */
const enterEditMode = () => fireEvent.press(screen.getByTestId('attendees-edit-toggle'));

describe('EventAttendees', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('explains that a group-booked event lists its attendees by group', async () => {
    mockGet.mockResolvedValue([{ id: 'r1', personId: 'p1', name: 'Ana', status: 'confirmed' }]);
    const { getByTestId } = render(
      <EventAttendees eventId="e1" eventTitle="Fiesta" eventDate={new Date("2026-06-24T20:00:00Z")} telephoneRequired={false} requiresPayment={false} groupSize={3} canManage={false} />,
    );
    await waitFor(() => getByTestId('attendees-group-note'));
  });

  it('hides the edit toggle until there is at least one attendee', async () => {
    mockGet.mockResolvedValue([]);
    const { getByText, queryByTestId } = render(
      <EventAttendees eventId="e1" eventTitle="Fiesta" eventDate={new Date("2026-06-24T20:00:00Z")} telephoneRequired={false} requiresPayment={false} canManage />,
    );
    await waitFor(() => getByText('event.attendeesEmpty'));
    expect(queryByTestId('attendees-edit-toggle')).toBeNull();
  });

  it('shows the edit toggle when only the waitlist has entries', async () => {
    mockGet.mockResolvedValue([{ id: 'r1', personId: 'p1', name: 'Ana', status: 'waitlisted' }]);
    const { getByTestId } = render(
      <EventAttendees eventId="e1" eventTitle="Fiesta" eventDate={new Date("2026-06-24T20:00:00Z")} telephoneRequired={false} requiresPayment={false} canManage />,
    );
    await waitFor(() => getByTestId('attendees-edit-toggle'));
  });

  it('shows a call action that reveals the number in a dialog when telephone was required', async () => {
    mockGet.mockResolvedValue([{ id: 'r1', personId: 'p1', name: 'Ana', status: 'confirmed' }]);
    mockPrivate.mockResolvedValue({ phone: '600111222', answers: {} });
    const { getByText, getByTestId, queryByText } = render(
      <EventAttendees eventId="e1" eventTitle="Fiesta" eventDate={new Date("2026-06-24T20:00:00Z")} telephoneRequired requiresPayment={false} canManage />,
    );
    await waitFor(() => getByTestId('call-attendee-r1'));
    // Number is not shown inline until the call dialog is opened.
    expect(queryByText('600111222')).toBeNull();
    fireEvent.press(getByTestId('call-attendee-r1'));
    getByText('600111222');
  });

  it('shows no call action when telephone was not required', async () => {
    mockGet.mockResolvedValue([{ id: 'r1', personId: 'p1', name: 'Ana', status: 'confirmed' }]);
    const { getByText, queryByTestId } = render(
      <EventAttendees eventId="e1" eventTitle="Fiesta" eventDate={new Date("2026-06-24T20:00:00Z")} telephoneRequired={false} requiresPayment={false} canManage />,
    );
    await waitFor(() => getByText('Ana'));
    // The private doc is still read (it carries the birth date the export
    // needs); what an event without telephoneRequired lacks is the affordance.
    expect(queryByTestId('call-attendee-r1')).toBeNull();
  });

  it('removes an attendee then reloads', async () => {
    mockGet.mockResolvedValue([{ id: 'r1', personId: 'p1', name: 'Ana', status: 'confirmed' }]);
    const { getByTestId } = render(
      <EventAttendees eventId="e1" eventTitle="Fiesta" eventDate={new Date("2026-06-24T20:00:00Z")} telephoneRequired={false} requiresPayment={false} canManage />,
    );
    await waitFor(() => getByTestId('attendee-profile-r1'));
    enterEditMode();
    fireEvent.press(getByTestId('remove-attendee-r1'));
    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('e1', 'r1'));
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('splits confirmed attendees from a separate waiting-list section', async () => {
    mockGet.mockResolvedValue([
      { id: 'r1', personId: 'p1', name: 'Ana', status: 'confirmed' },
      { id: 'r2', personId: 'p2', name: 'Luis', status: 'waitlisted' },
    ]);
    const { getByText, getByTestId } = render(
      <EventAttendees eventId="e1" eventTitle="Fiesta" eventDate={new Date("2026-06-24T20:00:00Z")} telephoneRequired={false} requiresPayment={false} canManage />,
    );
    // The waitlist heading only appears when someone is waitlisted.
    await waitFor(() => getByText('event.waitlist (1)'));
    getByText('event.attendees (1)');
    getByText('Ana');
    getByText('Luis');
    // One toggle governs both sections' remove actions.
    enterEditMode();
    getByTestId('remove-attendee-r1');
    getByTestId('remove-attendee-r2');
  });

  it('shows when each attendee signed up, in the order the service returned', async () => {
    // The service already sorts by registeredAt; the component must not
    // reshuffle the rows, so the rendered timestamps stay monotonic.
    mockGet.mockResolvedValue([
      {
        id: 'r1',
        personId: 'p1',
        name: 'Ana',
        status: 'confirmed',
        registeredAt: new Date(2025, 2, 11, 9, 15),
      },
      {
        id: 'r2',
        personId: 'p2',
        name: 'Luis',
        status: 'confirmed',
        registeredAt: new Date(2025, 2, 14, 18, 42),
      },
    ]);
    const { getByTestId } = render(
      <EventAttendees eventId="e1" eventTitle="Fiesta" eventDate={new Date("2026-06-24T20:00:00Z")} telephoneRequired={false} requiresPayment={false} canManage />,
    );
    await waitFor(() => getByTestId('attendee-signed-up-r1'));
    expect(getByTestId('attendee-signed-up-r1').props.children).toContain('11');
    expect(getByTestId('attendee-signed-up-r2').props.children).toContain('14');
    expect(getByTestId('attendee-signed-up-r1').props.accessibilityLabel).toContain(
      'event.signedUpAt',
    );
  });

  it('hides the waiting-list section when nobody is waitlisted', async () => {
    mockGet.mockResolvedValue([{ id: 'r1', personId: 'p1', name: 'Ana', status: 'confirmed' }]);
    const { getByText, queryByText } = render(
      <EventAttendees eventId="e1" eventTitle="Fiesta" eventDate={new Date("2026-06-24T20:00:00Z")} telephoneRequired={false} requiresPayment={false} canManage />,
    );
    await waitFor(() => getByText('Ana'));
    expect(queryByText('event.waitlist (0)')).toBeNull();
  });

  it('toggles setRegistrationPaid when the paid checkbox is pressed (requiresPayment)', async () => {
    mockGet.mockResolvedValue([{ id: 'r1', personId: 'p1', name: 'Ana', status: 'confirmed', paidAt: null }]);
    const { getByTestId } = render(
      <EventAttendees eventId="e1" eventTitle="Fiesta" eventDate={new Date("2026-06-24T20:00:00Z")} telephoneRequired={false} requiresPayment canManage />,
    );
    await waitFor(() => getByTestId('paid-attendee-r1'));
    fireEvent.press(getByTestId('paid-attendee-r1'));
    await waitFor(() => expect(setRegistrationPaid).toHaveBeenCalledWith('e1', 'r1', true));
  });

  it('hides the paid checkbox when requiresPayment is false', async () => {
    mockGet.mockResolvedValue([{ id: 'r1', personId: 'p1', name: 'Ana', status: 'confirmed', paidAt: null }]);
    const { queryByTestId, getByText } = render(
      <EventAttendees eventId="e1" eventTitle="Fiesta" eventDate={new Date("2026-06-24T20:00:00Z")} telephoneRequired={false} requiresPayment={false} canManage />,
    );
    await waitFor(() => getByText('Ana'));
    expect(queryByTestId('paid-attendee-r1')).toBeNull();
  });

  it('hides the remove action until edit mode is on', async () => {
    mockGet.mockResolvedValue([{ id: 'r1', personId: 'p1', name: 'Ana', status: 'confirmed' }]);
    const { getByTestId, queryByTestId } = render(
      <EventAttendees eventId="e1" eventTitle="Fiesta" eventDate={new Date("2026-06-24T20:00:00Z")} telephoneRequired={false} requiresPayment={false} canManage />,
    );
    await waitFor(() => getByTestId('attendee-profile-r1'));
    expect(queryByTestId('remove-attendee-r1')).toBeNull();
    enterEditMode();
    expect(getByTestId('remove-attendee-r1')).toBeTruthy();
    fireEvent.press(getByTestId('attendees-edit-toggle'));
    expect(queryByTestId('remove-attendee-r1')).toBeNull();
  });

  it('opens the person card for an attendee with no account', async () => {
    mockGet.mockResolvedValue([{ id: 'r1', personId: 'p1', name: 'Ana', status: 'confirmed' }]);
    const { getByTestId } = render(
      <EventAttendees eventId="e1" eventTitle="Fiesta" eventDate={new Date("2026-06-24T20:00:00Z")} telephoneRequired={false} requiresPayment={false} canManage />,
    );
    await waitFor(() => getByTestId('attendee-profile-r1'));
    fireEvent.press(getByTestId('attendee-profile-r1'));
    expect(mockPush).toHaveBeenCalledWith('/persona/p1');
  });

  it('opens the richer user profile when the attendee has an account', async () => {
    // personUserId is the attendee's OWN account, not whoever signed them up.
    mockGet.mockResolvedValue([
      { id: 'r1', personId: 'p1', personUserId: 'u1', name: 'Ana', status: 'confirmed' },
    ]);
    const { getByTestId } = render(
      <EventAttendees eventId="e1" eventTitle="Fiesta" eventDate={new Date("2026-06-24T20:00:00Z")} telephoneRequired={false} requiresPayment={false} canManage />,
    );
    await waitFor(() => getByTestId('attendee-profile-r1'));
    fireEvent.press(getByTestId('attendee-profile-r1'));
    expect(mockPush).toHaveBeenCalledWith('/usuario/u1');
  });

  it('leaves a walk-in with no person non-tappable', async () => {
    mockGet.mockResolvedValue([{ id: 'r1', personId: null, name: 'Ana', status: 'confirmed' }]);
    const { getByText, queryByTestId } = render(
      <EventAttendees eventId="e1" eventTitle="Fiesta" eventDate={new Date("2026-06-24T20:00:00Z")} telephoneRequired={false} requiresPayment={false} canManage />,
    );
    await waitFor(() => getByText('Ana'));
    expect(queryByTestId('attendee-profile-r1')).toBeNull();
  });

  // Edit mode is exclusively about removing: a row must offer the trash and
  // nothing else, so a mis-tap can't mark someone paid or dial them.
  it('hides the paid checkbox and the call action while edit mode is on', async () => {
    mockGet.mockResolvedValue([
      { id: 'r1', personId: 'p1', name: 'Ana', status: 'confirmed', paidAt: null },
    ]);
    mockPrivate.mockResolvedValue({ phone: '600111222', answers: {} });
    const { getByTestId, queryByTestId } = render(
      <EventAttendees eventId="e1" eventTitle="Fiesta" eventDate={new Date("2026-06-24T20:00:00Z")} telephoneRequired requiresPayment canManage />,
    );
    await waitFor(() => getByTestId('call-attendee-r1'));
    getByTestId('paid-attendee-r1');

    enterEditMode();
    expect(queryByTestId('paid-attendee-r1')).toBeNull();
    expect(queryByTestId('call-attendee-r1')).toBeNull();
    getByTestId('remove-attendee-r1');

    // Leaving edit mode brings the ops affordances back.
    fireEvent.press(screen.getByTestId('attendees-edit-toggle'));
    getByTestId('paid-attendee-r1');
    getByTestId('call-attendee-r1');
    expect(queryByTestId('remove-attendee-r1')).toBeNull();
  });

  it('fetches registrationPrivate for an organizer even when the event asks nothing', async () => {
    // Every sign-up denormalizes the attendee's birth date there, so the doc is
    // worth reading on any event — the roster export's column comes from it.
    mockGet.mockResolvedValue([
      { id: 'r1', personId: 'p1', name: 'Ana', status: 'confirmed', isPersonPublic: true },
    ]);
    mockPrivate.mockResolvedValue({ phone: null, answers: {}, birthday: { year: 1980, month: 3, day: 12 } });
    const { getByText } = render(
      <EventAttendees
        eventId="e1"
        eventTitle="Fiesta"
        eventDate={new Date('2026-06-24T20:00:00Z')}
        telephoneRequired={false}
        requiresPayment={false}
        canManage
      />,
    );
    await waitFor(() => getByText('Ana'));
    await waitFor(() => expect(mockPrivate).toHaveBeenCalledWith('e1', 'r1'));
  });
});

// The roster is readable by every member of the event's pueblo. What a fellow
// villager may see is strictly narrower than what an organizer may see, and
// these cases are the contract for that difference.
describe('EventAttendees — read-only (fellow villager)', () => {
  const readOnly = (extra: Record<string, unknown> = {}) => (
    <EventAttendees
      eventId="e1"
      eventTitle="Fiesta"
      eventDate={new Date('2026-06-24T20:00:00Z')}
      telephoneRequired={false}
      requiresPayment={false}
      canManage={false}
      {...extra}
    />
  );

  beforeEach(() => jest.clearAllMocks());

  it('lists attendees without any organizer affordance', async () => {
    mockGet.mockResolvedValue([
      { id: 'r1', personId: 'p1', name: 'Ana', status: 'confirmed', isPersonPublic: true },
    ]);
    const { getByText, queryByTestId } = render(readOnly());
    await waitFor(() => getByText('Ana'));
    expect(queryByTestId('attendees-edit-toggle')).toBeNull();
    expect(queryByTestId('remove-attendee-r1')).toBeNull();
    expect(queryByTestId('export-roster')).toBeNull();
  });

  it('never fetches registrationPrivate, even when the event collects a phone', async () => {
    mockGet.mockResolvedValue([
      { id: 'r1', personId: 'p1', name: 'Ana', status: 'confirmed', isPersonPublic: true },
    ]);
    const { getByText, queryByTestId } = render(readOnly({ telephoneRequired: true }));
    await waitFor(() => getByText('Ana'));
    // Rules would deny it anyway; not asking keeps the denial out of the logs.
    expect(mockPrivate).not.toHaveBeenCalled();
    expect(queryByTestId('call-attendee-r1')).toBeNull();
  });

  it('hides payment state on a paid event', async () => {
    mockGet.mockResolvedValue([
      { id: 'r1', personId: 'p1', name: 'Ana', status: 'confirmed', paidAt: new Date(), isPersonPublic: true },
    ]);
    const { getByText, queryByTestId } = render(readOnly({ requiresPayment: true }));
    await waitFor(() => getByText('Ana'));
    expect(queryByTestId('paid-attendee-r1')).toBeNull();
  });

  it('anonymizes a private persona: counted, not named, not tappable', async () => {
    mockGet.mockResolvedValue([
      { id: 'r1', personId: 'p1', name: 'Ana', status: 'confirmed', isPersonPublic: true },
      { id: 'r2', personId: 'p2', name: 'Peque', status: 'confirmed', isPersonPublic: false },
    ]);
    const { getByText, queryByText, queryByTestId } = render(readOnly());
    await waitFor(() => getByText('Ana'));
    // The name the privacy setting exists to hide must not appear…
    expect(queryByText('Peque')).toBeNull();
    getByText('event.attendeePrivate');
    // …but the row still counts toward the total.
    getByText('event.attendees (2)');
    expect(queryByTestId('attendee-profile-r2')).toBeNull();
  });

  it('shows an organizer the real name of a private persona', async () => {
    mockGet.mockResolvedValue([
      { id: 'r2', personId: 'p2', name: 'Peque', status: 'confirmed', isPersonPublic: false },
    ]);
    const { getByText } = render(
      <EventAttendees
        eventId="e1"
        eventTitle="Fiesta"
        eventDate={new Date('2026-06-24T20:00:00Z')}
        telephoneRequired={false}
        requiresPayment={false}
        canManage
      />,
    );
    await waitFor(() => getByText('Peque'));
  });

  it('hides custom sign-up answers', async () => {
    mockGet.mockResolvedValue([
      { id: 'r1', personId: 'p1', name: 'Ana', status: 'confirmed', isPersonPublic: true },
    ]);
    const { getByText, queryByTestId } = render(
      readOnly({ signupFields: [{ id: 'talla', label: 'Talla', type: 'text', required: false }] }),
    );
    await waitFor(() => getByText('Ana'));
    expect(mockPrivate).not.toHaveBeenCalled();
    expect(queryByTestId('answer-r1-talla')).toBeNull();
  });
});

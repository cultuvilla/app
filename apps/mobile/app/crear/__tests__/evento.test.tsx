// apps/mobile/app/event/__tests__/new.test.tsx
import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
import NewEventScreen from '../evento';
import { pickImageAsBlob } from '../../../lib/images';
import {
  cancelSeriesFrom,
  createEvent,
  createEventSeries,
  getEvent,
  setEventsImage,
  updateEvent,
} from '@cultuvilla/shared/services/eventService';
import { Alert } from 'react-native';
import { uploadEventImage } from '@cultuvilla/shared/services/imageService';
import { showConfirm } from '../../../lib/dialogs';

jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'uid-1', email: 'a@b.test' }, profile: { activeMunicipalityId: 'm-1' } }),
}));
jest.mock('../../../lib/firestoreErrorLog', () => ({
  withFirestoreErrorLog: (_label: string, fn: () => unknown) => fn(),
}));
const mockParams: { eventId?: string; villageId?: string; copyFrom?: string } = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID="redirect">{href}</Text>;
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../lib/images', () => ({ pickImageAsBlob: jest.fn() }));
jest.mock('../../../lib/dialogs', () => ({ showConfirm: jest.fn() }));

// The event's village now comes from the user's joined villages.
jest.mock('@cultuvilla/shared/services/villageMemberService', () => ({
  getUserMemberships: jest.fn().mockResolvedValue([
    { municipalityId: 'm-1', role: 'user', joinedAt: new Date(), profileCompletedAt: null },
  ]),
}));
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  getMunicipality: jest.fn().mockResolvedValue({
    id: 'm-1', slug: 'pueblo', name: 'Pueblo', province: 'Prov', coordinates: { lat: 1, lng: 2 },
  }),
}));
jest.mock('@cultuvilla/shared/models/municipality', () => ({
  escudoThumbDisplayUrl: () => null,
}));
jest.mock('@cultuvilla/shared/services/feedService', () => ({
  haversineKm: () => 0,
}));
jest.mock('@cultuvilla/shared/services/organizationService', () => ({
}));
jest.mock('@cultuvilla/shared/services/eventService', () => ({
  createEvent: jest.fn().mockResolvedValue('e-1'),
  createEventSeries: jest.fn().mockResolvedValue(['s-0', 's-1', 's-2']),
  setEventsImage: jest.fn(),
  cancelSeriesFrom: jest.fn().mockResolvedValue(2),
  updateEventStatus: jest.fn().mockResolvedValue(undefined),
  updateEvent: jest.fn(),
  getEvent: jest.fn(),
}));
// The groups the creator administers decide whether a checklist is offered.
const mockMyGroups: { current: { org: { id: string; name: string }; role: 'admin' | 'member' }[] } = { current: [] };
jest.mock('../../../lib/orgs/useMyGroups', () => ({
  useMyGroups: () => ({ groups: mockMyGroups.current, status: 'ready' }),
}));
jest.mock('@cultuvilla/shared/services/groupTaskService', () => ({
  createGroupTasks: jest.fn().mockResolvedValue(['t-1']),
}));
jest.mock('@cultuvilla/shared/services/imageService', () => ({
  uploadEventImage: jest.fn(),
}));
jest.mock('../../../lib/auth/useEntityCapabilities', () => ({
  useEntityCapabilities: () => ({
    canManage: true,
    canApprove: true,
    uid: 'u1',
    loading: false,
    canEdit: () => true,
    canDelete: () => true,
  }),
}));

// Surface-level stubs for the composed step components. The organizer picker
// records its props: what the screen tells it to lock is the contract under test.
const mockOrganizerProps: { current: { lockedUserId?: string } | null } = { current: null };
jest.mock('../../../components/feature/OrganizerPicker', () => ({
  OrganizerPicker: (props: {
    lockedUserId?: string;
    onChangeOrgs?: (ids: string[]) => void;
  }) => {
    mockOrganizerProps.current = props;
    const { View, Pressable } = require('react-native');
    // Two escape hatches so the tests can put the screen in the states the
    // "Solo para miembros" switch depends on: exactly one organizing org, and
    // more than one.
    return (
      <View testID="organizer-picker">
        <Pressable testID="pick-one-org" onPress={() => props.onChangeOrgs?.(['org-1'])} />
        <Pressable
          testID="pick-two-orgs"
          onPress={() => props.onChangeOrgs?.(['org-1', 'org-2'])}
        />
      </View>
    );
  },
}));
const mockLocationRequired = { current: false };
jest.mock('../../../components/feature/LocationField', () => ({
  LocationField: ({
    onChange,
    required,
  }: {
    onChange: (c: { lat: number; lng: number }, a: string) => void;
    required?: boolean;
  }) => {
    const { Pressable } = require('react-native');
    mockLocationRequired.current = !!required;
    return (
      <Pressable testID="location-field" onPress={() => onChange({ lat: 1, lng: 2 }, 'Plaza Mayor')} />
    );
  },
}));
jest.mock('../../../components/feature/MyVillagePicker', () => ({
  MyVillagePicker: ({ value }: { value: string | null }) => {
    const { Text } = require('react-native');
    return <Text testID="village-picker">{value ?? ''}</Text>;
  },
}));
// Drive DateTimeField.onChange directly; also surface the incoming value for assertions.
jest.mock('../../../components/primitives/DateTimeField', () => ({
  DateTimeField: ({
    label,
    onChange,
    testID,
    value,
  }: {
    label: string;
    onChange: (d: Date) => void;
    testID?: string;
    value: Date | null;
  }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable testID={testID} onPress={() => onChange(new Date('2026-08-01T18:00'))}>
        <Text>{label}</Text>
        <Text testID={`${testID}-value`}>{value ? value.toISOString() : ''}</Text>
      </Pressable>
    );
  },
}));

const mockUntil = { current: '2026-08-29T00:00' };
jest.mock('../../../components/primitives/DateField', () => ({
  DateField: ({ onChange, testID }: { onChange: (d: Date) => void; testID?: string }) => {
    const { Pressable } = require('react-native');
    return <Pressable testID={testID} onPress={() => onChange(new Date(mockUntil.current))} />;
  },
}));

describe('NewEventScreen stepper', () => {
  it('gates Next on title only — description is optional', async () => {
    const { getByText, getByLabelText, getByTestId, queryByTestId } = render(<NewEventScreen />);
    await waitFor(() => expect(getByLabelText('event.title')).toBeTruthy());
    fireEvent.press(getByText('common.stepper.next'));
    expect(queryByTestId('startDate')).toBeNull(); // blocked: empty title
    // Title alone unblocks; description is left empty on purpose.
    fireEvent.changeText(getByLabelText('event.title'), 'Fiesta');
    fireEvent.press(getByText('common.stepper.next'));
    // Now in step 2 (Cuándo y dónde): datetime (+ optional end), location + village present.
    expect(getByTestId('startDate')).toBeTruthy();
    // endDate is the optional multi-day end.
    expect(getByTestId('endDate')).toBeTruthy();
    expect(getByTestId('location-field')).toBeTruthy();
    expect(getByTestId('village-picker')).toBeTruthy();
  });

  // Who is behind the event is part of "lo básico", not a detail: the picker
  // sits with title/description, and the Detalles step no longer carries it.
  it('offers the organizer/groups picker on the first step', async () => {
    const { getByText, getByLabelText, getByTestId, queryByTestId } = render(<NewEventScreen />);
    await waitFor(() => expect(getByLabelText('event.title')).toBeTruthy());
    expect(getByTestId('organizer-picker')).toBeTruthy();
    fireEvent.changeText(getByLabelText('event.title'), 'Fiesta');
    fireEvent.changeText(getByLabelText('event.description'), 'Desc');
    fireEvent.press(getByText('common.stepper.next'));
    // Step 2: set date + location; village auto-selected from the joined village.
    await waitFor(() => expect(getByTestId('startDate')).toBeTruthy());
    fireEvent.press(getByTestId('startDate'));
    fireEvent.press(getByTestId('location-field'));
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('signup-enabled')).toBeTruthy());
    expect(queryByTestId('organizer-picker')).toBeNull();
  });

  it('toggles "teléfono requerido" in the details step', async () => {
    const { getByText, getByLabelText, getByTestId } = render(<NewEventScreen />);
    await waitFor(() => expect(getByLabelText('event.title')).toBeTruthy());
    fireEvent.changeText(getByLabelText('event.title'), 'Fiesta');
    fireEvent.changeText(getByLabelText('event.description'), 'Desc');
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('startDate')).toBeTruthy());
    fireEvent.press(getByTestId('startDate'));
    fireEvent.press(getByTestId('location-field'));
    fireEvent.press(getByText('common.stepper.next'));
    const toggle = await waitFor(() => getByTestId('telephone-required'));
    expect(toggle.props.accessibilityState.checked).toBe(false);
    fireEvent.press(toggle);
    expect(toggle.props.accessibilityState.checked).toBe(true);
  });

  it('flags a birth-year window that is backwards or outside sensible years', async () => {
    const { getByText, getByLabelText, getByTestId, queryByTestId } = render(<NewEventScreen />);
    await waitFor(() => expect(getByLabelText('event.title')).toBeTruthy());
    fireEvent.changeText(getByLabelText('event.title'), 'Fiesta');
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('startDate')).toBeTruthy());
    fireEvent.press(getByTestId('startDate'));
    fireEvent.press(getByTestId('location-field'));
    fireEvent.press(getByText('common.stepper.next'));
    fireEvent.press(await waitFor(() => getByTestId('birth-year-limit')));

    fireEvent.changeText(getByTestId('min-birth-year'), '2010');
    fireEvent.changeText(getByTestId('max-birth-year'), '1990');
    expect(getByTestId('birth-year-range-error')).toBeTruthy();

    fireEvent.changeText(getByTestId('min-birth-year'), '1700');
    fireEvent.changeText(getByTestId('max-birth-year'), '1990');
    expect(queryByTestId('birth-year-range-error')).toBeNull();
    expect(getByTestId('birth-year-bounds-error')).toBeTruthy();
  });

  it('puts the sign-up questions in their own step after the details', async () => {
    const { getByText, getByLabelText, getByTestId, queryByTestId } = render(<NewEventScreen />);
    await waitFor(() => expect(getByLabelText('event.title')).toBeTruthy());
    fireEvent.changeText(getByLabelText('event.title'), 'Fiesta');
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('startDate')).toBeTruthy());
    fireEvent.press(getByTestId('startDate'));
    fireEvent.press(getByTestId('location-field'));
    fireEvent.press(getByText('common.stepper.next'));
    // Details: toggles and organizers, but no question builder.
    await waitFor(() => expect(getByTestId('telephone-required')).toBeTruthy());
    expect(queryByTestId('signup-question-add')).toBeNull();

    fireEvent.press(getByTestId('form-enabled'));
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('signup-question-add')).toBeTruthy());
    // Last step: the primary button submits instead of advancing.
    expect(getByTestId('event-form-primary')).toHaveTextContent('event.createEvent');
  });

  it('marks the location as mandatory', async () => {
    const { getByText, getByLabelText, getByTestId } = render(<NewEventScreen />);
    await waitFor(() => expect(getByLabelText('event.title')).toBeTruthy());
    fireEvent.changeText(getByLabelText('event.title'), 'Fiesta');
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('startDate')).toBeTruthy());
    expect(getByTestId('location-field')).toBeTruthy();
    expect(mockLocationRequired.current).toBe(true);
  });

  // Most events need no questions, so the Preguntas step only exists once the
  // creator asks for a form; until then Detalles is the last step.
  it('shows the questions step only when "añadir un formulario" is on', async () => {
    const { getByText, getByLabelText, getByTestId } = render(<NewEventScreen />);
    await waitFor(() => expect(getByLabelText('event.title')).toBeTruthy());
    fireEvent.changeText(getByLabelText('event.title'), 'Fiesta');
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('startDate')).toBeTruthy());
    fireEvent.press(getByTestId('startDate'));
    fireEvent.press(getByTestId('location-field'));
    fireEvent.press(getByText('common.stepper.next'));

    const formEnabled = await waitFor(() => getByTestId('form-enabled'));
    expect(formEnabled.props.accessibilityState.checked).toBe(false);
    expect(getByTestId('event-form-primary')).toHaveTextContent('event.createEvent');

    fireEvent.press(formEnabled);
    expect(getByTestId('event-form-primary')).toHaveTextContent('common.stepper.next');
  });

  // The group-size selector arrived with group sign-ups after this screen
  // learned to hide the sign-up-only controls, so it has to sit behind the same
  // toggle: a group size is meaningless on an event that takes no sign-ups.
  it('hides every sign-up-only control, group size included, when sign-ups are off', async () => {
    const { getByText, getByLabelText, getByTestId, queryByTestId } = render(<NewEventScreen />);
    await waitFor(() => expect(getByLabelText('event.title')).toBeTruthy());
    fireEvent.changeText(getByLabelText('event.title'), 'Fiesta');
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('startDate')).toBeTruthy());
    fireEvent.press(getByTestId('startDate'));
    fireEvent.press(getByTestId('location-field'));
    fireEvent.press(getByText('common.stepper.next'));

    // Sign-ups default on: the whole sign-up block is present, the note is not.
    const signupEnabled = await waitFor(() => getByTestId('signup-enabled'));
    expect(getByTestId('telephone-required')).toBeTruthy();
    expect(getByTestId('requires-payment')).toBeTruthy();
    expect(getByTestId('signup-group-size')).toBeTruthy();
    expect(getByTestId('attendees-public')).toBeTruthy();
    expect(queryByTestId('signup-info')).toBeNull();

    fireEvent.press(signupEnabled);

    expect(queryByTestId('telephone-required')).toBeNull();
    expect(queryByTestId('requires-payment')).toBeNull();
    expect(queryByTestId('signup-group-size')).toBeNull();
    // The attendee-list toggle governs who can see the sign-up list, so it goes
    // with them: with sign-ups off there is no list for it to be about.
    expect(queryByTestId('attendees-public')).toBeNull();
    // The organizer's note takes their place...
    expect(getByTestId('signup-info')).toBeTruthy();
    // ...and Preguntas drops out, making Detalles the final step.
    expect(getByTestId('event-form-primary')).toHaveTextContent('event.createEvent');
  });

  // Group sign-up is a yes/no first and a size second. Folding "1" into the size
  // row made ordinary individual sign-up — the common case — look like a setting
  // you had to understand before you could skip it.
  it('asks whether sign-ups are by group before asking how big a group is', async () => {
    const { getByText, getByLabelText, getByTestId, queryByTestId } = render(<NewEventScreen />);
    await waitFor(() => expect(getByLabelText('event.title')).toBeTruthy());
    fireEvent.changeText(getByLabelText('event.title'), 'Fiesta');
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('startDate')).toBeTruthy());
    fireEvent.press(getByTestId('startDate'));
    fireEvent.press(getByTestId('location-field'));
    fireEvent.press(getByText('common.stepper.next'));

    // Off by default: the toggle is there, no size to pick, and no "1" choice.
    const groupToggle = await waitFor(() => getByTestId('signup-group-size'));
    expect(groupToggle.props.accessibilityState.checked).toBe(false);
    expect(queryByTestId('group-size-1')).toBeNull();
    expect(queryByTestId('group-size-2')).toBeNull();

    // On: the sizes appear, smallest real group pre-selected.
    fireEvent.press(groupToggle);
    expect(getByTestId('group-size-2').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('group-size-4')).toBeTruthy();
    expect(queryByTestId('group-size-1')).toBeNull();

    fireEvent.press(getByTestId('group-size-4'));
    expect(getByTestId('group-size-4').props.accessibilityState.selected).toBe(true);

    // Off again: the sizes go away and the event is back to individual sign-up.
    fireEvent.press(groupToggle);
    expect(queryByTestId('group-size-2')).toBeNull();
    expect(getByTestId('signup-group-size').props.accessibilityState.checked).toBe(false);
  });

  // The Detalles step used to spell out how sign-ups and group sign-ups work in
  // paragraphs under each control, which pushed the controls themselves off
  // screen. The wording is unchanged — it just lives behind an "ⓘ" now.
  it('parks the sign-up and group-size explanations behind info tooltips', async () => {
    const { getByText, getByLabelText, getByTestId, queryByText } = render(<NewEventScreen />);
    await waitFor(() => expect(getByLabelText('event.title')).toBeTruthy());
    fireEvent.changeText(getByLabelText('event.title'), 'Fiesta');
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('startDate')).toBeTruthy());
    fireEvent.press(getByTestId('startDate'));
    fireEvent.press(getByTestId('location-field'));
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('signup-enabled')).toBeTruthy());

    // Nothing is spelled out until asked for.
    expect(queryByText('event.signupEnabledHint')).toBeNull();
    expect(queryByText('event.signupGroupSizeHelp')).toBeNull();
    expect(queryByText('event.attendeesPublicHint')).toBeNull();

    fireEvent.press(getByTestId('signup-group-size-info'));
    expect(getByText('event.signupGroupSizeHelp')).toBeTruthy();
    fireEvent.press(getByTestId('signup-group-size-info-close'));
    await waitFor(() => expect(queryByText('event.signupGroupSizeHelp')).toBeNull());

    fireEvent.press(getByTestId('signup-enabled-info'));
    expect(getByText('event.signupEnabledHint')).toBeTruthy();
  });

  // Regression: the cover picker must go through lib/images.pickImageAsBlob,
  // which reads the URI via XMLHttpRequest, not the global winter `fetch`.
  it('picks the cover image via the shared pickImageAsBlob helper', async () => {
    (pickImageAsBlob as jest.Mock).mockResolvedValue({
      blob: { type: 'image/jpeg' },
      filename: 'pic.jpg',
      contentType: 'image/jpeg',
      previewUri: 'file:///tmp/pic.jpg',
    });
    const { getByLabelText } = render(<NewEventScreen />);
    await waitFor(() => expect(getByLabelText('event.title')).toBeTruthy());
    fireEvent.press(getByLabelText('event.addImage'));
    await waitFor(() => expect(pickImageAsBlob).toHaveBeenCalled());
  });

  it('pre-seeds the event start with a 5-minute-aligned current time', async () => {
    const { getByText, getByLabelText, getByTestId } = render(<NewEventScreen />);
    await waitFor(() => expect(getByLabelText('event.title')).toBeTruthy());
    fireEvent.changeText(getByLabelText('event.title'), 'Fiesta');
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => getByTestId('startDate-value'));
    const iso = getByTestId('startDate-value').props.children as string;
    expect(iso).not.toBe(''); // not the empty placeholder
    expect(new Date(iso).getMinutes() % 5).toBe(0);
  });
});

// The cover upload is a second round-trip after createEvent, and it is the one
// that dies on a weak link. These pin the ordering and, critically, that a retry
// finishes the event already created instead of creating another one.
describe('NewEventScreen cover upload', () => {
  const COVER = {
    blob: { type: 'image/jpeg' },
    filename: 'pic.jpg',
    contentType: 'image/jpeg',
    previewUri: 'file:///tmp/pic.jpg',
  };

  beforeEach(() => {
    // Clear only what these tests assert on. `jest.clearAllMocks()` would also
    // wipe the module-level resolved values (memberships, municipality) the
    // screen needs to finish loading.
    (createEvent as jest.Mock).mockReset();
    (updateEvent as jest.Mock).mockReset();
    (uploadEventImage as jest.Mock).mockReset();
    (pickImageAsBlob as jest.Mock).mockReset();
    (createEvent as jest.Mock).mockResolvedValue('e-1');
    (updateEvent as jest.Mock).mockResolvedValue(undefined);
    (pickImageAsBlob as jest.Mock).mockResolvedValue(COVER);
  });

  async function fillFormAndSubmit(utils: ReturnType<typeof render>, withCover: boolean) {
    const { getByText, getByLabelText, getByTestId } = utils;
    await waitFor(() => expect(getByLabelText('event.title')).toBeTruthy());
    if (withCover) {
      fireEvent.press(getByLabelText('event.addImage'));
      await waitFor(() => expect(pickImageAsBlob).toHaveBeenCalled());
    }
    fireEvent.changeText(getByLabelText('event.title'), 'Fiesta');
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('startDate')).toBeTruthy());
    fireEvent.press(getByTestId('startDate'));
    fireEvent.press(getByTestId('location-field'));
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('signup-enabled')).toBeTruthy());
    // No form asked for, so Detalles is the last step.
    fireEvent.press(getByTestId('event-form-primary'));
  }

  it('uploads the cover under the new event, then patches imageURL', async () => {
    (uploadEventImage as jest.Mock).mockResolvedValue('https://cdn.test/cover.jpg');
    await fillFormAndSubmit(render(<NewEventScreen />), true);

    await waitFor(() => expect(uploadEventImage).toHaveBeenCalled());
    expect(createEvent).toHaveBeenCalledTimes(1);
    // The new event opens at its village-first URL, built from the pueblo picked.
    const { router } = jest.requireMock('expo-router') as { router: { replace: jest.Mock } };
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(expect.stringMatching(/^\/pueblo\/evento\/.+_e-1$/)));
    expect(uploadEventImage).toHaveBeenCalledWith(
      'm-1',
      'e-1',
      expect.objectContaining({ filename: 'cover.jpg', contentType: 'image/jpeg' }),
    );
    expect(updateEvent).toHaveBeenCalledWith('e-1', { imageURL: 'https://cdn.test/cover.jpg' });
  });

  // The regression: before the event id was stashed, a failed upload left the
  // event created but unnavigated, and pressing the button again ran createEvent
  // a second time — one duplicate event per retry.
  it('does not create a second event when the cover upload fails and the user retries', async () => {
    (uploadEventImage as jest.Mock)
      .mockRejectedValueOnce(
        Object.assign(new Error('Firebase Storage: Max retry time exceeded'), {
          code: 'storage/retry-limit-exceeded',
        }),
      )
      .mockResolvedValueOnce('https://cdn.test/cover.jpg');

    const utils = render(<NewEventScreen />);
    await fillFormAndSubmit(utils, true);
    await waitFor(() => expect(uploadEventImage).toHaveBeenCalledTimes(1));
    expect(createEvent).toHaveBeenCalledTimes(1);

    // Retry from the still-open form.
    fireEvent.press(utils.getByTestId('event-form-primary'));

    await waitFor(() => expect(uploadEventImage).toHaveBeenCalledTimes(2));
    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(uploadEventImage).toHaveBeenLastCalledWith('m-1', 'e-1', expect.anything());
    expect(updateEvent).toHaveBeenCalledWith('e-1', { imageURL: 'https://cdn.test/cover.jpg' });
  });

  it('skips the upload entirely when no cover was picked', async () => {
    await fillFormAndSubmit(render(<NewEventScreen />), false);

    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(uploadEventImage).not.toHaveBeenCalled();
  });
});

// Editing an event you don't organize is a real case: `canEdit` lets a village
// admin in. The screen deliberately does not seed them into organizerUserIds —
// but the picker force-inserts whatever `lockedUserId` it is handed the moment
// its sheet is confirmed, so handing it the current user in edit mode silently
// made the admin an organizer of someone else's event (and organizerUserIds is
// its own clause in the event's update/delete rules, so the rights outlive the
// admin role). Same reasoning, and the same fix, as apps/mobile/app/news/new.tsx.
describe('NewEventScreen edit mode', () => {
  const OTHERS_EVENT = {
    id: 'e-9',
    municipalityId: 'm-1',
    villageSlug: 'villa',
    villageName: 'Pueblo',
    villageCoordinates: { lat: 1, lng: 2 },
    title: 'Verbena',
    description: 'Ajena',
    startDate: new Date('2026-08-01T18:00'),
    endDate: null,
    location: { coordinates: { lat: 1, lng: 2 }, displayName: 'Plaza' },
    maxAttendees: null,
    telephoneRequired: false,
    requiresPayment: false,
    signupGroupSize: 1,
    signupEnabled: true,
    signupInfo: null,
    attendeesVisibility: 'members' as const,
    signupFields: [],
    totalCount: 0,
    // Neither the creator nor an organizer is the signed-in uid-1.
    organizerUserIds: ['uid-2'],
    organizerOrgIds: [],
    createdBy: 'uid-2',
    imageURL: null,
  };

  beforeEach(() => {
    mockParams.eventId = 'e-9';
    mockOrganizerProps.current = null;
    (getEvent as jest.Mock).mockResolvedValue(OTHERS_EVENT);
  });

  afterEach(() => {
    delete mockParams.eventId;
  });

  it('does not lock the editor into the organizer set of an event they do not organize', async () => {
    const { getByTestId } = render(<NewEventScreen />);
    await waitFor(() => expect(getByTestId('organizer-picker')).toBeTruthy());
    // No lockedUserId => confirming the picker's sheet can't force-add the editor.
    expect(mockOrganizerProps.current?.lockedUserId).toBeUndefined();
  });

  it('leaves the loaded organizer list untouched', async () => {
    const { getByTestId } = render(<NewEventScreen />);
    await waitFor(() => expect(getByTestId('organizer-picker')).toBeTruthy());
    expect(mockOrganizerProps.current).toMatchObject({ selectedUserIds: ['uid-2'] });
  });
});

// Turning in-app sign-ups off on an event that already has some is destructive:
// the onEventUpdated trigger deletes every registration and notifies everyone
// on the roster. The count has to be named before the save, not discovered
// after it.
describe('NewEventScreen — disabling sign-ups on an event with registrations', () => {
  const SIGNED_UP_EVENT = {
    id: 'e-8',
    municipalityId: 'm-1',
    villageSlug: 'villa',
    villageName: 'Pueblo',
    villageCoordinates: { lat: 1, lng: 2 },
    title: 'Carrera popular',
    description: 'Desc',
    startDate: new Date('2026-08-01T18:00'),
    endDate: null,
    location: { coordinates: { lat: 1, lng: 2 }, displayName: 'Plaza' },
    maxAttendees: null,
    telephoneRequired: false,
    requiresPayment: false,
    signupGroupSize: 1,
    signupEnabled: true,
    signupInfo: null,
    attendeesVisibility: 'members' as const,
    signupFields: [],
    totalCount: 3,
    organizerUserIds: ['uid-1'],
    organizerOrgIds: [],
    createdBy: 'uid-1',
    imageURL: null,
  };

  beforeEach(() => {
    mockParams.eventId = 'e-8';
    (showConfirm as jest.Mock).mockClear();
    (updateEvent as jest.Mock).mockClear();
    (getEvent as jest.Mock).mockResolvedValue(SIGNED_UP_EVENT);
  });

  afterEach(() => {
    delete mockParams.eventId;
  });

  /** Walks the edit form to its last step with the sign-up toggle switched off. */
  async function openDetailsAndDisableSignups(
    view: ReturnType<typeof render>,
  ): Promise<void> {
    const { getByText, getByTestId } = view;
    await waitFor(() => expect(getByTestId('organizer-picker')).toBeTruthy());
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('startDate')).toBeTruthy());
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('signup-enabled')).toBeTruthy());
    // Off also drops the Preguntas step, so Detalles becomes the last one and
    // its primary button is the save.
    fireEvent.press(getByTestId('signup-enabled'));
  }

  it('asks for confirmation instead of saving straight away', async () => {
    const view = render(<NewEventScreen />);
    await openDetailsAndDisableSignups(view);
    fireEvent.press(view.getByTestId('event-form-primary'));

    expect(showConfirm).toHaveBeenCalledTimes(1);
    expect(updateEvent).not.toHaveBeenCalled();
    // The dialog names how many sign-ups are about to go.
    expect((showConfirm as jest.Mock).mock.calls[0][1]).toBe('event.signupDisableBody');
  });

  it('saves once the organizer confirms', async () => {
    const view = render(<NewEventScreen />);
    await openDetailsAndDisableSignups(view);
    fireEvent.press(view.getByTestId('event-form-primary'));

    const onConfirm = (showConfirm as jest.Mock).mock.calls[0][2] as () => void;
    onConfirm();

    await waitFor(() => expect(updateEvent).toHaveBeenCalledTimes(1));
    expect((updateEvent as jest.Mock).mock.calls[0][1]).toMatchObject({ signupEnabled: false });
  });

  it('saves without a dialog when the event has no sign-ups yet', async () => {
    (getEvent as jest.Mock).mockResolvedValue({ ...SIGNED_UP_EVENT, totalCount: 0 });
    const view = render(<NewEventScreen />);
    await openDetailsAndDisableSignups(view);
    fireEvent.press(view.getByTestId('event-form-primary'));

    expect(showConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(updateEvent).toHaveBeenCalledTimes(1));
  });
});

// The birth-year window is one decision ("¿limito la edad?") followed by an
// optional refinement, not two always-present number boxes. Most events have no
// age range at all, so the Detalles step spent two inputs and a paragraph on a
// field almost nobody fills in.
describe('NewEventScreen — birth-year limit toggle', () => {
  /** Walks a fresh form to the Detalles step, where the toggle lives. */
  async function openDetails(view: ReturnType<typeof render>): Promise<void> {
    const { getByText, getByLabelText, getByTestId } = view;
    await waitFor(() => expect(getByLabelText('event.title')).toBeTruthy());
    fireEvent.changeText(getByLabelText('event.title'), 'Fiesta');
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('startDate')).toBeTruthy());
    fireEvent.press(getByTestId('startDate'));
    fireEvent.press(getByTestId('location-field'));
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('signup-enabled')).toBeTruthy());
  }

  it('hides the year inputs until the limit is switched on', async () => {
    const view = render(<NewEventScreen />);
    await openDetails(view);
    const { getByTestId, queryByTestId } = view;

    const toggle = getByTestId('birth-year-limit');
    expect(toggle.props.accessibilityState.checked).toBe(false);
    expect(queryByTestId('min-birth-year')).toBeNull();
    expect(queryByTestId('max-birth-year')).toBeNull();

    fireEvent.press(toggle);
    expect(getByTestId('min-birth-year')).toBeTruthy();
    expect(getByTestId('max-birth-year')).toBeTruthy();
  });

  // The explanation has to carry three things the inline paragraph used to (or
  // that the example placeholders displaced): it is advisory, a blank end is an
  // open end, and a person with no recorded year is never asked.
  it('parks the explanation behind an info tooltip', async () => {
    const view = render(<NewEventScreen />);
    await openDetails(view);
    const { getByTestId, getByText, queryByText } = view;

    expect(queryByText('event.birthYearLimitHelp')).toBeNull();
    fireEvent.press(getByTestId('birth-year-limit-info'));
    expect(getByText('event.birthYearLimitHelp')).toBeTruthy();
  });

  it('starts switched on when the event being edited already has a bound', async () => {
    mockParams.eventId = 'e-7';
    (getEvent as jest.Mock).mockResolvedValue({
      id: 'e-7',
      municipalityId: 'm-1',
      villageSlug: 'villa',
      villageName: 'Pueblo',
      villageCoordinates: { lat: 1, lng: 2 },
      title: 'Taller infantil',
      description: 'Desc',
      startDate: new Date('2026-08-01T18:00'),
      endDate: null,
      location: { coordinates: { lat: 1, lng: 2 }, displayName: 'Plaza' },
      maxAttendees: null,
      telephoneRequired: false,
      requiresPayment: false,
      signupGroupSize: 1,
      signupEnabled: true,
      signupInfo: null,
      attendeesVisibility: 'members' as const,
      signupFields: [],
      totalCount: 0,
      organizerUserIds: ['uid-1'],
      organizerOrgIds: [],
      createdBy: 'uid-1',
      imageURL: null,
      // Only the upper bound is set: one end is enough to mean "limited".
      minBirthYear: null,
      maxBirthYear: 2020,
    });
    try {
      const { getByText, getByTestId } = render(<NewEventScreen />);
      await waitFor(() => expect(getByTestId('organizer-picker')).toBeTruthy());
      fireEvent.press(getByText('common.stepper.next'));
      await waitFor(() => expect(getByTestId('startDate')).toBeTruthy());
      fireEvent.press(getByText('common.stepper.next'));
      await waitFor(() => expect(getByTestId('birth-year-limit')).toBeTruthy());

      expect(getByTestId('birth-year-limit').props.accessibilityState.checked).toBe(true);
      expect(getByTestId('max-birth-year').props.value).toBe('2020');
    } finally {
      delete mockParams.eventId;
    }
  });

  // Switching the limit off keeps whatever was typed — a mis-tap must not
  // destroy it — so the submitted nulls can only come from the toggle itself.
  it('submits no window when the limit is switched back off, despite typed years', async () => {
    (createEvent as jest.Mock).mockClear();
    const view = render(<NewEventScreen />);
    await openDetails(view);
    const { getByText, getByTestId } = view;

    fireEvent.press(getByTestId('birth-year-limit'));
    fireEvent.changeText(getByTestId('min-birth-year'), '2014');
    fireEvent.changeText(getByTestId('max-birth-year'), '2020');
    fireEvent.press(getByTestId('birth-year-limit'));

    fireEvent.press(getByTestId('event-form-primary'));

    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect((createEvent as jest.Mock).mock.calls[0][0]).toMatchObject({
      minBirthYear: null,
      maxBirthYear: null,
    });
  });
});

// The form toggle is UI state over `signupFields`: an event that already asks
// questions opens with it on, and once answers exist it cannot be switched off
// (those questions key the answers already collected).
describe('NewEventScreen — form toggle in edit mode', () => {
  const QUESTION = { id: 'q-1', label: 'Talla', type: 'text', required: false, options: [] };

  async function openEditDetails(totalCount: number) {
    mockParams.eventId = 'e-8';
    (getEvent as jest.Mock).mockResolvedValue({
      id: 'e-8',
      municipalityId: 'm-1',
      villageSlug: 'villa',
      villageName: 'Pueblo',
      villageCoordinates: { lat: 1, lng: 2 },
      title: 'Carrera',
      description: 'Desc',
      startDate: new Date('2026-08-01T18:00'),
      endDate: null,
      location: { coordinates: { lat: 1, lng: 2 }, displayName: 'Plaza' },
      maxAttendees: null,
      telephoneRequired: false,
      requiresPayment: false,
      signupGroupSize: 1,
      signupEnabled: true,
      signupInfo: null,
      attendeesVisibility: 'members' as const,
      signupFields: [QUESTION],
      totalCount,
      organizerUserIds: ['uid-1'],
      organizerOrgIds: [],
      createdBy: 'uid-1',
      imageURL: null,
      minBirthYear: null,
      maxBirthYear: null,
    });
    const view = render(<NewEventScreen />);
    await waitFor(() => expect(view.getByTestId('organizer-picker')).toBeTruthy());
    fireEvent.press(view.getByText('common.stepper.next'));
    await waitFor(() => expect(view.getByTestId('startDate')).toBeTruthy());
    fireEvent.press(view.getByText('common.stepper.next'));
    await waitFor(() => expect(view.getByTestId('form-enabled')).toBeTruthy());
    return view;
  }

  afterEach(() => {
    delete mockParams.eventId;
  });

  it('starts on, and saves no questions once switched off', async () => {
    (updateEvent as jest.Mock).mockClear();
    const { getByTestId } = await openEditDetails(0);
    const toggle = getByTestId('form-enabled');
    expect(toggle.props.accessibilityState.checked).toBe(true);

    fireEvent.press(toggle);
    fireEvent.press(getByTestId('event-form-primary'));
    await waitFor(() => expect(updateEvent).toHaveBeenCalled());
    expect((updateEvent as jest.Mock).mock.calls[0][1]).toMatchObject({ signupFields: [] });
  });

  it('cannot be switched off once the questions have answers', async () => {
    const { getByTestId } = await openEditDetails(3);
    expect(getByTestId('form-enabled')).toBeDisabled();
  });
});

// A private event is private to ONE organization: the switch only makes sense
// once the event has exactly one organizing org to be private to.
describe('NewEventScreen — private events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Walks the whole wizard and submits. `pickOrgs` runs on the first step, so a
  // test can put the event in the one-org state the privacy switch needs.
  async function submitNewEvent(
    utils: ReturnType<typeof render>,
    onFirstStep?: (u: ReturnType<typeof render>) => void | Promise<void>,
  ) {
    const { getByText, getByLabelText, getByTestId } = utils;
    await waitFor(() => expect(getByLabelText('event.title')).toBeTruthy());
    fireEvent.changeText(getByLabelText('event.title'), 'Fiesta');
    await onFirstStep?.(utils);
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('startDate')).toBeTruthy());
    fireEvent.press(getByTestId('startDate'));
    fireEvent.press(getByTestId('location-field'));
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('signup-enabled')).toBeTruthy());
    fireEvent.press(getByTestId('event-form-primary'));
    await waitFor(() => expect(createEvent).toHaveBeenCalled());
  }

  async function pickOrg(u: ReturnType<typeof render>) {
    fireEvent.press(u.getByTestId('pick-one-org'));
    await waitFor(() => expect(u.getByTestId('private-to-org')).toBeEnabled());
  }

  it('offers the switch only when exactly one org organizes the event', async () => {
    const { getByLabelText, getByTestId, queryByTestId } = render(<NewEventScreen />);
    await waitFor(() => expect(getByLabelText('event.title')).toBeTruthy());

    expect(queryByTestId('private-to-org')).toBeNull();
    fireEvent.press(getByTestId('pick-one-org'));
    expect(getByTestId('private-to-org')).toBeTruthy();
    fireEvent.press(getByTestId('pick-two-orgs'));
    expect(queryByTestId('private-to-org')).toBeNull();
  });

  it('creates a public event by default', async () => {
    await submitNewEvent(render(<NewEventScreen />), (u) =>
      fireEvent.press(u.getByTestId('pick-one-org')),
    );
    expect(jest.mocked(createEvent).mock.calls[0]?.[0]).toMatchObject({
      visibility: 'public',
      visibilityOrgId: null,
    });
  });

  it('creates an event restricted to the organizing org when the switch is on', async () => {
    await submitNewEvent(render(<NewEventScreen />), async (u) => {
      await pickOrg(u);
      fireEvent.press(u.getByTestId('private-to-org'));
    });
    expect(jest.mocked(createEvent).mock.calls[0]?.[0]).toMatchObject({
      visibility: 'organization',
      visibilityOrgId: 'org-1',
    });
  });

  // A private event's URL must never spell out its title: the share preview
  // withholds it, and the address bar, history and copied links would not.
  it('opens a new private event at a URL without its title', async () => {
    const { router } = jest.requireMock('expo-router') as { router: { replace: jest.Mock } };
    await submitNewEvent(render(<NewEventScreen />), async (u) => {
      await pickOrg(u);
      fireEvent.press(u.getByTestId('private-to-org'));
    });
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    const target = String(router.replace.mock.calls.at(-1)?.[0]);
    expect(target).toBe('/pueblo/evento/evento-privado_e-1');
    expect(target).not.toMatch(/fiesta/);
  });

  it('opens a new public event at a URL carrying its title', async () => {
    const { router } = jest.requireMock('expo-router') as { router: { replace: jest.Mock } };
    await submitNewEvent(render(<NewEventScreen />), (u) =>
      fireEvent.press(u.getByTestId('pick-one-org')),
    );
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/pueblo/evento/fiesta_e-1'));
  });

  // The switch is only rendered with one org, but the state it sets outlives
  // adding a second one — and a private event with two orgs has no single
  // membership to gate on, so the submit path has to drop it.
  it('falls back to public when a second org joins after the switch was set', async () => {
    await submitNewEvent(render(<NewEventScreen />), async (u) => {
      await pickOrg(u);
      fireEvent.press(u.getByTestId('private-to-org'));
      fireEvent.press(u.getByTestId('pick-two-orgs'));
    });
    expect(jest.mocked(createEvent).mock.calls[0]?.[0]).toMatchObject({
      visibility: 'public',
      visibilityOrgId: null,
    });
  });
});

describe('NewEventScreen — weekly series', () => {
  beforeEach(() => {
    jest.mocked(createEvent).mockClear();
    jest.mocked(createEventSeries).mockClear();
    jest.mocked(setEventsImage).mockClear();
    jest.mocked(uploadEventImage).mockReset();
    jest.mocked(pickImageAsBlob).mockReset();
  });

  async function toWhenStep(utils: ReturnType<typeof render>) {
    const { getByText, getByLabelText, getByTestId } = utils;
    await waitFor(() => expect(getByLabelText('event.title')).toBeTruthy());
    fireEvent.changeText(getByLabelText('event.title'), 'Yoga');
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('startDate')).toBeTruthy());
  }

  async function submitSeries(utils: ReturnType<typeof render>) {
    const { getByText, getByTestId } = utils;
    await toWhenStep(utils);
    fireEvent.press(getByTestId('startDate')); // Saturday 1 Aug 2026, 18:00
    fireEvent.press(getByTestId('event-recurring'));
    fireEvent.press(getByTestId('event-recurrence-trigger'));
    fireEvent.press(getByTestId('event-recurrence-weekly'));
    fireEvent.press(getByTestId('repeat-day-2')); // add Tuesdays
    fireEvent.press(getByTestId('repeat-until'));
    fireEvent.press(getByTestId('location-field'));
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('signup-enabled')).toBeTruthy());
    fireEvent.press(getByTestId('event-form-primary'));
  }

  it('hides the repeat controls until the switch is on', async () => {
    const utils = render(<NewEventScreen />);
    await toWhenStep(utils);
    expect(utils.queryByTestId('repeat-day-1')).toBeNull();
    expect(utils.queryByTestId('repeat-until')).toBeNull();
    fireEvent.press(utils.getByTestId('startDate'));
    fireEvent.press(utils.getByTestId('event-recurring'));
    fireEvent.press(utils.getByTestId('event-recurrence-trigger'));
    fireEvent.press(utils.getByTestId('event-recurrence-weekly'));
    // Seeded with the first day's own weekday (Saturday).
    expect(utils.getByTestId('repeat-day-6').props.accessibilityState.checked).toBe(true);
    expect(utils.getByTestId('repeat-until')).toBeTruthy();
  });

  it('refuses to go on without a day, a valid last date or a slot that ends after it starts', async () => {
    const utils = render(<NewEventScreen />);
    const { getByText, getByTestId, queryByTestId } = utils;
    await toWhenStep(utils);
    fireEvent.press(getByTestId('startDate')); // Saturday 1 Aug 2026, 18:00
    fireEvent.press(getByTestId('event-recurring'));
    fireEvent.press(getByTestId('event-recurrence-trigger'));
    fireEvent.press(getByTestId('event-recurrence-weekly'));
    fireEvent.press(getByTestId('location-field'));

    fireEvent.press(getByTestId('repeat-day-6')); // untick the seeded Saturday
    expect(getByTestId('repeat-days-error')).toBeTruthy();
    fireEvent.press(getByTestId('repeat-day-6'));
    expect(queryByTestId('repeat-days-error')).toBeNull();

    // The end-time mock answers 18:00 — the same instant the slot starts.
    fireEvent.press(getByTestId('endDate'));
    expect(getByTestId('end-time-error')).toBeTruthy();

    // No "hasta" yet: Next stays on this step.
    fireEvent.press(getByText('common.stepper.next'));
    expect(queryByTestId('signup-enabled')).toBeNull();
  });

  it('flags a last date more than six months after the first day', async () => {
    mockUntil.current = '2027-06-01T00:00';
    try {
      const utils = render(<NewEventScreen />);
      await toWhenStep(utils);
      fireEvent.press(utils.getByTestId('startDate'));
      fireEvent.press(utils.getByTestId('event-recurring'));
    fireEvent.press(utils.getByTestId('event-recurrence-trigger'));
    fireEvent.press(utils.getByTestId('event-recurrence-weekly'));
      fireEvent.press(utils.getByTestId('repeat-until'));
      expect(utils.getByTestId('repeat-until-error')).toBeTruthy();
    } finally {
      mockUntil.current = '2026-08-29T00:00';
    }
  });

  it('creates every occurrence through createEventSeries and opens the first', async () => {
    const { router } = jest.requireMock('expo-router') as { router: { replace: jest.Mock } };
    await submitSeries(render(<NewEventScreen />));
    await waitFor(() => expect(createEventSeries).toHaveBeenCalledTimes(1));
    expect(createEvent).not.toHaveBeenCalled();
    const [input, rule] = jest.mocked(createEventSeries).mock.calls[0]!;
    expect(input).toMatchObject({ title: 'Yoga', endDate: null });
    expect(rule).toMatchObject({ frequency: 'weekly', weekdays: [6, 2] });
    expect(rule.until).toEqual(new Date('2026-08-29T00:00'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/pueblo/evento/yoga_s-0'));
  });

  it('uploads one cover and points every occurrence at it', async () => {
    jest.mocked(pickImageAsBlob).mockResolvedValue({
      blob: { type: 'image/jpeg' } as Blob,
      filename: 'pic.jpg',
      contentType: 'image/jpeg',
      previewUri: 'file:///tmp/pic.jpg',
    });
    jest.mocked(uploadEventImage).mockResolvedValue('https://cdn.test/cover.jpg');
    const utils = render(<NewEventScreen />);
    await waitFor(() => expect(utils.getByLabelText('event.addImage')).toBeTruthy());
    fireEvent.press(utils.getByLabelText('event.addImage'));
    await waitFor(() => expect(pickImageAsBlob).toHaveBeenCalled());
    await submitSeries(utils);
    await waitFor(() => expect(setEventsImage).toHaveBeenCalledWith(['s-0', 's-1', 's-2'], 'https://cdn.test/cover.jpg'));
    expect(uploadEventImage).toHaveBeenCalledTimes(1);
    expect(uploadEventImage).toHaveBeenCalledWith('m-1', 's-0', expect.anything());
  });
});

describe('NewEventScreen — editing one occurrence of a series', () => {
  const OCCURRENCE = {
    id: 's-1',
    municipalityId: 'm-1',
    villageSlug: 'villa',
    villageName: 'Pueblo',
    villageCoordinates: { lat: 1, lng: 2 },
    title: 'Yoga',
    description: '',
    startDate: new Date('2026-08-04T18:00'),
    endDate: null,
    location: { coordinates: { lat: 1, lng: 2 }, displayName: 'Plaza' },
    maxAttendees: null,
    telephoneRequired: false,
    requiresPayment: false,
    signupGroupSize: 1,
    signupEnabled: true,
    signupInfo: null,
    attendeesVisibility: 'members' as const,
    signupFields: [],
    totalCount: 0,
    organizerUserIds: ['uid-1'],
    organizerOrgIds: [],
    createdBy: 'uid-1',
    imageURL: null,
    visibilityOrgId: null,
    series: { id: 's-0', index: 1, weekdays: [2, 6], until: new Date('2026-08-29T00:00') },
  };

  beforeEach(() => {
    mockParams.eventId = 's-1';
    (getEvent as jest.Mock).mockResolvedValue(OCCURRENCE);
    jest.mocked(cancelSeriesFrom).mockClear();
  });

  afterEach(() => {
    delete mockParams.eventId;
  });

  it('says the edit touches only this day, and offers no repeat switch', async () => {
    const { getByText, getByTestId, queryByTestId } = render(<NewEventScreen />);
    await waitFor(() => expect(getByTestId('organizer-picker')).toBeTruthy());
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('series-edit-notice')).toBeTruthy());
    expect(queryByTestId('event-recurring')).toBeNull();
  });

  it('keeps a private series day private when its organizing orgs change', async () => {
    (getEvent as jest.Mock).mockResolvedValue({
      ...OCCURRENCE,
      organizerOrgIds: ['org-1'],
      visibility: 'organization',
      visibilityOrgId: 'org-1',
    });
    jest.mocked(updateEvent).mockClear();
    const { getByTestId, queryByTestId, getByLabelText } = render(<NewEventScreen />);
    await waitFor(() => expect(getByTestId('organizer-picker')).toBeTruthy());
    // One organizing org would normally offer the switch; a series day does not.
    expect(queryByTestId('private-to-org')).toBeNull();

    fireEvent.press(getByTestId('pick-two-orgs'));
    fireEvent.changeText(getByLabelText('event.title'), 'Yoga al aire libre');
    // Edit mode reaches every step; the primary button saves from the last one.
    fireEvent.press(getByTestId('event-form-primary'));
    fireEvent.press(getByTestId('event-form-primary'));
    fireEvent.press(getByTestId('event-form-primary'));
    await waitFor(() => expect(updateEvent).toHaveBeenCalled());
    expect(jest.mocked(updateEvent).mock.calls[0]?.[1]).toMatchObject({
      title: 'Yoga al aire libre',
      organizerOrgIds: ['org-1', 'org-2'],
      visibility: 'organization',
      visibilityOrgId: 'org-1',
    });
  });

  it('cancels this day and the following ones on request', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, btns) => {
      btns?.find((b) => b.text === 'event.cancelSeriesFollowing')?.onPress?.();
    });
    const { getByTestId } = render(<NewEventScreen />);
    await waitFor(() => expect(getByTestId('event-delete')).toBeTruthy());
    fireEvent.press(getByTestId('event-delete'));
    expect(spy).toHaveBeenCalledWith('event.cancelTitle', 'event.cancelSeriesConfirm', expect.any(Array));
    await waitFor(() =>
      expect(cancelSeriesFrom).toHaveBeenCalledWith(
        expect.objectContaining({ id: 's-1', series: OCCURRENCE.series, startDate: OCCURRENCE.startDate }),
      ),
    );
    spy.mockRestore();
  });
});

describe('NewEventScreen — monthly and yearly events, and the group checklist', () => {
  beforeEach(() => {
    jest.mocked(createEvent).mockClear();
    jest.mocked(createEventSeries).mockClear();
    const { createGroupTasks } = jest.requireMock('@cultuvilla/shared/services/groupTaskService') as {
      createGroupTasks: jest.Mock;
    };
    createGroupTasks.mockClear();
    mockMyGroups.current = [];
    mockUntil.current = '2026-08-29T00:00';
  });

  afterEach(() => {
    delete mockParams.copyFrom;
    delete mockParams.villageId;
  });

  async function toWhenStep(utils: ReturnType<typeof render>) {
    const { getByText, getByLabelText, getByTestId } = utils;
    await waitFor(() => expect(getByLabelText('event.title')).toBeTruthy());
    fireEvent.changeText(getByLabelText('event.title'), 'Fiestas');
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('startDate')).toBeTruthy());
  }

  async function toDetailsStep(utils: ReturnType<typeof render>, recurrence: 'monthly' | 'yearly' | null) {
    await toWhenStep(utils);
    const { getByText, getByTestId } = utils;
    fireEvent.press(getByTestId('startDate')); // Saturday 1 Aug 2026, 18:00
    if (recurrence) {
      fireEvent.press(getByTestId('event-recurring'));
      fireEvent.press(getByTestId('event-recurrence-trigger'));
      fireEvent.press(getByTestId(`event-recurrence-${recurrence}`));
    }
    if (recurrence === 'monthly') fireEvent.press(getByTestId('repeat-until'));
    fireEvent.press(getByTestId('location-field'));
    fireEvent.press(getByText('common.stepper.next'));
    await waitFor(() => expect(getByTestId('signup-enabled')).toBeTruthy());
  }

  const createGroupTasksMock = () =>
    (jest.requireMock('@cultuvilla/shared/services/groupTaskService') as { createGroupTasks: jest.Mock })
      .createGroupTasks;

  it('creates a monthly series on the first day of the month it falls on', async () => {
    const utils = render(<NewEventScreen />);
    await toWhenStep(utils);
    fireEvent.press(utils.getByTestId('startDate'));
    fireEvent.press(utils.getByTestId('event-recurring'));
    fireEvent.press(utils.getByTestId('event-recurrence-trigger'));
    fireEvent.press(utils.getByTestId('event-recurrence-monthly'));
    // No weekday row on a monthly event.
    expect(utils.getByTestId('event-recurrence-monthly-hint')).toBeTruthy();
    expect(utils.queryByTestId('repeat-day-1')).toBeNull();
    fireEvent.press(utils.getByTestId('repeat-until'));
    fireEvent.press(utils.getByTestId('location-field'));
    fireEvent.press(utils.getByText('common.stepper.next'));
    await waitFor(() => expect(utils.getByTestId('signup-enabled')).toBeTruthy());
    fireEvent.press(utils.getByTestId('event-form-primary'));
    await waitFor(() => expect(createEventSeries).toHaveBeenCalledTimes(1));
    const [, rule] = jest.mocked(createEventSeries).mock.calls[0]!;
    expect(rule).toEqual({ frequency: 'monthly', until: new Date('2026-08-29T00:00') });
  });

  it('creates a yearly event as one edition, with no last date to pick', async () => {
    const utils = render(<NewEventScreen />);
    await toWhenStep(utils);
    fireEvent.press(utils.getByTestId('event-recurring'));
    // Yearly is the default once the event recurs, shown on the field's right.
    expect(within(utils.getByTestId('event-recurrence-trigger')).getByText('event.frequencyOption.yearly')).toBeTruthy();
    expect(utils.getByTestId('event-recurrence-yearly-hint')).toBeTruthy();
    fireEvent.press(utils.getByTestId('event-recurrence-trigger'));
    expect(utils.getByText('event.frequencyDescription.weekly')).toBeTruthy();
    expect(utils.getByText('event.frequencyDescription.monthly')).toBeTruthy();
    fireEvent.press(utils.getByTestId('event-recurrence-yearly'));
    expect(utils.queryByTestId('event-recurrence')).toBeNull();
    expect(utils.queryByTestId('repeat-until')).toBeNull();
    fireEvent.press(utils.getByTestId('startDate'));
    fireEvent.press(utils.getByTestId('location-field'));
    fireEvent.press(utils.getByText('common.stepper.next'));
    await waitFor(() => expect(utils.getByTestId('signup-enabled')).toBeTruthy());
    fireEvent.press(utils.getByTestId('event-form-primary'));
    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(createEventSeries).not.toHaveBeenCalled();
    expect(jest.mocked(createEvent).mock.calls[0]![0]).toMatchObject({ repeatsYearly: true });
  });

  it('offers a checklist only for an organizing group the creator belongs to', async () => {
    mockMyGroups.current = [{ org: { id: 'org-9', name: 'Otra' }, role: 'admin' }];
    const utils = render(<NewEventScreen />);
    await waitFor(() => expect(utils.getByTestId('organizer-picker')).toBeTruthy());
    fireEvent.press(utils.getByTestId('pick-one-org'));
    await toDetailsStep(utils, null);
    expect(utils.queryByTestId('tasks-enabled')).toBeNull();
  });

  it('offers it to a plain member of the organizing group too', async () => {
    mockMyGroups.current = [{ org: { id: 'org-1', name: 'Peña' }, role: 'member' }];
    const utils = render(<NewEventScreen />);
    await waitFor(() => expect(utils.getByTestId('organizer-picker')).toBeTruthy());
    fireEvent.press(utils.getByTestId('pick-one-org'));
    await toDetailsStep(utils, null);
    expect(utils.getByTestId('tasks-enabled')).toBeTruthy();
  });

  it("asks a yearly event's tasks for a month and writes them to the group, back every year", async () => {
    mockMyGroups.current = [{ org: { id: 'org-1', name: 'Peña' }, role: 'admin' }];
    const utils = render(<NewEventScreen />);
    await waitFor(() => expect(utils.getByTestId('organizer-picker')).toBeTruthy());
    fireEvent.press(utils.getByTestId('pick-one-org'));
    await toDetailsStep(utils, 'yearly');
    fireEvent.press(utils.getByTestId('tasks-enabled'));
    fireEvent.press(utils.getByTestId('event-form-primary')); // Next: the Tareas step
    await waitFor(() => expect(utils.getByTestId('event-task-title-0')).toBeTruthy());
    fireEvent.changeText(utils.getByTestId('event-task-title-0'), 'Contratar la orquesta');
    expect(utils.getByTestId('event-tasks-month-error')).toBeTruthy();
    fireEvent.press(utils.getByTestId('event-form-primary'));
    expect(createEvent).not.toHaveBeenCalled();

    fireEvent.press(utils.getByTestId('event-task-month-0-trigger'));
    fireEvent.press(utils.getByTestId('event-task-month-0-options-3'));
    fireEvent.press(utils.getByTestId('event-task-add'));
    fireEvent.press(utils.getByTestId('event-task-remove-1'));
    fireEvent.press(utils.getByTestId('event-form-primary'));

    await waitFor(() => expect(createGroupTasksMock()).toHaveBeenCalledTimes(1));
    const [orgId, inputs, uid] = createGroupTasksMock().mock.calls[0]!;
    expect(orgId).toBe('org-1');
    expect(uid).toBe('uid-1');
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      title: 'Contratar la orquesta',
      eventId: 'e-1',
      recurrence: { kind: 'calendar', unit: 'year', interval: 1 },
    });
    expect(inputs[0].dueOn).toMatch(/^\d{4}-03-31$/);
  });

  it("dates a one-off event's tasks by an optional day and drops blank rows", async () => {
    mockMyGroups.current = [{ org: { id: 'org-1', name: 'Peña' }, role: 'admin' }];
    mockUntil.current = '2026-07-20T00:00';
    const utils = render(<NewEventScreen />);
    await waitFor(() => expect(utils.getByTestId('organizer-picker')).toBeTruthy());
    fireEvent.press(utils.getByTestId('pick-one-org'));
    await toDetailsStep(utils, null);
    fireEvent.press(utils.getByTestId('tasks-enabled'));
    fireEvent.press(utils.getByTestId('event-form-primary'));
    await waitFor(() => expect(utils.getByTestId('event-task-title-0')).toBeTruthy());
    expect(utils.queryByTestId('event-task-month-0')).toBeNull();
    fireEvent.changeText(utils.getByTestId('event-task-title-0'), 'Comprar bebida');
    fireEvent.press(utils.getByTestId('event-task-date-0'));
    fireEvent.press(utils.getByTestId('event-task-add'));
    fireEvent.press(utils.getByTestId('event-form-primary'));

    await waitFor(() => expect(createGroupTasksMock()).toHaveBeenCalledTimes(1));
    expect(createGroupTasksMock().mock.calls[0]![1]).toEqual([
      { title: 'Comprar bebida', dueOn: '2026-07-20', eventId: 'e-1' },
    ]);
  });

  it('asks which group when the creator administers two of the organizers', async () => {
    mockMyGroups.current = [
      { org: { id: 'org-1', name: 'Peña' }, role: 'admin' },
      { org: { id: 'org-2', name: 'Asociación' }, role: 'admin' },
    ];
    const utils = render(<NewEventScreen />);
    await waitFor(() => expect(utils.getByTestId('organizer-picker')).toBeTruthy());
    fireEvent.press(utils.getByTestId('pick-two-orgs'));
    await toDetailsStep(utils, null);
    fireEvent.press(utils.getByTestId('tasks-enabled'));
    fireEvent.press(utils.getByTestId('event-form-primary'));
    await waitFor(() => expect(utils.getByTestId('event-tasks-group')).toBeTruthy());
    fireEvent.press(utils.getByTestId('event-tasks-group-trigger'));
    fireEvent.press(utils.getByTestId('event-tasks-group-options-org-2'));
    fireEvent.changeText(utils.getByTestId('event-task-title-0'), 'Montar el escenario');
    fireEvent.press(utils.getByTestId('event-form-primary'));
    await waitFor(() => expect(createGroupTasksMock()).toHaveBeenCalledTimes(1));
    expect(createGroupTasksMock().mock.calls[0]![0]).toBe('org-2');
  });

  it.each([
    ['monthly', { repeatsMonthly: true, repeatsYearly: false, repeatDateVaries: true }],
    ['yearly', { repeatsMonthly: false, repeatsYearly: true, repeatDateVaries: true }],
  ] as const)('creates a %s event with a varying date as one edition, asking only for the next date', async (recurrence, flags) => {
    const utils = render(<NewEventScreen />);
    await toWhenStep(utils);
    fireEvent.press(utils.getByTestId('startDate'));
    fireEvent.press(utils.getByTestId('event-recurring'));
    fireEvent.press(utils.getByTestId('event-recurrence-trigger'));
    fireEvent.press(utils.getByTestId(`event-recurrence-${recurrence}`));
    fireEvent.press(utils.getByTestId('event-date-mode-trigger'));
    expect(utils.getByTestId('event-date-mode')).toBeTruthy();
    expect(utils.getByText('event.dateModeDescription.varying')).toBeTruthy();
    fireEvent.press(utils.getByTestId('event-date-mode-varying'));
    expect(utils.getByTestId('event-date-varies-hint')).toBeTruthy();
    expect(utils.getByText('event.nextDateTime')).toBeTruthy();
    expect(utils.queryByTestId('repeat-until')).toBeNull();
    fireEvent.press(utils.getByTestId('location-field'));
    fireEvent.press(utils.getByText('common.stepper.next'));
    await waitFor(() => expect(utils.getByTestId('signup-enabled')).toBeTruthy());
    fireEvent.press(utils.getByTestId('event-form-primary'));
    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(createEventSeries).not.toHaveBeenCalled();
    expect(jest.mocked(createEvent).mock.calls[0]![0]).toMatchObject(flags);
  });

  it('offers no date choice on a weekly event', async () => {
    const utils = render(<NewEventScreen />);
    await toWhenStep(utils);
    fireEvent.press(utils.getByTestId('event-recurring'));
    expect(utils.getByTestId('event-date-mode-trigger')).toBeTruthy();
    fireEvent.press(utils.getByTestId('event-recurrence-trigger'));
    fireEvent.press(utils.getByTestId('event-recurrence-weekly'));
    expect(utils.queryByTestId('event-date-mode-trigger')).toBeNull();
  });

  it('repeats a varying-date event with everything filled in but the date', async () => {
    mockParams.copyFrom = 'taller-1';
    mockParams.villageId = 'm-1';
    (getEvent as jest.Mock).mockResolvedValue({
      id: 'taller-1',
      municipalityId: 'm-1',
      title: 'Taller de bolillos',
      description: '',
      startDate: new Date('2026-08-14T20:00'),
      endDate: new Date('2026-08-14T22:00'),
      location: null,
      maxAttendees: null,
      telephoneRequired: false,
      requiresPayment: false,
      signupGroupSize: 1,
      minBirthYear: null,
      maxBirthYear: null,
      signupEnabled: true,
      signupInfo: null,
      attendeesVisibility: 'members',
      signupFields: [],
      organizerUserIds: ['u-1'],
      organizerOrgIds: [],
      visibilityOrgId: null,
      imageURL: null,
      repeatsYearly: false,
      repeatsMonthly: true,
      repeatDateVaries: true,
    });
    const utils = render(<NewEventScreen />);
    await waitFor(() => expect(utils.getByLabelText('event.title').props.value).toBe('Taller de bolillos'));
    fireEvent.press(utils.getByText('common.stepper.next'));
    await waitFor(() => expect(utils.getByTestId('startDate')).toBeTruthy());
    expect(utils.getByTestId('startDate-value').props.children).toBe('');
    expect(within(utils.getByTestId('event-recurrence-trigger')).getByText('event.frequencyOption.monthly')).toBeTruthy();
    expect(within(utils.getByTestId('event-date-mode-trigger')).getByText('event.dateModeOption.varying')).toBeTruthy();
    expect(utils.getByTestId('event-date-varies-hint')).toBeTruthy();
    expect(utils.queryByTestId('repeat-until')).toBeNull();
  });

  it("prefills next year's edition from a yearly event, a year later, keeping its flyer", async () => {
    mockParams.copyFrom = 'fiestas-2026';
    mockParams.villageId = 'm-1';
    (getEvent as jest.Mock).mockResolvedValue({
      id: 'fiestas-2026',
      municipalityId: 'm-1',
      title: 'Fiestas de agosto',
      description: 'Las de siempre',
      startDate: new Date('2026-08-14T20:00'),
      endDate: new Date('2026-08-17T23:00'),
      location: { coordinates: { lat: 1, lng: 2 }, displayName: 'Plaza' },
      maxAttendees: null,
      telephoneRequired: false,
      requiresPayment: false,
      signupGroupSize: 1,
      signupEnabled: false,
      signupInfo: 'Entrada libre',
      attendeesVisibility: 'members',
      signupFields: [],
      organizerUserIds: ['uid-2'],
      organizerOrgIds: [],
      visibilityOrgId: null,
      repeatsYearly: true,
      imageURL: 'https://img/cartel.jpg',
      minBirthYear: null,
      maxBirthYear: null,
    });
    const utils = render(<NewEventScreen />);
    await waitFor(() => expect(utils.getByLabelText('event.title').props.value).toBe('Fiestas de agosto'));
    fireEvent.press(utils.getByText('common.stepper.next'));
    await waitFor(() => expect(utils.getByTestId('startDate')).toBeTruthy());
    expect(utils.getByTestId('startDate-value').props.children).toBe(new Date('2027-08-14T20:00').toISOString());
    expect(utils.getByTestId('event-recurrence-yearly-hint')).toBeTruthy();
    fireEvent.press(utils.getByText('common.stepper.next'));
    await waitFor(() => expect(utils.getByTestId('signup-enabled')).toBeTruthy());
    fireEvent.press(utils.getByTestId('event-form-primary'));
    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    expect(jest.mocked(createEvent).mock.calls[0]![0]).toMatchObject({
      title: 'Fiestas de agosto',
      repeatsYearly: true,
      imageURL: 'https://img/cartel.jpg',
      endDate: new Date('2027-08-17T23:00'),
      organizerUserIds: ['uid-1', 'uid-2'],
      signupEnabled: false,
    });
  });
});

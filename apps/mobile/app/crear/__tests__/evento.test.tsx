// apps/mobile/app/event/__tests__/new.test.tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import NewEventScreen from '../evento';
import { pickImageAsBlob } from '../../../lib/images';
import { createEvent, updateEvent, getEvent } from '@cultuvilla/shared/services/eventService';
import { uploadEventImage } from '@cultuvilla/shared/services/imageService';
import { getOrganization } from '@cultuvilla/shared/services/organizationService';
import { showConfirm } from '../../../lib/dialogs';

jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'uid-1', email: 'a@b.test' }, profile: { activeMunicipalityId: 'm-1' } }),
}));
jest.mock('../../../lib/firestoreErrorLog', () => ({
  withFirestoreErrorLog: (_label: string, fn: () => unknown) => fn(),
}));
const mockParams: { eventId?: string; villageId?: string } = {};
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
  getOrganization: jest.fn().mockResolvedValue({ id: 'org-1', joinPolicy: 'approval' }),
}));
jest.mock('@cultuvilla/shared/services/eventService', () => ({
  createEvent: jest.fn().mockResolvedValue('e-1'),
  updateEvent: jest.fn(),
  getEvent: jest.fn(),
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
  DateTimeField: ({ onChange, testID, value }: { onChange: (d: Date) => void; testID?: string; value: Date | null }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable testID={testID} onPress={() => onChange(new Date('2026-08-01T18:00'))}>
        <Text testID={`${testID}-value`}>{value ? value.toISOString() : ''}</Text>
      </Pressable>
    );
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

  // The switch only turns on once the org's join policy has loaded.
  async function pickApprovalOrg(u: ReturnType<typeof render>) {
    fireEvent.press(u.getByTestId('pick-one-org'));
    await waitFor(() => expect(getOrganization).toHaveBeenCalledWith('org-1'));
    await waitFor(() => expect(u.getByTestId('private-to-org')).toBeEnabled());
  }

  it('cannot make an event private to an open org, and says why', async () => {
    jest.mocked(getOrganization).mockResolvedValueOnce({ id: 'org-1', joinPolicy: 'open' } as never);
    await submitNewEvent(render(<NewEventScreen />), async (u) => {
      fireEvent.press(u.getByTestId('pick-one-org'));
      await waitFor(() => expect(u.getByText('event.privateToOrgNeedsApproval')).toBeTruthy());
      fireEvent.press(u.getByTestId('private-to-org'));
    });
    expect(jest.mocked(createEvent).mock.calls[0]?.[0]).toMatchObject({
      visibility: 'public',
      visibilityOrgId: null,
    });
  });

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
      await pickApprovalOrg(u);
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
      await pickApprovalOrg(u);
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
      await pickApprovalOrg(u);
      fireEvent.press(u.getByTestId('private-to-org'));
      fireEvent.press(u.getByTestId('pick-two-orgs'));
    });
    expect(jest.mocked(createEvent).mock.calls[0]?.[0]).toMatchObject({
      visibility: 'public',
      visibilityOrgId: null,
    });
  });
});

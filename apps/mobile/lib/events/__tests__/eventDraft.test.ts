import {
  blankEventDraft,
  buildEventCreateInput,
  buildEventUpdate,
  deriveEventDraft,
  draftFromEvent,
  loadedFromEvent,
  type EventDraft,
  type LoadedEvent,
  type ReadyEventDraft,
} from '../eventDraft';

type Stored = Parameters<typeof draftFromEvent>[1];

const START = new Date('2026-08-01T18:00'); // a Saturday

const STORED: Stored = {
  title: 'Fiestas de agosto',
  description: 'Las de siempre',
  startDate: new Date('2026-08-14T20:00'),
  endDate: new Date('2026-08-17T23:00'),
  location: { coordinates: { lat: 1, lng: 2 }, displayName: 'Plaza' },
  maxAttendees: 40,
  telephoneRequired: true,
  requiresPayment: false,
  signupGroupSize: 2,
  minBirthYear: null,
  maxBirthYear: 2020,
  signupEnabled: false,
  signupInfo: 'Entrada libre',
  attendeesVisibility: 'organizers',
  signupFields: [{ id: 'q-1', label: 'Talla', type: 'text', required: false, options: [] }],
  organizerUserIds: ['uid-2', 'uid-1'],
  organizerOrgIds: ['org-1'],
  visibilityOrgId: 'org-1',
  imageURL: 'https://img/cartel.jpg',
  repeatsMonthly: false,
  repeatDateVaries: false,
};

function draft(over: Partial<EventDraft> = {}): EventDraft {
  return { ...blankEventDraft(START), title: 'Fiesta', coords: { lat: 1, lng: 2 }, ...over };
}

function ready(over: Partial<EventDraft> = {}): ReadyEventDraft {
  const d = draft(over);
  return { ...d, startDate: d.startDate ?? START, coords: d.coords ?? { lat: 1, lng: 2 } };
}

function loaded(over: Partial<LoadedEvent> = {}): LoadedEvent {
  return {
    id: 'e-1',
    series: null,
    startDate: START,
    visibilityOrgId: null,
    createdBy: 'uid-1',
    lockedFieldCount: 0,
    groupSizeLocked: false,
    existingSignupCount: 0,
    signupWasEnabled: true,
    ...over,
  };
}

const CREATE_CTX = {
  uid: 'uid-1',
  municipalityId: 'm-1',
  villageName: 'Pueblo',
  villageCoordinates: { lat: 1, lng: 2 },
  hasNewCover: false,
};

function create(over: Partial<EventDraft> = {}, l: LoadedEvent | null = null) {
  const d = ready(over);
  return buildEventCreateInput(d, deriveEventDraft(d, l), CREATE_CTX);
}

function update(over: Partial<EventDraft> = {}, l: LoadedEvent = loaded()) {
  const d = ready(over);
  return buildEventUpdate(d, deriveEventDraft(d, l), { villageName: 'Pueblo' });
}

describe('blankEventDraft', () => {
  it('starts with sign-ups on, a public list and no organizing group unless one is given', () => {
    expect(blankEventDraft(START)).toMatchObject({
      startDate: START,
      signupEnabled: true,
      attendeesPublic: true,
      recurrence: 'yearly',
      organizerOrgIds: [],
      organizerUserIds: [],
    });
    expect(blankEventDraft(START, 'org-9').organizerOrgIds).toEqual(['org-9']);
  });
});

describe('draftFromEvent', () => {
  it('loads an event for editing as it is stored', () => {
    const d = draftFromEvent(blankEventDraft(START), STORED, { mode: 'edit' });
    expect(d).toMatchObject({
      title: 'Fiestas de agosto',
      startDate: STORED.startDate,
      endDate: STORED.endDate,
      coords: { lat: 1, lng: 2 },
      locationName: 'Plaza',
      maxAttendees: '40',
      signupGroupSize: 2,
      minBirthYear: '',
      maxBirthYear: '2020',
      birthYearLimited: true,
      signupEnabled: false,
      signupInfo: 'Entrada libre',
      attendeesPublic: false,
      formEnabled: true,
      organizerUserIds: ['uid-2', 'uid-1'],
      organizerOrgIds: ['org-1'],
      privateToOrg: true,
      existingImageURL: 'https://img/cartel.jpg',
      recurring: false,
    });
  });

  it("makes next year's edition: a year later, the copier first, recurring yearly", () => {
    const d = draftFromEvent(blankEventDraft(START), STORED, { mode: 'copy', uid: 'uid-1' });
    expect(d.startDate).toEqual(new Date('2027-08-14T20:00'));
    expect(d.endDate).toEqual(new Date('2027-08-17T23:00'));
    expect(d.organizerUserIds).toEqual(['uid-1', 'uid-2']);
    expect(d).toMatchObject({ recurring: true, recurrence: 'yearly', dateVaries: false });
    // Last year's flyer is reused unless a new one is picked.
    const input = buildEventCreateInput(
      { ...d, startDate: d.startDate!, coords: d.coords! },
      deriveEventDraft(d, null),
      CREATE_CTX,
    );
    expect(input).toMatchObject({
      title: 'Fiestas de agosto',
      repeatsYearly: true,
      imageURL: 'https://img/cartel.jpg',
      endDate: new Date('2027-08-17T23:00'),
      organizerUserIds: ['uid-1', 'uid-2'],
      signupEnabled: false,
    });
  });

  it('leaves a varying date blank for the organizer, and keeps a monthly one monthly', () => {
    const d = draftFromEvent(
      blankEventDraft(START),
      { ...STORED, repeatsMonthly: true, repeatDateVaries: true },
      { mode: 'copy', uid: 'uid-1' },
    );
    expect(d.startDate).toBeNull();
    expect(d.endDate).toBeNull();
    expect(d).toMatchObject({ recurrence: 'monthly', dateVaries: true });
  });
});

describe('loadedFromEvent', () => {
  const ev = {
    id: 'e-1',
    series: null,
    startDate: START,
    visibilityOrgId: null,
    createdBy: 'uid-1',
    signupFields: STORED.signupFields,
    signupEnabled: true,
  };

  it('locks the answered questions and the group size once anyone signed up', () => {
    expect(loadedFromEvent({ ...ev, totalCount: 3 })).toMatchObject({
      lockedFieldCount: 1,
      groupSizeLocked: true,
      existingSignupCount: 3,
      signupWasEnabled: true,
    });
    expect(loadedFromEvent({ ...ev, totalCount: 0 })).toMatchObject({
      lockedFieldCount: 0,
      groupSizeLocked: false,
    });
  });
});

describe('visibility', () => {
  it('is public by default', () => {
    expect(create({ organizerOrgIds: ['org-1'] })).toMatchObject({ visibility: 'public', visibilityOrgId: null });
  });

  it('is restricted to the single organizing org when the switch is on', () => {
    expect(create({ organizerOrgIds: ['org-1'], privateToOrg: true })).toMatchObject({
      visibility: 'organization',
      visibilityOrgId: 'org-1',
    });
  });

  it('falls back to public when a second org joins after the switch was set', () => {
    expect(create({ organizerOrgIds: ['org-1', 'org-2'], privateToOrg: true })).toMatchObject({
      visibility: 'public',
      visibilityOrgId: null,
    });
  });

  // 7a6c4ffe: deriving it from the organizers made the rules refuse the edit.
  it("keeps a series day's stored visibility whatever its organizers become", () => {
    const day = loaded({
      series: { id: 's-0', index: 1, frequency: 'weekly', weekdays: [2, 6], until: new Date('2026-08-29') },
      visibilityOrgId: 'org-1',
    });
    expect(update({ organizerOrgIds: ['org-1', 'org-2'], privateToOrg: true }, day)).toMatchObject({
      organizerOrgIds: ['org-1', 'org-2'],
      visibility: 'organization',
      visibilityOrgId: 'org-1',
    });
    expect(update({ organizerOrgIds: ['org-1'], privateToOrg: false }, { ...day, visibilityOrgId: null })).toMatchObject({
      visibility: 'public',
      visibilityOrgId: null,
    });
  });
});

describe('recurrence', () => {
  it('makes a weekly series with the chosen weekdays through the last day', () => {
    const until = new Date('2026-08-29T00:00');
    const x = deriveEventDraft(
      draft({ recurring: true, recurrence: 'weekly', repeatWeekdays: [2, 6], repeatUntil: until }),
      null,
    );
    expect(x).toMatchObject({ isSeries: true, weekly: true, repeatsYearly: false, seriesUntilInvalid: false });
    expect(x.seriesRule).toEqual({ frequency: 'weekly', weekdays: [2, 6], until });
  });

  it('makes a monthly series on its fixed day', () => {
    const until = new Date('2026-08-29T00:00');
    const x = deriveEventDraft(draft({ recurring: true, recurrence: 'monthly', repeatUntil: until }), null);
    expect(x.seriesRule).toEqual({ frequency: 'monthly', until });
  });

  it('keeps a yearly event, or a monthly one whose date varies, a single edition', () => {
    expect(deriveEventDraft(draft({ recurring: true, recurrence: 'yearly' }), null)).toMatchObject({
      isSeries: false,
      seriesRule: null,
      repeatsYearly: true,
      repeatsMonthly: false,
      varyingDate: false,
    });
    const monthly = deriveEventDraft(
      draft({ recurring: true, recurrence: 'monthly', dateVaries: true, repeatUntil: new Date('2026-09-01') }),
      null,
    );
    expect(monthly).toMatchObject({ isSeries: false, seriesRule: null, repeatsMonthly: true, varyingDate: true });
    expect(create({ recurring: true, recurrence: 'monthly', dateVaries: true })).toMatchObject({
      repeatsYearly: false,
      repeatsMonthly: true,
      repeatDateVaries: true,
    });
  });

  it('never varies a weekly date', () => {
    expect(deriveEventDraft(draft({ recurring: true, recurrence: 'weekly', dateVaries: true }), null).varyingDate).toBe(false);
  });

  it("puts the slot's end time on the first day and refuses one that does not end after it starts", () => {
    const base = { recurring: true, recurrence: 'weekly' as const, repeatWeekdays: [6], repeatUntil: new Date('2026-08-29') };
    const ok = deriveEventDraft(draft({ ...base, endDate: new Date('2026-09-20T20:30') }), null);
    expect(ok.slotEnd).toEqual(new Date('2026-08-01T20:30'));
    expect(ok.seriesEndInvalid).toBe(false);
    const same = deriveEventDraft(draft({ ...base, endDate: new Date('2026-09-20T18:00') }), null);
    expect(same.seriesEndInvalid).toBe(true);
    // A single event's end is a real date, not a slot.
    expect(deriveEventDraft(draft({ endDate: new Date('2026-08-02T01:00') }), null).slotEnd).toBeNull();
  });

  it('refuses a last day that is missing, before the first, or too far away', () => {
    const weekly = { recurring: true, recurrence: 'weekly' as const, repeatWeekdays: [6] };
    expect(deriveEventDraft(draft(weekly), null).seriesUntilInvalid).toBe(true);
    expect(deriveEventDraft(draft({ ...weekly, repeatUntil: new Date('2026-07-01') }), null).seriesUntilInvalid).toBe(true);
    expect(deriveEventDraft(draft({ ...weekly, repeatUntil: new Date('2027-03-01') }), null).seriesUntilInvalid).toBe(true);
    expect(deriveEventDraft(draft({ ...weekly, repeatUntil: new Date('2026-08-29') }), null).seriesUntilInvalid).toBe(false);
  });
});

describe('birth-year window', () => {
  it('flags a backwards window or a year outside sensible bounds, only while limited', () => {
    expect(deriveEventDraft(draft({ birthYearLimited: true, minBirthYear: '2020', maxBirthYear: '2014' }), null))
      .toMatchObject({ birthYearRangeInvalid: true, birthYearOutOfBounds: false });
    expect(deriveEventDraft(draft({ birthYearLimited: true, minBirthYear: '1899' }), null).birthYearOutOfBounds).toBe(true);
    expect(deriveEventDraft(draft({ birthYearLimited: true, maxBirthYear: '2201' }), null).birthYearOutOfBounds).toBe(true);
    expect(deriveEventDraft(draft({ birthYearLimited: true, minBirthYear: '20.5' }), null).birthYearOutOfBounds).toBe(true);
    expect(deriveEventDraft(draft({ birthYearLimited: false, minBirthYear: '2020', maxBirthYear: '1800' }), null))
      .toMatchObject({ birthYearRangeInvalid: false, birthYearOutOfBounds: false });
  });

  it('saves the typed years, a blank end as an open end', () => {
    expect(create({ birthYearLimited: true, minBirthYear: '2014', maxBirthYear: '' })).toMatchObject({
      minBirthYear: 2014,
      maxBirthYear: null,
    });
  });

  it('saves no window once the limit is switched back off, despite typed years', () => {
    expect(create({ birthYearLimited: false, minBirthYear: '2014', maxBirthYear: '2020' })).toMatchObject({
      minBirthYear: null,
      maxBirthYear: null,
    });
  });

  it('saves no window on an event that takes no in-app sign-ups', () => {
    expect(
      create({ signupEnabled: false, birthYearLimited: true, minBirthYear: '2014', maxBirthYear: '2020' }),
    ).toMatchObject({ minBirthYear: null, maxBirthYear: null });
  });
});

describe('sign-ups', () => {
  it('saves a trimmed note only while in-app sign-ups are off', () => {
    expect(create({ signupEnabled: false, signupInfo: '  Inscripciones en el ayuntamiento  ' }).signupInfo).toBe(
      'Inscripciones en el ayuntamiento',
    );
    expect(create({ signupEnabled: false, signupInfo: '   ' }).signupInfo).toBeNull();
    expect(create({ signupEnabled: true, signupInfo: 'Entrada libre' }).signupInfo).toBeNull();
  });

  it('parses the capacity and the attendee-list visibility', () => {
    expect(create({ maxAttendees: '50', attendeesPublic: false })).toMatchObject({
      maxAttendees: 50,
      attendeesVisibility: 'organizers',
    });
    expect(create({ maxAttendees: '  ' })).toMatchObject({ maxAttendees: null, attendeesVisibility: 'members' });
  });

  it('trims the text and falls back to the village for an unnamed place', () => {
    const input = create({ title: '  Fiesta  ', description: ' Desc ', locationName: '  ' });
    expect(input).toMatchObject({ title: 'Fiesta', description: 'Desc', status: 'published', createdBy: 'uid-1' });
    expect(input.location.displayName).toBe('Pueblo');
  });

  it('warns before wiping a roster: sign-ups switched off on an event that has some', () => {
    expect(deriveEventDraft(draft({ signupEnabled: false }), loaded({ existingSignupCount: 2 })).signupsWouldBeWiped).toBe(true);
    expect(deriveEventDraft(draft({ signupEnabled: false }), loaded({ existingSignupCount: 0 })).signupsWouldBeWiped).toBe(false);
    expect(
      deriveEventDraft(draft({ signupEnabled: false }), loaded({ existingSignupCount: 2, signupWasEnabled: false }))
        .signupsWouldBeWiped,
    ).toBe(false);
    expect(deriveEventDraft(draft({ signupEnabled: false }), null).signupsWouldBeWiped).toBe(false);
  });
});

describe('sign-up questions', () => {
  const text = (id: string, label: string) => ({ id, label, type: 'text' as const, required: false, options: [] });
  const select = (id: string, label: string, options: string[]) => ({
    id,
    label,
    type: 'select' as const,
    required: false,
    options,
  });

  it('drops half-finished rows and blank options, and trims labels', () => {
    const input = create({
      formEnabled: true,
      signupFields: [
        text('a', '  Talla  '),
        text('b', '   '),
        select('c', 'Menú', ['Carne', ' ', '']),
        select('d', 'Turno', ['', ' ']),
      ],
    });
    expect(input.signupFields).toEqual([text('a', 'Talla'), select('c', 'Menú', ['Carne'])]);
  });

  it('keeps answered (locked) rows whatever state they are in', () => {
    const fields = [select('a', 'Turno', ['']), text('b', '')];
    expect(update({ formEnabled: true, signupFields: fields }, loaded({ lockedFieldCount: 1 })).signupFields).toEqual([
      select('a', 'Turno', []),
    ]);
  });

  it('saves no questions once the form is switched off', () => {
    expect(update({ formEnabled: false, signupFields: [text('a', 'Talla')] }).signupFields).toEqual([]);
  });
});

describe('create versus update', () => {
  it('only a create carries the recurrence, the cover and the village', () => {
    const patch = update();
    expect(patch).not.toHaveProperty('imageURL');
    expect(patch).not.toHaveProperty('repeatsYearly');
    expect(patch).not.toHaveProperty('municipalityId');
    expect(create({ existingImageURL: 'https://img/a.jpg' }).imageURL).toBe('https://img/a.jpg');
    const d = ready({ existingImageURL: 'https://img/a.jpg' });
    expect(buildEventCreateInput(d, deriveEventDraft(d, null), { ...CREATE_CTX, hasNewCover: true }).imageURL).toBeNull();
  });
});

import {
  MAX_EVENT_BIRTH_YEAR,
  MIN_EVENT_BIRTH_YEAR,
  type EventData,
  type EventDataInput,
} from '@cultuvilla/shared/models/event/EventDataModel';
import {
  maxSeriesDays,
  seriesOccurrences,
  seriesSpanDays,
  type SeriesRule,
} from '@cultuvilla/shared/models/event/EventSeriesModel';
import { isUsableSignupField, type SignupFieldSpec } from '@cultuvilla/shared/models/event/SignupFieldModel';
import { buildLocationData, type LatLng } from '@cultuvilla/shared/models/core/LocationDataModel';

export type Recurrence = 'weekly' | 'monthly' | 'yearly';

/**
 * Every editable field of the event form, as its inputs hold it. Numbers the
 * user types stay strings so a half-typed value doesn't fight the state; the
 * payload builders parse them.
 */
export interface EventDraft {
  title: string;
  description: string;
  startDate: Date | null;
  /** Optional multi-day end; null = single-day event. For a series only its
   *  time is used — the end of each occurrence's slot, on that same day. */
  endDate: Date | null;
  // Recurrence (create only). A weekly or monthly one is a series: every
  // occurrence through the last calendar day becomes its own event doc on
  // submit, weekly ones on the chosen weekdays (ISO 1–7). A yearly one is a
  // single edition flagged `repeatsYearly`. With `dateVaries` a monthly one is
  // a single edition too: its next day can't be derived, so there is no series.
  recurring: boolean;
  recurrence: Recurrence;
  dateVaries: boolean;
  repeatWeekdays: number[];
  repeatUntil: Date | null;
  coords: LatLng | null;
  locationName: string;
  maxAttendees: string;
  telephoneRequired: boolean;
  requiresPayment: boolean;
  /** 1 = ordinary individual sign-up. */
  signupGroupSize: number;
  // Advisory birth-year window ("nacidos entre X y Y"). The window is one
  // decision — "¿limito la edad?" — and an optional refinement. Switching it
  // off keeps whatever was typed so a mis-tap doesn't destroy it; the payload
  // reads the toggle, not the text.
  birthYearLimited: boolean;
  minBirthYear: string;
  maxBirthYear: string;
  /** Off = the event takes no sign-ups through the app (entrada libre, or a
   *  list kept elsewhere). `signupInfo` then replaces the sign-up button. */
  signupEnabled: boolean;
  signupInfo: string;
  /** Default on: in a pueblo, seeing who is going is what drives sign-ups. */
  attendeesPublic: boolean;
  /** Restrict the event to the members of its single organizing org. Kept as a
   *  boolean rather than the org id itself so the switch survives the user
   *  swapping which org organizes; the id is derived (`visibilityOrgId`). */
  privateToOrg: boolean;
  /** Off by default: the Preguntas step only exists once the creator asks for a form. */
  formEnabled: boolean;
  signupFields: SignupFieldSpec[];
  organizerUserIds: string[];
  organizerOrgIds: string[];
  /** The cover already stored (edit), or last year's flyer (copy). */
  existingImageURL: string | null;
}

/** What edit mode knows about the event as loaded, before any edit. */
export interface LoadedEvent extends Pick<EventData, 'series' | 'startDate' | 'visibilityOrgId' | 'createdBy'> {
  id: string;
  /** Answers already collected are keyed by these rows' ids, so once the event
   *  has sign-ups the existing rows are frozen and only new ones can be added. */
  lockedFieldCount: number;
  /** Seats already booked were seated against the old size (firestore.rules
   *  enforces the same, see isFrozenGroupSizeChange). */
  groupSizeLocked: boolean;
  existingSignupCount: number;
  /** Whether it took sign-ups when the form opened: flipping the flag off is
   *  only destructive from that state. */
  signupWasEnabled: boolean;
}

/** The create-mode defaults. The creator's uid is seeded separately, once auth resolves. */
export function blankEventDraft(startDate: Date | null, organizerOrgId?: string): EventDraft {
  return {
    title: '',
    description: '',
    startDate,
    endDate: null,
    recurring: false,
    recurrence: 'yearly',
    dateVaries: false,
    repeatWeekdays: [],
    repeatUntil: null,
    coords: null,
    locationName: '',
    maxAttendees: '',
    telephoneRequired: false,
    requiresPayment: false,
    signupGroupSize: 1,
    birthYearLimited: false,
    minBirthYear: '',
    maxBirthYear: '',
    signupEnabled: true,
    signupInfo: '',
    attendeesPublic: true,
    privateToOrg: false,
    formEnabled: false,
    signupFields: [],
    organizerUserIds: [],
    organizerOrgIds: organizerOrgId ? [organizerOrgId] : [],
    existingImageURL: null,
  };
}

/** The same wall-clock moment a year later — the next edition of a yearly event. */
function nextYear(d: Date): Date {
  const out = new Date(d);
  out.setFullYear(out.getFullYear() + 1);
  return out;
}

/** `time`'s hour and minute on `day`'s calendar date. */
function timeOnDay(day: Date, time: Date): Date {
  const out = new Date(day);
  out.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return out;
}

type PrefillSource = Pick<
  EventData,
  | 'title'
  | 'description'
  | 'startDate'
  | 'endDate'
  | 'location'
  | 'maxAttendees'
  | 'telephoneRequired'
  | 'requiresPayment'
  | 'signupGroupSize'
  | 'minBirthYear'
  | 'maxBirthYear'
  | 'signupEnabled'
  | 'signupInfo'
  | 'attendeesVisibility'
  | 'signupFields'
  | 'organizerUserIds'
  | 'organizerOrgIds'
  | 'visibilityOrgId'
  | 'imageURL'
  | 'repeatsMonthly'
  | 'repeatDateVaries'
>;

/**
 * The form prefilled from a stored event, on top of `base` (the fields an
 * event doesn't carry — the recurrence's weekdays and last day — keep base's).
 * Edit mode loads the event as it is. Copy mode is next year's edition: its
 * dates move a year (or clear when the date varies, the one thing left for the
 * organizer to fill in), the copier leads the organizers, and it recurs.
 */
export function draftFromEvent(
  base: EventDraft,
  ev: PrefillSource,
  opts: { mode: 'edit' } | { mode: 'copy'; uid: string },
): EventDraft {
  const signupFields = ev.signupFields ?? [];
  const shared: EventDraft = {
    ...base,
    title: ev.title,
    description: ev.description,
    coords: ev.location?.coordinates ?? null,
    locationName: ev.location?.displayName ?? '',
    maxAttendees: ev.maxAttendees != null ? String(ev.maxAttendees) : '',
    telephoneRequired: !!ev.telephoneRequired,
    requiresPayment: !!ev.requiresPayment,
    signupGroupSize: ev.signupGroupSize,
    minBirthYear: ev.minBirthYear == null ? '' : String(ev.minBirthYear),
    maxBirthYear: ev.maxBirthYear == null ? '' : String(ev.maxBirthYear),
    birthYearLimited: ev.minBirthYear != null || ev.maxBirthYear != null,
    signupEnabled: ev.signupEnabled !== false,
    signupInfo: ev.signupInfo ?? '',
    attendeesPublic: ev.attendeesVisibility !== 'organizers',
    signupFields,
    formEnabled: signupFields.length > 0,
    organizerOrgIds: ev.organizerOrgIds ?? [],
    privateToOrg: ev.visibilityOrgId !== null,
    existingImageURL: ev.imageURL ?? null,
  };
  if (opts.mode === 'edit') {
    return {
      ...shared,
      startDate: ev.startDate,
      endDate: ev.endDate ?? null,
      organizerUserIds: ev.organizerUserIds ?? [],
    };
  }
  return {
    ...shared,
    startDate: ev.repeatDateVaries ? null : nextYear(ev.startDate),
    endDate: ev.endDate && !ev.repeatDateVaries ? nextYear(ev.endDate) : null,
    organizerUserIds: [opts.uid, ...(ev.organizerUserIds ?? []).filter((id) => id !== opts.uid)],
    recurring: true,
    recurrence: ev.repeatsMonthly ? 'monthly' : 'yearly',
    dateVaries: ev.repeatDateVaries,
  };
}

export function loadedFromEvent(
  ev: Pick<EventData, 'series' | 'startDate' | 'visibilityOrgId' | 'createdBy' | 'signupFields' | 'totalCount' | 'signupEnabled'> & {
    id: string;
  },
): LoadedEvent {
  return {
    id: ev.id,
    series: ev.series,
    startDate: ev.startDate,
    visibilityOrgId: ev.visibilityOrgId,
    createdBy: ev.createdBy,
    lockedFieldCount: ev.totalCount > 0 ? (ev.signupFields ?? []).length : 0,
    groupSizeLocked: ev.totalCount > 0,
    existingSignupCount: ev.totalCount,
    signupWasEnabled: ev.signupEnabled !== false,
  };
}

export interface DerivedEventDraft {
  /**
   * A private event names exactly one org, and that org must be one of the
   * organizers — the switch is only offered in that case, but a stale toggle
   * left behind by adding a second org must not slip through. The same value
   * is saved AND used to build the event's URL, so a private event is never
   * opened at a URL that spells out its title. A day of a series keeps the
   * series' stored visibility whatever the organizer set becomes: the rules
   * refuse a change on one occurrence.
   */
  visibilityOrgId: string | null;
  varyingDate: boolean;
  seriesFrequency: 'weekly' | 'monthly' | null;
  isSeries: boolean;
  weekly: boolean;
  repeatsYearly: boolean;
  repeatsMonthly: boolean;
  seriesRule: SeriesRule | null;
  /** A series' slot end: the picked end time on the first day. */
  slotEnd: Date | null;
  seriesEndInvalid: boolean;
  seriesUntilInvalid: boolean;
  birthYearOutOfBounds: boolean;
  birthYearRangeInvalid: boolean;
  /** Saving would wipe the roster: sign-ups are being switched off on an event that has some. */
  signupsWouldBeWiped: boolean;
  lockedFieldCount: number;
}

const yearOutOfBounds = (y: number | null) =>
  y !== null && (!Number.isInteger(y) || y < MIN_EVENT_BIRTH_YEAR || y > MAX_EVENT_BIRTH_YEAR);

/** `loaded` is the event being edited, or null when composing a new one. */
export function deriveEventDraft(d: EventDraft, loaded: LoadedEvent | null): DerivedEventDraft {
  const visibilityOrgId = loaded?.series
    ? loaded.visibilityOrgId
    : d.privateToOrg && d.organizerOrgIds.length === 1
      ? (d.organizerOrgIds[0] ?? null)
      : null;

  // A blank end is an open-ended window, not an error.
  const minYear = d.minBirthYear.trim() ? Number(d.minBirthYear) : null;
  const maxYear = d.maxBirthYear.trim() ? Number(d.maxBirthYear) : null;
  const birthYearOutOfBounds = d.birthYearLimited && (yearOutOfBounds(minYear) || yearOutOfBounds(maxYear));
  const birthYearRangeInvalid =
    d.birthYearLimited && minYear !== null && maxYear !== null && maxYear < minYear;

  const varyingDate = d.recurring && d.recurrence !== 'weekly' && d.dateVaries;
  const seriesFrequency = !d.recurring || varyingDate || d.recurrence === 'yearly' ? null : d.recurrence;
  const isSeries = seriesFrequency !== null;
  const weekly = seriesFrequency === 'weekly';
  const seriesRule: SeriesRule | null =
    seriesFrequency === 'weekly' && d.repeatUntil
      ? { frequency: 'weekly', weekdays: d.repeatWeekdays, until: d.repeatUntil }
      : seriesFrequency === 'monthly' && d.repeatUntil
        ? { frequency: 'monthly', until: d.repeatUntil }
        : null;

  // Every occurrence shifts the slot's start and end by the same number of days.
  const { startDate, endDate, repeatUntil } = d;
  const slotEnd = isSeries && startDate && endDate ? timeOnDay(startDate, endDate) : null;
  const seriesEndInvalid = slotEnd !== null && startDate !== null && slotEnd <= startDate;
  const seriesUntilInvalid =
    isSeries &&
    (!repeatUntil ||
      !startDate ||
      seriesSpanDays(startDate, repeatUntil) < 0 ||
      seriesSpanDays(startDate, repeatUntil) > maxSeriesDays(seriesFrequency) ||
      (seriesRule !== null &&
        (!weekly || d.repeatWeekdays.length > 0) &&
        seriesOccurrences({ startDate, endDate: null }, seriesRule).length === 0));

  return {
    visibilityOrgId,
    varyingDate,
    seriesFrequency,
    isSeries,
    weekly,
    repeatsYearly: d.recurring && d.recurrence === 'yearly',
    repeatsMonthly: varyingDate && d.recurrence === 'monthly',
    seriesRule,
    slotEnd,
    seriesEndInvalid,
    seriesUntilInvalid,
    birthYearOutOfBounds,
    birthYearRangeInvalid,
    signupsWouldBeWiped:
      loaded !== null && loaded.signupWasEnabled && !d.signupEnabled && loaded.existingSignupCount > 0,
    lockedFieldCount: loaded?.lockedFieldCount ?? 0,
  };
}

/** A draft the steps have validated: it has a start and a location. */
export type ReadyEventDraft = EventDraft & { startDate: Date; coords: LatLng };

/** The fields create and update write alike, each converted in this one place. */
function commonFields(d: ReadyEventDraft, x: DerivedEventDraft, villageName: string) {
  // A window is only read by the in-app sign-up sheet, so it is dropped
  // outright when in-app sign-ups are off — same rule as signupInfo, and the
  // one firestore.rules encodes.
  const yearsApply = d.signupEnabled && d.birthYearLimited;
  // Half-finished rows (no label yet, or a select with no options to pick)
  // would be unanswerable, so they never reach the event doc. Locked rows are
  // kept verbatim — dropping one would break the additive-only rule. With the
  // form switched off the questions are dropped, which is only reachable while
  // none are locked (the toggle is disabled otherwise).
  const signupFields = (d.formEnabled ? d.signupFields : [])
    .map((f) => ({
      ...f,
      label: f.label.trim(),
      // The options editor appends an empty row as you type; a blank option is
      // unanswerable and fails the model's `min(1)` on read.
      options: f.options.map((o) => o.trim()).filter((o) => o.length > 0),
    }))
    .filter((f, i) => i < x.lockedFieldCount || (f.label.length > 0 && isUsableSignupField(f)));
  // A note about signing up elsewhere is only meaningful with in-app sign-ups off.
  const signupInfo = d.signupInfo.trim() ? d.signupInfo.trim() : null;

  return {
    title: d.title.trim(),
    description: d.description.trim(),
    startDate: d.startDate,
    endDate: d.endDate,
    location: buildLocationData({
      coordinates: d.coords,
      displayName: d.locationName.trim() || villageName,
    }),
    maxAttendees: d.maxAttendees.trim() ? Number(d.maxAttendees) : null,
    telephoneRequired: d.telephoneRequired,
    requiresPayment: d.requiresPayment,
    signupEnabled: d.signupEnabled,
    signupInfo: d.signupEnabled ? null : signupInfo,
    attendeesVisibility: d.attendeesPublic ? ('members' as const) : ('organizers' as const),
    signupFields,
    signupGroupSize: d.signupGroupSize,
    minBirthYear: yearsApply && d.minBirthYear.trim() ? Number(d.minBirthYear) : null,
    maxBirthYear: yearsApply && d.maxBirthYear.trim() ? Number(d.maxBirthYear) : null,
    organizerUserIds: d.organizerUserIds,
    organizerOrgIds: d.organizerOrgIds,
    visibility: x.visibilityOrgId === null ? ('public' as const) : ('organization' as const),
    visibilityOrgId: x.visibilityOrgId,
  };
}

/** The patch an edit saves. The cover is patched separately, and only when replaced. */
export function buildEventUpdate(
  d: ReadyEventDraft,
  x: DerivedEventDraft,
  ctx: { villageName: string },
): ReturnType<typeof commonFields> {
  return commonFields(d, x, ctx.villageName);
}

/** A new event (or a series' template: the caller swaps in the slot end). */
export function buildEventCreateInput(
  d: ReadyEventDraft,
  x: DerivedEventDraft,
  ctx: {
    uid: string;
    municipalityId: string;
    villageName: string;
    villageCoordinates: LatLng | null;
    /** A newly picked cover is uploaded after create, under the new id. */
    hasNewCover: boolean;
  },
): Omit<EventDataInput, 'villageSlug' | 'series'> {
  return {
    ...commonFields(d, x, ctx.villageName),
    // Copy mode reuses last year's flyer unless a new one is picked.
    imageURL: ctx.hasNewCover ? null : d.existingImageURL,
    repeatsYearly: x.repeatsYearly,
    repeatsMonthly: x.repeatsMonthly,
    repeatDateVaries: x.varyingDate,
    status: 'published',
    createdBy: ctx.uid,
    municipalityId: ctx.municipalityId,
    villageName: ctx.villageName,
    villageCoordinates: ctx.villageCoordinates,
  };
}

// Handler tests for what a cancellation *tells people*: the mail that goes out
// and the notification that outlives it.
// Runs against the Firestore + Auth emulators via firebase-admin.

import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';

vi.mock('../../auth/secret', () => ({
  RESEND_API_KEY: { value: () => 'TEST_RESEND_KEY' },
}));

interface SendCallArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const sendMock = vi.fn((_args: SendCallArgs) =>
  Promise.resolve({ data: { id: 'test-email-id' }, error: null }),
);
vi.mock('resend', () => ({
  Resend: vi.fn(function ResendMock(this: {
    emails: { send: typeof sendMock };
  }) {
    this.emails = { send: sendMock };
  }),
}));

import { registerToEvent } from '../../events/registerToEvent';
import { cancelRegistration } from '../../events/cancelRegistration';

const ft = functionsTestFactory({
  projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test',
});

const MUNICIPALITY_ID = 'mun-1';
const EVENT_ID = 'e1';
const ATTENDEE = 'alice';
const ORGANIZER = 'creator-1';

const db = () => admin.firestore();

async function seedEvent(signupGroupSize = 1) {
  const now = new Date();
  await db()
    .doc(`events/${EVENT_ID}`)
    .set({
      signupFields: [],
      signupGroupSize,
      title: 'Fiesta de San Juan',
      description: 'Una fiesta',
      startDate: now,
      endDate: null,
      location: {
        coordinates: { lat: 40.4, lng: -3.7 },
        displayName: 'Plaza Mayor',
      },
      imageURL: null,
      maxAttendees: null,
      telephoneRequired: false,
      requiresPayment: false,
      attendeesVisibility: 'members',
      status: 'published',
      organizerUserIds: [ORGANIZER],
      organizerOrgIds: [],
      createdBy: ORGANIZER,
      createdAt: now,
      updatedAt: now,
      municipalityId: MUNICIPALITY_ID,
      villageName: 'Villarriba',
      villageSlug: 'villarriba',
      villageCoverImage: null,
      villageCoordinates: null,
      confirmedCount: 0,
      totalCount: 0,
      endBoundary: now,
      commentCount: 0,
      readCount: 0,
    });
}

async function seedPerson(personId: string, uid: string) {
  await db().doc(`persons/${personId}`).set({
    givenName: personId,
    middleNames: [],
    firstSurname: 'García',
    secondSurname: null,
    nickname: null,
    sex: null,
    birthday: null,
    deathDate: null,
    birthPlace: null,
    burialPlace: null,
    municipalityLinks: [],
    occupations: [],
    biography: null,
    photoURL: null,
    userId: uid,
    isPublic: true,
    createdBy: uid,
    createdAt: new Date(),
  });
}

async function seedUser(uid: string) {
  // Tests run as a non-production project, where mail reaches only an
  // account in this project's Auth (docs/decisions/non-production-never-reaches-real-people.md).
  await admin.auth().createUser({ uid, email: `${uid}@example.test` });
  await db()
    .doc(`users/${uid}`)
    .set({
      displayName: uid,
      email: `${uid}@example.test`,
      telephone: null,
      activeMunicipalityId: MUNICIPALITY_ID,
      personId: null,
      createdAt: new Date(),
      termsAcceptedAt: new Date(),
      termsVersion: '1.0.0',
    });
}

function call<T>(fn: unknown, uid: string | null, data: unknown): Promise<T> {
  const wrapped = ft.wrap(fn as Parameters<typeof ft.wrap>[0]);
  return wrapped({
    data,
    auth: uid ? { uid, token: {} } : undefined,
  });
}

interface RegisterResult {
  registrations: { id: string; status: string; position: number }[];
  openSeats: { registrationId: string; token: string }[];
}

async function signUp(names: string[]): Promise<RegisterResult> {
  return call<RegisterResult>(registerToEvent, ATTENDEE, {
    eventId: EVENT_ID,
    registrants: names.map((name) => ({
      personId: `${ATTENDEE}-${name}`,
      name,
    })),
    openSeats: 0,
  });
}

type NotificationRow = Record<string, unknown> & { id: string };

async function notificationsFor(uid: string): Promise<NotificationRow[]> {
  const snap = await db().collection(`users/${uid}/notifications`).get();
  return snap.docs.map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id }));
}

/** The cancellation mail, ignoring the confirmation the sign-up itself sent. */
function cancellationMail(): SendCallArgs | undefined {
  return sendMock.mock.calls
    .map(([args]) => args)
    .find((args) => /cancelada|de baja/.test(args.subject));
}

describe('cancellation notices', () => {
  beforeAll(async () => {
    await resetEmulators();
  });

  beforeEach(async () => {
    await resetEmulators();
    sendMock.mockClear();
    await seedUser(ATTENDEE);
    await seedUser(ORGANIZER);
    await seedPerson(`${ATTENDEE}-Ana`, ATTENDEE);
    await seedPerson(`${ATTENDEE}-Luis`, ATTENDEE);
  });

  afterAll(() => {
    ft.cleanup();
  });

  it('sends a receipt when you cancel your own seat, and no notification', async () => {
    await seedEvent();
    const { registrations } = await signUp(['Ana']);

    await call(cancelRegistration, ATTENDEE, {
      eventId: EVENT_ID,
      registrationId: registrations[0].id,
    });

    const mail = cancellationMail();
    expect(mail?.to).toBe(`${ATTENDEE}@example.test`);
    expect(mail?.subject).toBe('Inscripción cancelada: Fiesta de San Juan');
    expect(mail?.text).toContain('Has anulado tu inscripción');
    expect(mail?.text).toContain('- Ana');
    // Nothing to tell them in-app: they are the one who did it, and the
    // callable already returned.
    expect(await notificationsFor(ATTENDEE)).toHaveLength(0);
  });

  it('tells you an organizer removed you, by email and by notification', async () => {
    await seedEvent();
    const { registrations } = await signUp(['Ana']);
    sendMock.mockClear();

    await call(cancelRegistration, ORGANIZER, {
      eventId: EVENT_ID,
      registrationId: registrations[0].id,
    });

    const mail = cancellationMail();
    expect(mail?.to).toBe(`${ATTENDEE}@example.test`);
    expect(mail?.subject).toBe('Te han dado de baja: Fiesta de San Juan');
    expect(mail?.text).toContain('La organización te ha dado de baja');

    const notifications = await notificationsFor(ATTENDEE);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('registration_removed');
    expect(notifications[0].eventId).toBe(EVENT_ID);
    // The organizer removed someone else; nobody needs to tell them about it.
    expect(await notificationsFor(ORGANIZER)).toHaveLength(0);
  });

  it('lists every seat a removal took in one email, not one email per seat', async () => {
    await seedEvent(2);
    const { registrations } = await signUp(['Ana', 'Luis']);
    sendMock.mockClear();

    await call(cancelRegistration, ORGANIZER, {
      eventId: EVENT_ID,
      registrationId: registrations[0].id,
    });

    const cancellations = sendMock.mock.calls
      .map(([args]) => args)
      .filter((args) => /cancelada|de baja/.test(args.subject));
    expect(cancellations).toHaveLength(1);
    expect(cancellations[0].text).toContain('- Ana');
    expect(cancellations[0].text).toContain('- Luis');
    // One removal, one notification — not one per seat.
    expect(await notificationsFor(ATTENDEE)).toHaveLength(1);
  });
});

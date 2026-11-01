// Handler test for the registerToEvent callable.
// Runs against the Firestore + Auth emulators via firebase-admin and uses
// firebase-functions-test to wrap the v2 callable.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';

vi.mock('../../auth/secret', () => ({ RESEND_API_KEY: { value: () => 'TEST_RESEND_KEY' } }));

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
  Resend: vi.fn(function ResendMock(this: { emails: { send: typeof sendMock } }) {
    this.emails = { send: sendMock };
  }),
}));

import { registerToEvent } from '../../events/registerToEvent';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const MUNICIPALITY_ID = 'mun-1';
const EVENT_ID = 'e1';
const USER_ID = 'alice';
const OTHER_USER_ID = 'visitor';

async function seedEvent(opts: {
  maxAttendees: number | null;
  signupFields?: unknown[];
  signupEnabled?: boolean;
  visibilityOrgId?: string | null;
}): Promise<void> {
  const now = new Date();
  await admin.firestore().doc(`events/${EVENT_ID}`).set({
    signupFields: opts.signupFields ?? [],
    signupEnabled: opts.signupEnabled ?? true,
    visibility: opts.visibilityOrgId ? 'organization' : 'public',
    visibilityOrgId: opts.visibilityOrgId ?? null,
    signupInfo: null,
    title: 'Fiesta',
    description: 'Una fiesta',
    startDate: now,
    location: { coordinates: { lat: 40.4, lng: -3.7 }, displayName: 'plaza' },
    imageURL: null,
    maxAttendees: opts.maxAttendees,
    telephoneRequired: false,
    status: 'published',
    organizerUserIds: ['creator-1'],
    organizerOrgIds: [],
    createdBy: 'creator-1',
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

async function seedMembership(userId: string): Promise<void> {
  await admin.firestore().doc(`municipalities/${MUNICIPALITY_ID}/members/${userId}`).set({
    userId,
    role: 'user',
    joinedAt: new Date(),
    profileAnswers: {},
    profileCompletedAt: null,
  });
}

async function seedUser(userId: string, email: string): Promise<void> {
  await admin.firestore().doc(`users/${userId}`).set({
    displayName: userId,
    email,
    telephone: null,
    activeMunicipalityId: MUNICIPALITY_ID,
    personId: null,
    createdAt: new Date(),
    termsAcceptedAt: new Date(),
    termsVersion: '1.0.0',
  });
}

async function seedExistingReg(
  id: string,
  opts: { userId: string; status: 'confirmed' | 'waitlisted'; position: number },
): Promise<void> {
  await admin.firestore().doc(`events/${EVENT_ID}/registrations/${id}`).set({
    userId: opts.userId,
    personId: `${opts.userId}-self`,
    name: opts.userId,
    status: opts.status,
    position: opts.position,
    isMember: false,
    checkedInAt: null,
    registeredAt: new Date(),
  });
}

interface CallableResult {
  registrations: Array<{
    id: string;
    status: 'confirmed' | 'waitlisted';
    position: number;
    isMember: boolean;
  }>;
}

async function callRegister(opts: {
  uid: string | null;
  data: unknown;
}): Promise<CallableResult> {
  const wrapped = ft.wrap(registerToEvent as unknown as Parameters<typeof ft.wrap>[0]);
  return (await wrapped({
    data: opts.data,
    auth: opts.uid ? { uid: opts.uid, token: {} } : undefined,
  } as unknown as Parameters<typeof wrapped>[0])) as unknown as CallableResult;
}

describe('registerToEvent (callable)', () => {
  beforeAll(async () => {
    await resetEmulators();
  });

  beforeEach(async () => {
    await resetEmulators();
    sendMock.mockClear();
  });

  afterAll(() => {
    ft.cleanup();
  });

  it('throws unauthenticated when no auth context', async () => {
    await seedEvent({ maxAttendees: 10 });
    await expect(
      callRegister({
        uid: null,
        data: { eventId: EVENT_ID, registrants: [{ personId: 'p1', name: 'Ana' }] },
      }),
    ).rejects.toThrow(/unauthenticated|inici/i);
  });

  it('throws invalid-argument when registrants is empty', async () => {
    await seedEvent({ maxAttendees: 10 });
    await expect(
      callRegister({ uid: USER_ID, data: { eventId: EVENT_ID, registrants: [] } }),
    ).rejects.toThrow(/asistente/);
  });

  it('throws not-found when the event does not exist', async () => {
    await expect(
      callRegister({
        uid: USER_ID,
        data: { eventId: 'missing', registrants: [{ personId: 'p1', name: 'Ana' }] },
      }),
    ).rejects.toThrow(/no existe|not.?found/i);
  });

  // Sign-ups are hidden client-side for these events, but registrations are
  // callable-only, so this is the enforcement that actually holds.
  it('throws failed-precondition when the event takes no in-app sign-ups', async () => {
    await seedEvent({ maxAttendees: null, signupEnabled: false });
    await expect(
      callRegister({
        uid: USER_ID,
        data: { eventId: EVENT_ID, registrants: [{ personId: 'p1', name: 'Ana' }] },
      }),
    ).rejects.toThrow(/no admite inscripciones/i);
    const docs = await admin.firestore().collection(`events/${EVENT_ID}/registrations`).get();
    expect(docs.size).toBe(0);
  });

  it('confirms all registrants when the event has no maxAttendees', async () => {
    await seedEvent({ maxAttendees: null });
    const result = await callRegister({
      uid: USER_ID,
      data: {
        eventId: EVENT_ID,
        registrants: [
          { personId: 'p1', name: 'Ana' },
          { personId: 'p2', name: 'Bea' },
        ],
      },
    });
    expect(result.registrations.map((r) => r.status)).toEqual(['confirmed', 'confirmed']);
    const docs = await admin
      .firestore()
      .collection(`events/${EVENT_ID}/registrations`)
      .get();
    expect(docs.size).toBe(2);
  });

  it('confirms up to capacity and waitlists the rest in one call', async () => {
    await seedEvent({ maxAttendees: 2 });
    const result = await callRegister({
      uid: USER_ID,
      data: {
        eventId: EVENT_ID,
        registrants: [
          { personId: 'p1', name: 'Ana' },
          { personId: 'p2', name: 'Bea' },
          { personId: 'p3', name: 'Carmen' },
        ],
      },
    });
    expect(result.registrations.map((r) => r.status)).toEqual([
      'confirmed',
      'confirmed',
      'waitlisted',
    ]);
  });

  it('waitlists new registrants when capacity is already taken', async () => {
    await seedEvent({ maxAttendees: 1 });
    await seedExistingReg('r0', { userId: OTHER_USER_ID, status: 'confirmed', position: 1 });
    const result = await callRegister({
      uid: USER_ID,
      data: { eventId: EVENT_ID, registrants: [{ personId: 'p1', name: 'Ana' }] },
    });
    expect(result.registrations[0].status).toBe('waitlisted');
    expect(result.registrations[0].position).toBe(2);
  });

  it('sets isMember=true when the caller is a village member', async () => {
    await seedEvent({ maxAttendees: 10 });
    await seedMembership(USER_ID);
    const result = await callRegister({
      uid: USER_ID,
      data: { eventId: EVENT_ID, registrants: [{ personId: 'p1', name: 'Ana' }] },
    });
    expect(result.registrations[0].isMember).toBe(true);
    const reg = await admin
      .firestore()
      .doc(`events/${EVENT_ID}/registrations/${result.registrations[0].id}`)
      .get();
    expect(reg.data()?.isMember).toBe(true);
  });

  it('sets isMember=false when the caller is not a village member', async () => {
    await seedEvent({ maxAttendees: 10 });
    const result = await callRegister({
      uid: USER_ID,
      data: { eventId: EVENT_ID, registrants: [{ personId: 'p1', name: 'Ana' }] },
    });
    expect(result.registrations[0].isMember).toBe(false);
  });

  it('persists userId, personId, name, status, position, registeredAt, isMember on each reg', async () => {
    await seedEvent({ maxAttendees: 10 });
    const result = await callRegister({
      uid: USER_ID,
      data: { eventId: EVENT_ID, registrants: [{ personId: 'p1', name: 'Ana' }] },
    });
    const reg = await admin
      .firestore()
      .doc(`events/${EVENT_ID}/registrations/${result.registrations[0].id}`)
      .get();
    const data = reg.data();
    expect(data?.userId).toBe(USER_ID);
    expect(data?.personId).toBe('p1');
    expect(data?.name).toBe('Ana');
    expect(data?.status).toBe('confirmed');
    expect(data?.position).toBe(1);
    expect(data?.isMember).toBe(false);
    expect(data?.registeredAt).toBeDefined();
  });

  it('writes confirmedCount and totalCount on the event doc', async () => {
    await seedEvent({ maxAttendees: 2 });
    await callRegister({
      uid: USER_ID,
      data: {
        eventId: EVENT_ID,
        registrants: [
          { personId: 'p1', name: 'Ana' },
          { personId: 'p2', name: 'Bea' },
          { personId: 'p3', name: 'Carmen' },
        ],
      },
    });
    const eventDoc = await admin.firestore().doc(`events/${EVENT_ID}`).get();
    expect(eventDoc.data()?.confirmedCount).toBe(2);
    expect(eventDoc.data()?.totalCount).toBe(3);
  });

  it('increments existing confirmedCount and totalCount when seeded regs exist', async () => {
    await seedEvent({ maxAttendees: 5 });
    await seedExistingReg('r0', { userId: OTHER_USER_ID, status: 'confirmed', position: 1 });
    await callRegister({
      uid: USER_ID,
      data: { eventId: EVENT_ID, registrants: [{ personId: 'p1', name: 'Ana' }] },
    });
    const eventDoc = await admin.firestore().doc(`events/${EVENT_ID}`).get();
    expect(eventDoc.data()?.confirmedCount).toBe(2);
    expect(eventDoc.data()?.totalCount).toBe(2);
  });

  describe('confirmation email', () => {
    function onlySentEmail(): SendCallArgs {
      expect(sendMock).toHaveBeenCalledTimes(1);
      return sendMock.mock.calls[0][0];
    }

    it('sends one email for the whole signup, not one per registrant', async () => {
      await seedEvent({ maxAttendees: 10 });
      await seedUser(USER_ID, 'ana@example.com');
      await callRegister({
        uid: USER_ID,
        data: {
          eventId: EVENT_ID,
          registrants: [
            { personId: 'p1', name: 'Ana' },
            { personId: 'p2', name: 'Bea' },
          ],
        },
      });

      expect(sendMock).toHaveBeenCalledTimes(1);
      const sent = onlySentEmail();
      expect(sent.to).toBe('ana@example.com');
      expect(sent.subject).toContain('Fiesta');
      expect(sent.text).toContain('Ana');
      expect(sent.text).toContain('Bea');
    });

    it('reports the post-signup capacity, not the pre-signup one', async () => {
      await seedEvent({ maxAttendees: 10 });
      await seedUser(USER_ID, 'ana@example.com');
      await seedExistingReg('r0', { userId: OTHER_USER_ID, status: 'confirmed', position: 1 });
      await callRegister({
        uid: USER_ID,
        data: { eventId: EVENT_ID, registrants: [{ personId: 'p1', name: 'Ana' }] },
      });

      expect(onlySentEmail().text).toContain('2 de 10 plazas ocupadas');
    });

    it('tells a waitlisted registrant their queue position', async () => {
      await seedEvent({ maxAttendees: 1 });
      await seedUser(USER_ID, 'ana@example.com');
      await callRegister({
        uid: USER_ID,
        data: {
          eventId: EVENT_ID,
          registrants: [
            { personId: 'p1', name: 'Ana' },
            { personId: 'p2', name: 'Bea' },
          ],
        },
      });

      const sent = onlySentEmail();
      expect(sent.text).toContain('Ana — plaza confirmada');
      expect(sent.text).toContain('Bea — en lista de espera (nº 2)');
    });

    it('skips the email when the user has no address on file', async () => {
      await seedEvent({ maxAttendees: 10 });
      await callRegister({
        uid: USER_ID,
        data: { eventId: EVENT_ID, registrants: [{ personId: 'p1', name: 'Ana' }] },
      });

      expect(sendMock).not.toHaveBeenCalled();
    });

    it('still registers the user when the mail provider fails', async () => {
      await seedEvent({ maxAttendees: 10 });
      await seedUser(USER_ID, 'ana@example.com');
      sendMock.mockResolvedValueOnce({
        data: null,
        error: { message: 'provider down' },
      } as unknown as Awaited<ReturnType<typeof sendMock>>);

      const result = await callRegister({
        uid: USER_ID,
        data: { eventId: EVENT_ID, registrants: [{ personId: 'p1', name: 'Ana' }] },
      });

      expect(result.registrations).toHaveLength(1);
      const regs = await admin.firestore().collection(`events/${EVENT_ID}/registrations`).get();
      expect(regs.size).toBe(1);
    });
  });
  describe('custom signup fields', () => {
    const SIZE = { id: 'size', label: 'Talla', type: 'select', required: true, options: ['S', 'M'] };
    const NOTE = { id: 'note', label: 'Alergias', type: 'text', required: false, options: [] };

    async function privateDocs(): Promise<Record<string, unknown>[]> {
      const snap = await admin.firestore().collection(`events/${EVENT_ID}/registrationPrivate`).get();
      return snap.docs.map((d) => d.data());
    }

    it('stores each registrant\u2019s answers in the organizer-only private doc', async () => {
      await seedEvent({ maxAttendees: 10, signupFields: [SIZE, NOTE] });
      const res = await callRegister({
        uid: USER_ID,
        data: {
          eventId: EVENT_ID,
          registrants: [
            { personId: 'p1', name: 'Ana', answers: { size: 'M', note: 'ninguna' } },
            { personId: 'p2', name: 'Bea', answers: { size: 'S' } },
          ],
        },
      });

      const regId = res.registrations[0]?.id ?? '';
      const priv = await admin
        .firestore()
        .doc(`events/${EVENT_ID}/registrationPrivate/${regId}`)
        .get();
      expect(priv.data()).toEqual({
        name: 'Ana',
        phone: null,
        answers: { size: 'M', note: 'ninguna' },
        // No persons doc seeded for p1, so there is no birth date to copy.
        birthday: null,
      });

      // Per-attendee, not per-signup: the second registrant has their own answers.
      const all = await privateDocs();
      expect(all).toHaveLength(2);
      expect(all.map((d) => (d.answers as Record<string, unknown>).size).sort()).toEqual(['M', 'S']);
    });

    it('keeps answers off the public registration doc', async () => {
      await seedEvent({ maxAttendees: 10, signupFields: [SIZE] });
      const res = await callRegister({
        uid: USER_ID,
        data: { eventId: EVENT_ID, registrants: [{ personId: 'p1', name: 'Ana', answers: { size: 'M' } }] },
      });
      const reg = await admin
        .firestore()
        .doc(`events/${EVENT_ID}/registrations/${res.registrations[0]?.id ?? ''}`)
        .get();
      expect(reg.data()).not.toHaveProperty('answers');
    });

    it('rejects a missing required answer and writes nothing', async () => {
      await seedEvent({ maxAttendees: 10, signupFields: [SIZE] });
      await expect(
        callRegister({
          uid: USER_ID,
          data: { eventId: EVENT_ID, registrants: [{ personId: 'p1', name: 'Ana' }] },
        }),
      ).rejects.toThrow(/obligatorias|v\u00e1lida/i);

      const regs = await admin.firestore().collection(`events/${EVENT_ID}/registrations`).get();
      expect(regs.size).toBe(0);
    });

    it('rejects a select value that is not one of the declared options', async () => {
      await seedEvent({ maxAttendees: 10, signupFields: [SIZE] });
      await expect(
        callRegister({
          uid: USER_ID,
          data: {
            eventId: EVENT_ID,
            registrants: [{ personId: 'p1', name: 'Ana', answers: { size: 'XXL' } }],
          },
        }),
      ).rejects.toThrow(/obligatorias|v\u00e1lida/i);
    });

    it('rejects answers for a field the event does not declare', async () => {
      await seedEvent({ maxAttendees: 10, signupFields: [] });
      await expect(
        callRegister({
          uid: USER_ID,
          data: {
            eventId: EVENT_ID,
            registrants: [{ personId: 'p1', name: 'Ana', answers: { ghost: 'x' } }],
          },
        }),
      ).rejects.toThrow(/obligatorias|v\u00e1lida/i);
    });

    it('rejects a non-primitive answer value at the input-shape gate', async () => {
      await seedEvent({ maxAttendees: 10, signupFields: [NOTE] });
      await expect(
        callRegister({
          uid: USER_ID,
          data: {
            eventId: EVENT_ID,
            registrants: [{ personId: 'p1', name: 'Ana', answers: { note: { nested: true } } }],
          },
        }),
      ).rejects.toThrow(/Respuestas inv\u00e1lidas/i);
    });

    it('writes no private doc when there is neither a phone nor an answer', async () => {
      await seedEvent({ maxAttendees: 10, signupFields: [NOTE] });
      await callRegister({
        uid: USER_ID,
        data: { eventId: EVENT_ID, registrants: [{ personId: 'p1', name: 'Ana' }] },
      });
      expect(await privateDocs()).toHaveLength(0);
    });

    it('stores the phone and the answers in the same private doc', async () => {
      await seedEvent({ maxAttendees: 10, signupFields: [SIZE] });
      await callRegister({
        uid: USER_ID,
        data: {
          eventId: EVENT_ID,
          registrants: [{ personId: 'p1', name: 'Ana', phone: '+34600111222', answers: { size: 'S' } }],
        },
      });
      expect(await privateDocs()).toEqual([
        { name: 'Ana', phone: '+34600111222', answers: { size: 'S' }, birthday: null },
      ]);
    });
  });

  // The roster export's "Fecha de nacimiento" column reads this. It is PII, so
  // it may only ever reach the organizer-gated private doc — the registration
  // doc beside it is readable by the whole pueblo.
  describe('birth date denormalization', () => {
    const BIRTHDAY = { year: 1980, month: 3, day: 12 };

    async function seedPerson(
      personId: string,
      birthday: { year: number | null; month: number | null; day: number | null } | null,
    ): Promise<void> {
      await admin.firestore().doc(`persons/${personId}`).set({
        givenName: 'Ana',
        middleNames: [],
        firstSurname: 'Pérez',
        secondSurname: null,
        nickname: null,
        sex: null,
        birthday,
        deathDate: null,
        birthPlace: null,
        burialPlace: null,
        municipalityLinks: [],
        occupations: [],
        biography: null,
        photoURL: null,
        userId: null,
        isPublic: true,
        createdBy: USER_ID,
        createdAt: new Date(),
      });
    }

    it('copies the birth date from the person onto the private doc', async () => {
      await seedEvent({ maxAttendees: 10 });
      await seedPerson('p1', BIRTHDAY);
      await callRegister({
        uid: USER_ID,
        data: { eventId: EVENT_ID, registrants: [{ personId: 'p1', name: 'Ana' }] },
      });

      const snap = await admin
        .firestore()
        .collection(`events/${EVENT_ID}/registrationPrivate`)
        .get();
      expect(snap.docs.map((d) => d.data())).toEqual([
        { name: 'Ana', phone: null, answers: {}, birthday: BIRTHDAY },
      ]);
    });

    it('keeps the birth date off the world-readable registration doc', async () => {
      await seedEvent({ maxAttendees: 10 });
      await seedPerson('p1', BIRTHDAY);
      const res = await callRegister({
        uid: USER_ID,
        data: { eventId: EVENT_ID, registrants: [{ personId: 'p1', name: 'Ana' }] },
      });

      const reg = await admin
        .firestore()
        .doc(`events/${EVENT_ID}/registrations/${res.registrations[0]?.id ?? ''}`)
        .get();
      expect(reg.data()).not.toHaveProperty('birthday');
    });

    it('writes no private doc for a person with no birth date on record', async () => {
      await seedEvent({ maxAttendees: 10 });
      await seedPerson('p1', null);
      await callRegister({
        uid: USER_ID,
        data: { eventId: EVENT_ID, registrants: [{ personId: 'p1', name: 'Ana' }] },
      });

      const snap = await admin
        .firestore()
        .collection(`events/${EVENT_ID}/registrationPrivate`)
        .get();
      expect(snap.size).toBe(0);
    });
  });
});

// The read rule already hides a private event, but this callable writes through
// the Admin SDK and bypasses rules entirely — so the event id alone (a
// forwarded share link) would otherwise be enough to take a seat.
describe('registerToEvent — private events', () => {
  const ORG_ID = 'org-1';

  beforeEach(async () => {
    await resetEmulators();
    sendMock.mockClear();
  });

  afterAll(() => {
    ft.cleanup();
  });

  async function seedOrgMember(userId: string): Promise<void> {
    await admin.firestore().doc(`organizations/${ORG_ID}/members/${userId}`).set({
      userId,
      role: 'member',
      joinedAt: new Date(),
    });
  }

  it('lets a member of the org sign up', async () => {
    await seedEvent({ maxAttendees: null, visibilityOrgId: ORG_ID });
    await seedOrgMember(USER_ID);
    const result = await callRegister({
      uid: USER_ID,
      data: { eventId: EVENT_ID, registrants: [{ personId: 'p1', name: 'Ana' }] },
    });
    expect(result.registrations.map((r) => r.status)).toEqual(['confirmed']);
  });

  it('refuses someone who does not belong to the org', async () => {
    await seedEvent({ maxAttendees: null, visibilityOrgId: ORG_ID });
    await expect(
      callRegister({
        uid: OTHER_USER_ID,
        data: { eventId: EVENT_ID, registrants: [{ personId: 'p9', name: 'Nadie' }] },
      }),
    ).rejects.toThrow(/privado/i);
    const docs = await admin.firestore().collection(`events/${EVENT_ID}/registrations`).get();
    expect(docs.size).toBe(0);
  });

  it('lets an organizer sign up even when they are not in the org', async () => {
    await seedEvent({ maxAttendees: null, visibilityOrgId: ORG_ID });
    const result = await callRegister({
      uid: 'creator-1',
      data: { eventId: EVENT_ID, registrants: [{ personId: 'p2', name: 'Bea' }] },
    });
    expect(result.registrations.map((r) => r.status)).toEqual(['confirmed']);
  });

  it('still lets anyone sign up to a public event', async () => {
    await seedEvent({ maxAttendees: null });
    const result = await callRegister({
      uid: OTHER_USER_ID,
      data: { eventId: EVENT_ID, registrants: [{ personId: 'p3', name: 'Carmen' }] },
    });
    expect(result.registrations.map((r) => r.status)).toEqual(['confirmed']);
  });
});

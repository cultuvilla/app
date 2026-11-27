// Handler tests for group sign-ups: booking a group atomically, claiming an
// open seat, and the three shapes of cancellation.
// Runs against the Firestore + Auth emulators via firebase-admin.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';

vi.mock('../../auth/secret', () => ({ RESEND_API_KEY: { value: () => 'TEST_RESEND_KEY' } }));

const sendMock = vi.fn(() => Promise.resolve({ data: { id: 'test-email-id' }, error: null }));
vi.mock('resend', () => ({
  Resend: vi.fn(function ResendMock(this: { emails: { send: typeof sendMock } }) {
    this.emails = { send: sendMock };
  }),
}));

import { registerToEvent } from '../../events/registerToEvent';
import { claimEventSeat } from '../../events/claimEventSeat';
import { cancelRegistration } from '../../events/cancelRegistration';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const MUNICIPALITY_ID = 'mun-1';
const EVENT_ID = 'e1';
const OWNER = 'alice';
const GUEST = 'bruno';
const ORGANIZER = 'creator-1';

const db = () => admin.firestore();

async function seedEvent(opts: { maxAttendees: number | null; signupGroupSize: number }) {
  const now = new Date();
  await db().doc(`events/${EVENT_ID}`).set({
    signupFields: [],
    signupGroupSize: opts.signupGroupSize,
    title: 'Baile de parejas',
    description: 'Una fiesta',
    startDate: now,
    endDate: null,
    location: { coordinates: { lat: 40.4, lng: -3.7 }, displayName: 'plaza' },
    imageURL: null,
    maxAttendees: opts.maxAttendees,
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

async function seedPerson(personId: string, ownerUid: string, accountUid: string | null) {
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
    userId: accountUid,
    isPublic: true,
    createdBy: ownerUid,
    createdAt: new Date(),
  });
}

async function seedUser(uid: string) {
  await db().doc(`users/${uid}`).set({
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

async function bookPairWithOpenSeat(uid = OWNER): Promise<RegisterResult> {
  return call<RegisterResult>(registerToEvent, uid, {
    eventId: EVENT_ID,
    registrants: [{ personId: `${uid}-self`, name: uid }],
    openSeats: 1,
  });
}

type RegRow = Record<string, unknown> & { id: string };

async function regsSnapshot(): Promise<RegRow[]> {
  const snap = await db().collection(`events/${EVENT_ID}/registrations`).get();
  return snap.docs.map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id }));
}

describe('group sign-up handlers', () => {
  beforeAll(async () => {
    await resetEmulators();
  });

  beforeEach(async () => {
    await resetEmulators();
    sendMock.mockClear();
    await seedPerson(`${OWNER}-self`, OWNER, OWNER);
    await seedPerson(`${GUEST}-self`, GUEST, GUEST);
    await seedUser(OWNER);
    await seedUser(GUEST);
  });

  afterAll(() => {
    ft.cleanup();
  });

  describe('registerToEvent', () => {
    it('rejects a group that is not exactly the required size', async () => {
      await seedEvent({ maxAttendees: null, signupGroupSize: 2 });
      await expect(
        call(registerToEvent, OWNER, {
          eventId: EVENT_ID,
          registrants: [{ personId: `${OWNER}-self`, name: OWNER }],
        }),
      ).rejects.toThrow(/grupos de 2/);
    });

    it('rejects open seats on an ordinary individual event', async () => {
      await seedEvent({ maxAttendees: null, signupGroupSize: 1 });
      await expect(
        call(registerToEvent, OWNER, {
          eventId: EVENT_ID,
          registrants: [{ personId: `${OWNER}-self`, name: OWNER }],
          openSeats: 1,
        }),
      ).rejects.toThrow(/invitación/);
    });

    it('books a persona plus an open seat, both held and counted', async () => {
      await seedEvent({ maxAttendees: null, signupGroupSize: 2 });
      const result = await bookPairWithOpenSeat();

      expect(result.openSeats).toHaveLength(1);
      const rows = await regsSnapshot();
      expect(rows).toHaveLength(2);
      // Both seats share one group and both are confirmed from the start —
      // the open one is held, not pending.
      const groupIds = new Set(rows.map((r) => r.groupId));
      expect(groupIds.size).toBe(1);
      expect(rows.every((r) => r.status === 'confirmed')).toBe(true);
      expect(rows.every((r) => r.groupOwnerId === OWNER)).toBe(true);
      const open = rows.find((r) => r.isOpenSeat === true);
      expect(open).toBeTruthy();
      expect(open?.personId).toBe('');

      const event = await db().doc(`events/${EVENT_ID}`).get();
      expect(event.data()?.confirmedCount).toBe(2);
      expect(event.data()?.totalCount).toBe(2);
    });

    it('keeps the claim token off the world-readable registration doc', async () => {
      await seedEvent({ maxAttendees: null, signupGroupSize: 2 });
      const result = await bookPairWithOpenSeat();
      const rows = await regsSnapshot();
      const serialized = JSON.stringify(rows);
      expect(serialized).not.toContain(result.openSeats[0].token);

      const token = await db()
        .doc(`events/${EVENT_ID}/seatTokens/${result.openSeats[0].token}`)
        .get();
      expect(token.exists).toBe(true);
      expect(token.data()?.consumedAt).toBeNull();
    });

    it('waitlists a whole pareja rather than splitting it at the capacity edge', async () => {
      // One seat left, a pareja arriving: taking it would split them.
      await seedEvent({ maxAttendees: 3, signupGroupSize: 2 });
      await bookPairWithOpenSeat(OWNER);
      await db().doc(`events/${EVENT_ID}/registrations/filler`).set({
        userId: 'someone', personId: 'p-filler', name: 'Filler',
        status: 'confirmed', position: 3, isMember: false,
        registeredAt: new Date(), checkedInAt: null, paidAt: null,
        photoURL: null, personUserId: null, isPersonPublic: true,
        groupId: null, groupOwnerId: null, isOpenSeat: false,
      });

      const second = await call<RegisterResult>(registerToEvent, GUEST, {
        eventId: EVENT_ID,
        registrants: [{ personId: `${GUEST}-self`, name: GUEST }],
        openSeats: 1,
      });
      expect(second.registrations.map((r) => r.status)).toEqual(['waitlisted', 'waitlisted']);
    });
  });

  describe('claimEventSeat', () => {
    it('turns an open seat into the claimer’s own registration', async () => {
      await seedEvent({ maxAttendees: null, signupGroupSize: 2 });
      const { openSeats } = await bookPairWithOpenSeat();

      await call(claimEventSeat, GUEST, {
        eventId: EVENT_ID,
        token: openSeats[0].token,
        personId: `${GUEST}-self`,
        name: 'Bruno García',
      });

      const seat = await db()
        .doc(`events/${EVENT_ID}/registrations/${openSeats[0].registrationId}`)
        .get();
      const data = seat.data();
      expect(data?.isOpenSeat).toBe(false);
      expect(data?.name).toBe('Bruno García');
      // userId moves to the claimer so the seat behaves like any registration
      // of theirs; groupOwnerId still points at who booked the group.
      expect(data?.userId).toBe(GUEST);
      expect(data?.groupOwnerId).toBe(OWNER);
      // A claim is a reassignment, not a new sign-up: capacity is untouched.
      const event = await db().doc(`events/${EVENT_ID}`).get();
      expect(event.data()?.confirmedCount).toBe(2);
      expect(event.data()?.totalCount).toBe(2);
    });

    it('notifies the group owner who took the seat', async () => {
      await seedEvent({ maxAttendees: null, signupGroupSize: 2 });
      const { openSeats } = await bookPairWithOpenSeat();
      await call(claimEventSeat, GUEST, {
        eventId: EVENT_ID,
        token: openSeats[0].token,
        personId: `${GUEST}-self`,
        name: 'Bruno',
      });
      const notes = await db().collection(`users/${OWNER}/notifications`).get();
      expect(notes.docs.map((d) => d.data().type)).toContain('seat_claimed');
    });

    it('refuses a token that has already been used', async () => {
      await seedEvent({ maxAttendees: null, signupGroupSize: 2 });
      const { openSeats } = await bookPairWithOpenSeat();
      const args = {
        eventId: EVENT_ID,
        token: openSeats[0].token,
        personId: `${GUEST}-self`,
        name: 'Bruno',
      };
      await call(claimEventSeat, GUEST, args);
      await expect(call(claimEventSeat, GUEST, args)).rejects.toThrow(/ya se ha usado/);
    });

    it('refuses a persona the claimer does not own', async () => {
      await seedEvent({ maxAttendees: null, signupGroupSize: 2 });
      const { openSeats } = await bookPairWithOpenSeat();
      // Bruno tries to seat Alice — publishing a third party's name on a
      // world-readable roster is exactly what the persons rules forbid.
      await expect(
        call(claimEventSeat, GUEST, {
          eventId: EVENT_ID,
          token: openSeats[0].token,
          personId: `${OWNER}-self`,
          name: 'Alice',
        }),
      ).rejects.toThrow(/no es tuya/);
    });

    it('refuses an unknown token without leaking whether the event has seats', async () => {
      await seedEvent({ maxAttendees: null, signupGroupSize: 2 });
      await bookPairWithOpenSeat();
      await expect(
        call(claimEventSeat, GUEST, {
          eventId: EVENT_ID,
          token: 'nope_nope_nope_nope',
          personId: `${GUEST}-self`,
          name: 'Bruno',
        }),
      ).rejects.toThrow(/no es válida/);
    });

    it('refuses to seat the same person twice on one event', async () => {
      await seedEvent({ maxAttendees: null, signupGroupSize: 2 });
      const { openSeats } = await bookPairWithOpenSeat();
      await expect(
        call(claimEventSeat, OWNER, {
          eventId: EVENT_ID,
          token: openSeats[0].token,
          personId: `${OWNER}-self`,
          name: 'Alice',
        }),
      ).rejects.toThrow(/ya está apuntada/);
    });
  });

  describe('cancelRegistration', () => {
    it('takes the whole group when its owner cancels', async () => {
      await seedEvent({ maxAttendees: null, signupGroupSize: 2 });
      const result = await bookPairWithOpenSeat();
      const ownSeat = result.registrations[0].id;

      const out = await call<{ action: string }>(cancelRegistration, OWNER, {
        eventId: EVENT_ID,
        registrationId: ownSeat,
      });
      expect(out.action).toBe('delete-group');
      expect(await regsSnapshot()).toHaveLength(0);
      // Dead links are removed rather than left to 404 later.
      const tokens = await db().collection(`events/${EVENT_ID}/seatTokens`).get();
      expect(tokens.empty).toBe(true);
    });

    it('reopens the seat when a guest who claimed it drops out', async () => {
      await seedEvent({ maxAttendees: null, signupGroupSize: 2 });
      const { openSeats } = await bookPairWithOpenSeat();
      const seatId = openSeats[0].registrationId;
      await call(claimEventSeat, GUEST, {
        eventId: EVENT_ID,
        token: openSeats[0].token,
        personId: `${GUEST}-self`,
        name: 'Bruno',
      });

      const out = await call<{ action: string }>(cancelRegistration, GUEST, {
        eventId: EVENT_ID,
        registrationId: seatId,
      });
      expect(out.action).toBe('release-seat');

      const rows = await regsSnapshot();
      // The owner's seat is untouched and the guest's is claimable again —
      // one guest leaving must not collapse someone else's booking.
      expect(rows).toHaveLength(2);
      const seat = rows.find((r) => r.id === seatId);
      expect(seat?.isOpenSeat).toBe(true);
      expect(seat?.userId).toBe(OWNER);
      expect(seat?.personId).toBe('');

      // A fresh, unconsumed token exists so the owner can re-invite.
      const tokens = await db().collection(`events/${EVENT_ID}/seatTokens`).get();
      const live = tokens.docs.filter((d) => d.data().consumedAt === null);
      expect(live).toHaveLength(1);

      const notes = await db().collection(`users/${OWNER}/notifications`).get();
      expect(notes.docs.map((d) => d.data().type)).toContain('seat_released');
    });

    it('takes the whole group when an organizer removes one seat', async () => {
      await seedEvent({ maxAttendees: null, signupGroupSize: 2 });
      const result = await bookPairWithOpenSeat();
      const out = await call<{ action: string }>(cancelRegistration, ORGANIZER, {
        eventId: EVENT_ID,
        registrationId: result.registrations[0].id,
      });
      expect(out.action).toBe('delete-group');
      expect(await regsSnapshot()).toHaveLength(0);
    });

    it('refuses a stranger', async () => {
      await seedEvent({ maxAttendees: null, signupGroupSize: 2 });
      const result = await bookPairWithOpenSeat();
      await expect(
        call(cancelRegistration, GUEST, {
          eventId: EVENT_ID,
          registrationId: result.registrations[0].id,
        }),
      ).rejects.toThrow(/No puedes cancelar/);
    });

    it('deletes an ordinary registration on a non-group event', async () => {
      await seedEvent({ maxAttendees: null, signupGroupSize: 1 });
      const result = await call<RegisterResult>(registerToEvent, OWNER, {
        eventId: EVENT_ID,
        registrants: [{ personId: `${OWNER}-self`, name: OWNER }],
      });
      const out = await call<{ action: string }>(cancelRegistration, OWNER, {
        eventId: EVENT_ID,
        registrationId: result.registrations[0].id,
      });
      expect(out.action).toBe('delete-solo');
      expect(await regsSnapshot()).toHaveLength(0);
    });
  });
});

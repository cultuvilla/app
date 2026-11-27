// Firestore Rules e2e tests for reading 'registrations'.
//
// Two axes, deliberately different:
//   - collection-group (across events): restricted to the caller's own rows;
//   - per-event roster: readable by members of THAT event's pueblo, unless the
//     organizer set attendeesVisibility to 'organizers'. Never world-readable —
//     a roster names real people, including dependent personas whose person doc
//     is deliberately private.
import { describe, it } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  collectionGroup,
  where,
  type Firestore,
} from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser, asAnon, seed, firestoreOf } from '../helpers/roles';

const getEnv = useRulesTestEnv();

const ALICE = 'alice';
const BOB = 'bob';
const VILLAGE = 'muni-1';
const OTHER_VILLAGE = 'muni-2';
const NOW = new Date();

async function seedAliceRegistrations() {
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'events/e1'), { title: 'Feria 1', municipalityId: VILLAGE });
    await setDoc(doc(db, 'events/e1/registrations/r1'), {
      userId: ALICE,
      personId: 'p1',
      name: 'Alice',
      status: 'confirmed',
      position: 1,
      registeredAt: NOW,
    });
    await setDoc(doc(db, 'events/e2'), { title: 'Feria 2', municipalityId: VILLAGE });
    await setDoc(doc(db, 'events/e2/registrations/r2'), {
      userId: ALICE,
      personId: 'p1',
      name: 'Alice',
      status: 'confirmed',
      position: 1,
      registeredAt: NOW,
    });
  });
}

describe('firestore.rules — registrations collection-group', () => {
  it('signed-in user can list their own registrations across events', async () => {
    await seedAliceRegistrations();
    const db = asUser(getEnv(), ALICE);
    await assertSucceeds(
      getDocs(
        query(
          collectionGroup(db, 'registrations'),
          where('userId', '==', ALICE),
        ),
      ),
    );
  });

  it('signed-in user cannot list ALL registrations unfiltered', async () => {
    await seedAliceRegistrations();
    const db = asUser(getEnv(), ALICE);
    await assertFails(getDocs(collectionGroup(db, 'registrations')));
  });

  it('anonymous user cannot list registrations via collection group', async () => {
    await seedAliceRegistrations();
    const db = asAnon(getEnv());
    await assertFails(
      getDocs(
        query(
          collectionGroup(db, 'registrations'),
          where('userId', '==', ALICE),
        ),
      ),
    );
  });

  it('anonymous user cannot read a registration doc directly', async () => {
    await seedAliceRegistrations();
    const db = asAnon(getEnv());
    await assertFails(getDoc(doc(db, 'events/e1/registrations/r1')));
  });
});

// ── Per-event roster ───────────────────────────────────────────────────────

async function seedRoster(
  attendeesVisibility: 'members' | 'organizers' | undefined,
): Promise<void> {
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'events/roster-e'), {
      title: 'Fiesta',
      municipalityId: VILLAGE,
      organizerUserIds: ['org-1'],
      ...(attendeesVisibility ? { attendeesVisibility } : {}),
    });
    // Alice signed up; she is NOT a member of the event's pueblo (a visitor
    // from the next village over, which is exactly what isMember: false means).
    await setDoc(doc(db, 'events/roster-e/registrations/r1'), {
      userId: ALICE,
      personId: 'p1',
      name: 'Alice',
      status: 'confirmed',
      position: 1,
      isMember: false,
      registeredAt: NOW,
    });
    // Bob is a member of the pueblo but has not signed up.
    await setDoc(doc(db, `municipalities/${VILLAGE}/members/${BOB}`), { role: 'user' });
    // …and a member of a different pueblo, who must not see this roster.
    await setDoc(doc(db, `municipalities/${OTHER_VILLAGE}/members/carol`), { role: 'user' });
  });
}

const rosterQuery = (db: Firestore) => collection(db, 'events/roster-e/registrations');

describe('firestore.rules — per-event attendee roster', () => {
  it('a member of the event pueblo can list the roster', async () => {
    await seedRoster('members');
    await assertSucceeds(getDocs(rosterQuery(asUser(getEnv(), BOB))));
  });

  it('defaults to members-visible when the event predates the field', async () => {
    await seedRoster(undefined);
    await assertSucceeds(getDocs(rosterQuery(asUser(getEnv(), BOB))));
  });

  it('a member of a DIFFERENT pueblo cannot list the roster', async () => {
    await seedRoster('members');
    await assertFails(getDocs(rosterQuery(asUser(getEnv(), 'carol'))));
  });

  it('an anonymous visitor cannot list the roster', async () => {
    await seedRoster('members');
    await assertFails(getDocs(rosterQuery(asAnon(getEnv()))));
  });

  it("a member cannot list the roster when it is set to 'organizers'", async () => {
    await seedRoster('organizers');
    await assertFails(getDocs(rosterQuery(asUser(getEnv(), BOB))));
  });

  it("the organizer can list the roster even when it is set to 'organizers'", async () => {
    await seedRoster('organizers');
    await assertSucceeds(getDocs(rosterQuery(asUser(getEnv(), 'org-1'))));
  });

  it('a non-member registrant can still read their own row on a hidden roster', async () => {
    await seedRoster('organizers');
    const db = asUser(getEnv(), ALICE);
    await assertSucceeds(getDoc(doc(db, 'events/roster-e/registrations/r1')));
    await assertSucceeds(
      getDocs(query(rosterQuery(db), where('userId', '==', ALICE))),
    );
  });

  it('a non-member cannot read someone ELSE\'s row on a hidden roster', async () => {
    await seedRoster('organizers');
    await assertFails(getDoc(doc(asUser(getEnv(), 'mallory'), 'events/roster-e/registrations/r1')));
  });

  it('registrationPrivate stays organizer-only even on a members-visible roster', async () => {
    await seedRoster('members');
    await seed(getEnv(), async (ctx) => {
      await setDoc(
        doc(firestoreOf(ctx), 'events/roster-e/registrationPrivate/r1'),
        { name: 'Alice', phone: '600000000', answers: {} },
      );
    });
    await assertFails(
      getDoc(doc(asUser(getEnv(), BOB), 'events/roster-e/registrationPrivate/r1')),
    );
    await assertSucceeds(
      getDoc(doc(asUser(getEnv(), 'org-1'), 'events/roster-e/registrationPrivate/r1')),
    );
  });
});

// Firestore Rules e2e tests for `events/{eventId}/registrationEvents`.
//
// The roster audit log names people who are no longer on the roster — often
// because someone removed them. That is organizer business, not pueblo
// business, so the read audience is strictly `isEventOrganizer(eventId)`:
// the organizer set, the village's admins, and app admins. Everyone else is
// denied, INCLUDING the villager whose own removal an entry records, and
// including a plain member who can freely read the roster itself.
//
// Writes are denied to every client, whoever they are: entries are appended by
// the registration callables through the admin SDK, in the same transaction as
// the mutation they record.
import { describe, it, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, type Firestore } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser, asAnon, asAdmin, seed, firestoreOf } from '../helpers/roles';

const getEnv = useRulesTestEnv();

const ORGANIZER = 'organizer-1';
const VILLAGE_ADMIN = 'village-admin-1';
const MEMBER = 'member-1';
const REMOVED = 'removed-1';
const OUTSIDER = 'outsider-1';
const VILLAGE = 'muni-1';
const EVENT = 'e1';
const NOW = new Date();

async function seedEventWithLog() {
  await seed(getEnv(), async (ctx) => {
    const db = firestoreOf(ctx);
    await setDoc(doc(db, `events/${EVENT}`), {
      title: 'Feria',
      municipalityId: VILLAGE,
      organizerUserIds: [ORGANIZER],
      // The roster itself is village-readable — the log must NOT inherit that.
      attendeesVisibility: 'members',
    });
    await setDoc(doc(db, `municipalities/${VILLAGE}/members/${VILLAGE_ADMIN}`), { role: 'admin' });
    await setDoc(doc(db, `municipalities/${VILLAGE}/members/${MEMBER}`), { role: 'user' });
    await setDoc(doc(db, `municipalities/${VILLAGE}/members/${REMOVED}`), { role: 'user' });
    await setDoc(doc(db, `events/${EVENT}/registrationEvents/entry-1`), {
      registrationId: 'r1',
      action: 'removed_by_organizer',
      actorUserId: ORGANIZER,
      subjectUserId: REMOVED,
      personId: 'p1',
      name: 'Lucía',
      status: 'confirmed',
      groupId: null,
      at: NOW,
    });
  });
}

const entryRef = (db: Firestore) => doc(db, `events/${EVENT}/registrationEvents/entry-1`);
const logRef = (db: Firestore) => collection(db, `events/${EVENT}/registrationEvents`);

describe('firestore.rules — registrationEvents reads', () => {
  beforeEach(seedEventWithLog);

  it('lets an event organizer list the log', async () => {
    await assertSucceeds(getDocs(logRef(asUser(getEnv(), ORGANIZER))));
  });

  it('lets a village admin of the event\'s pueblo list the log', async () => {
    await assertSucceeds(getDocs(logRef(asUser(getEnv(), VILLAGE_ADMIN))));
  });

  it('lets an app admin list the log', async () => {
    await assertSucceeds(getDocs(logRef(await asAdmin(getEnv(), 'sadmin'))));
  });

  it('denies a plain village member, who can read the roster but not its history', async () => {
    await assertFails(getDocs(logRef(asUser(getEnv(), MEMBER))));
    await assertFails(getDoc(entryRef(asUser(getEnv(), MEMBER))));
  });

  it('denies the very user whose removal the entry records', async () => {
    await assertFails(getDoc(entryRef(asUser(getEnv(), REMOVED))));
  });

  it('denies a signed-in user from another pueblo', async () => {
    await assertFails(getDocs(logRef(asUser(getEnv(), OUTSIDER))));
  });

  it('denies an anonymous reader', async () => {
    await assertFails(getDocs(logRef(asAnon(getEnv()))));
  });
});

describe('firestore.rules — registrationEvents writes', () => {
  beforeEach(seedEventWithLog);

  const forgedEntry = {
    registrationId: 'r2',
    action: 'signed_up',
    actorUserId: ORGANIZER,
    subjectUserId: ORGANIZER,
    personId: 'p2',
    name: 'Forjado',
    status: 'confirmed',
    groupId: null,
    at: NOW,
  };

  it('denies an organizer appending an entry by hand', async () => {
    const db = asUser(getEnv(), ORGANIZER);
    await assertFails(setDoc(doc(db, `events/${EVENT}/registrationEvents/forged`), forgedEntry));
  });

  it('denies an app admin rewriting an existing entry', async () => {
    const db = await asAdmin(getEnv(), 'sadmin');
    await assertFails(setDoc(entryRef(db), { ...forgedEntry, action: 'cancelled_self' }));
  });

  it('denies the subject erasing the entry about them', async () => {
    const db = asUser(getEnv(), REMOVED);
    await assertFails(setDoc(entryRef(db), forgedEntry));
  });
});

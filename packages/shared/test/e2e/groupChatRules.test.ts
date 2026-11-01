// packages/shared/test/e2e/groupChatRules.test.ts
// Group chat: who reads and writes the general thread and an aviso's, that a
// message is written as its author under their public name, the "solo la junta
// escribe" switch, deletion, the function-owned thread summaries, the reader's
// last open, and the general chat's push opt-in.
import { describe, it, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser } from '../helpers/roles';

const getEnv = useRulesTestEnv();
const ORG = 'org1';
const MUN = 'mun1';
const GENERAL = `organizations/${ORG}/chat`;
const AVISO = `organizations/${ORG}/messages/msg1`;
const AVISO_CHAT = `${AVISO}/chat`;
const NAMES: Record<string, string> = { admin1: 'Ana', member1: 'Paco', member2: 'Pepa', stranger: 'Luis', vadmin: 'Vera' };

const chatMessage = (uid: string, overrides: Record<string, unknown> = {}) => ({
  authorUid: uid,
  authorName: NAMES[uid],
  body: 'Hola',
  createdAt: serverTimestamp(),
  ...overrides,
});

async function seed(org: Record<string, unknown> = {}) {
  await getEnv().withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `organizations/${ORG}`), { name: 'Asociación', type: 'asociación', status: 'approved', municipalityId: MUN, ...org });
    for (const [uid, role] of [['admin1', 'admin'], ['member1', 'member'], ['member2', 'member']]) {
      await setDoc(doc(db, `organizations/${ORG}/members/${uid}`), { userId: uid, joinedAt: new Date(), role });
    }
    await setDoc(doc(db, `municipalities/${MUN}/members/vadmin`), { userId: 'vadmin', role: 'admin' });
    for (const [uid, name] of Object.entries(NAMES)) {
      await setDoc(doc(db, `publicProfiles/${uid}`), { displayName: name, activeMunicipalityId: MUN });
    }
    await setDoc(doc(db, AVISO), { title: 'Asamblea', recipientUids: ['admin1', 'member1'], sentBy: 'admin1' });
    await setDoc(doc(db, `${GENERAL}/c1`), { authorUid: 'member1', authorName: 'Paco', body: 'Buenas', createdAt: new Date() });
    await setDoc(doc(db, `${AVISO_CHAT}/c1`), { authorUid: 'member1', authorName: 'Paco', body: 'Voy', createdAt: new Date() });
    await setDoc(doc(db, `organizations/${ORG}/chatThreads/general`), { lastMessageAt: new Date(), lastAuthorUid: 'member1', participantUids: ['member1'] });
    await setDoc(doc(db, `organizations/${ORG}/chatThreads/msg1`), { lastMessageAt: new Date(), lastAuthorUid: 'member1', participantUids: ['member1'] });
  });
}

async function leave(uid: string) {
  await getEnv().withSecurityRulesDisabled(async (ctx) => {
    await deleteDoc(doc(ctx.firestore(), `organizations/${ORG}/members/${uid}`));
  });
}

beforeEach(async () => {
  await seed();
});

describe('the general chat', () => {
  const page = (uid: string) => query(collection(asUser(getEnv(), uid), GENERAL), orderBy('createdAt', 'desc'), limit(50));

  it('every member reads it; outsiders and a member who left do not', async () => {
    await assertSucceeds(getDocs(page('member2')));
    await assertSucceeds(getDocs(page('admin1')));
    await assertFails(getDocs(page('stranger')));
    await leave('member2');
    await assertFails(getDocs(page('member2')));
  });

  it('every member writes, as themself, under their public name, now', async () => {
    await assertSucceeds(setDoc(doc(asUser(getEnv(), 'member2'), `${GENERAL}/n1`), chatMessage('member2')));
    await assertFails(setDoc(doc(asUser(getEnv(), 'stranger'), `${GENERAL}/n2`), chatMessage('stranger')));
    // Someone else's uid, someone else's name, a backdated time.
    await assertFails(setDoc(doc(asUser(getEnv(), 'member2'), `${GENERAL}/n3`), chatMessage('member1')));
    await assertFails(setDoc(doc(asUser(getEnv(), 'member2'), `${GENERAL}/n4`), chatMessage('member2', { authorName: 'La junta' })));
    await assertFails(setDoc(doc(asUser(getEnv(), 'member2'), `${GENERAL}/n5`), chatMessage('member2', { createdAt: new Date(2020, 0, 1) })));
  });

  it('refuses an empty, over-long or extra-field message', async () => {
    const db = asUser(getEnv(), 'member2');
    await assertFails(setDoc(doc(db, `${GENERAL}/n1`), chatMessage('member2', { body: '' })));
    await assertFails(setDoc(doc(db, `${GENERAL}/n2`), chatMessage('member2', { body: 'x'.repeat(2001) })));
    await assertFails(setDoc(doc(db, `${GENERAL}/n3`), chatMessage('member2', { pinned: true })));
  });

  it('"solo la junta escribe" leaves it to the admins, and leaves avisos alone', async () => {
    await seed({ chatAdminsOnly: true });
    await assertFails(setDoc(doc(asUser(getEnv(), 'member2'), `${GENERAL}/n1`), chatMessage('member2')));
    await assertSucceeds(setDoc(doc(asUser(getEnv(), 'admin1'), `${GENERAL}/n2`), chatMessage('admin1')));
    await assertSucceeds(setDoc(doc(asUser(getEnv(), 'member1'), `${AVISO_CHAT}/n3`), chatMessage('member1')));
  });

  it('a message is never edited', async () => {
    await assertFails(updateDoc(doc(asUser(getEnv(), 'member1'), `${GENERAL}/c1`), { body: 'Otra cosa' }));
    await assertFails(updateDoc(doc(asUser(getEnv(), 'admin1'), `${GENERAL}/c1`), { body: 'Otra cosa' }));
  });

  it('its author, the group’s admins and the village’s admins delete it; other members do not', async () => {
    await assertFails(deleteDoc(doc(asUser(getEnv(), 'member2'), `${GENERAL}/c1`)));
    await assertSucceeds(deleteDoc(doc(asUser(getEnv(), 'member1'), `${GENERAL}/c1`)));
    await seed();
    await assertSucceeds(deleteDoc(doc(asUser(getEnv(), 'admin1'), `${GENERAL}/c1`)));
    await seed();
    await assertSucceeds(deleteDoc(doc(asUser(getEnv(), 'vadmin'), `${GENERAL}/c1`)));
  });
});

describe('an aviso’s chat', () => {
  const page = (uid: string) => query(collection(asUser(getEnv(), uid), AVISO_CHAT), orderBy('createdAt', 'desc'), limit(50));

  it('whoever reads the aviso reads its chat: the admins and its recipients', async () => {
    await assertSucceeds(getDocs(page('admin1')));
    await assertSucceeds(getDocs(page('member1')));
    await assertFails(getDocs(page('member2')));
    await assertFails(getDocs(page('stranger')));
  });

  it('a recipient who left loses it, though their messages stay', async () => {
    await leave('member1');
    await assertFails(getDocs(page('member1')));
    await assertSucceeds(getDoc(doc(asUser(getEnv(), 'admin1'), `${AVISO_CHAT}/c1`)));
  });

  it('recipients and admins write; a member it did not reach does not', async () => {
    await assertSucceeds(setDoc(doc(asUser(getEnv(), 'member1'), `${AVISO_CHAT}/n1`), chatMessage('member1')));
    await assertSucceeds(setDoc(doc(asUser(getEnv(), 'admin1'), `${AVISO_CHAT}/n2`), chatMessage('admin1')));
    await assertFails(setDoc(doc(asUser(getEnv(), 'member2'), `${AVISO_CHAT}/n3`), chatMessage('member2')));
  });

  it('its author and the admins delete a message; the recipients do not delete each other’s', async () => {
    await setDoc(doc(asUser(getEnv(), 'admin1'), `${AVISO_CHAT}/n1`), chatMessage('admin1'));
    await assertFails(deleteDoc(doc(asUser(getEnv(), 'member1'), `${AVISO_CHAT}/n1`)));
    await assertSucceeds(deleteDoc(doc(asUser(getEnv(), 'member1'), `${AVISO_CHAT}/c1`)));
    await assertSucceeds(deleteDoc(doc(asUser(getEnv(), 'admin1'), `${AVISO_CHAT}/n1`)));
  });
});

describe('thread summaries and reads', () => {
  it('a summary is read like its thread and written by no client', async () => {
    await assertSucceeds(getDoc(doc(asUser(getEnv(), 'member2'), `organizations/${ORG}/chatThreads/general`)));
    await assertSucceeds(getDoc(doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/chatThreads/msg1`)));
    await assertFails(getDoc(doc(asUser(getEnv(), 'member2'), `organizations/${ORG}/chatThreads/msg1`)));
    await assertFails(getDoc(doc(asUser(getEnv(), 'stranger'), `organizations/${ORG}/chatThreads/general`)));
    await assertFails(
      setDoc(doc(asUser(getEnv(), 'admin1'), `organizations/${ORG}/chatThreads/general`), { lastMessageAt: new Date(), lastAuthorUid: 'admin1', participantUids: [] }),
    );
  });

  it('a reader moves their own last open to now, again and again', async () => {
    const db = asUser(getEnv(), 'member1');
    const read = `organizations/${ORG}/chatThreads/msg1/reads/member1`;
    await assertSucceeds(setDoc(doc(db, read), { readAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(db, read), { readAt: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(db, read)));
    await assertFails(setDoc(doc(db, read), { readAt: new Date(2020, 0, 1) }));
    await assertFails(getDoc(doc(asUser(getEnv(), 'admin1'), read)));
    await assertFails(setDoc(doc(asUser(getEnv(), 'admin1'), read), { readAt: serverTimestamp() }));
    // Not a recipient of the aviso.
    await assertFails(setDoc(doc(asUser(getEnv(), 'member2'), `organizations/${ORG}/chatThreads/msg1/reads/member2`), { readAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(asUser(getEnv(), 'member2'), `organizations/${ORG}/chatThreads/general/reads/member2`), { readAt: serverTimestamp() }));
  });
});

describe('group prefs — the general chat opt-in', () => {
  const prefs = `users/member1/groupPrefs/${ORG}`;

  it('takes the opt-in beside the mute, and still the older shape without it', async () => {
    const db = asUser(getEnv(), 'member1');
    await assertSucceeds(setDoc(doc(db, prefs), { messagesMuted: false, updatedAt: new Date() }));
    await assertSucceeds(setDoc(doc(db, prefs), { messagesMuted: false, generalChatPush: true, updatedAt: new Date() }));
    await assertSucceeds(setDoc(doc(db, prefs), { messagesMuted: true, updatedAt: new Date() }, { merge: true }));
    await assertFails(setDoc(doc(db, prefs), { messagesMuted: false, generalChatPush: 'yes', updatedAt: new Date() }));
    await assertFails(setDoc(doc(db, prefs), { generalChatPush: true, updatedAt: new Date() }));
  });
});

describe('organizations — chatAdminsOnly', () => {
  it('an org admin turns it on and off; it must be a bool', async () => {
    const db = asUser(getEnv(), 'admin1');
    await assertSucceeds(updateDoc(doc(db, `organizations/${ORG}`), { chatAdminsOnly: true }));
    await assertSucceeds(updateDoc(doc(db, `organizations/${ORG}`), { chatAdminsOnly: false }));
    await assertFails(updateDoc(doc(db, `organizations/${ORG}`), { chatAdminsOnly: 'sí' }));
    await assertFails(updateDoc(doc(asUser(getEnv(), 'member1'), `organizations/${ORG}`), { chatAdminsOnly: true }));
  });
});

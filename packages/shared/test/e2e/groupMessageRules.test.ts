// packages/shared/test/e2e/groupMessageRules.test.ts
// Group messages: who reads a message and its halves, that only the callables
// write one, and the three client writes — a read, a vote, a WhatsApp tick —
// plus the per-group mute.
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
  where,
} from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser } from '../helpers/roles';

const getEnv = useRulesTestEnv();
const ORG = 'org1';
const MSG = `organizations/${ORG}/messages/msg1`;

function message(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Asamblea', body: 'El sábado.', audience: { kind: 'all', eventId: null, eventTitle: null },
    channels: { push: true, email: true, whatsapp: 'all' }, pinned: false,
    poll: { question: '¿Vienes?', kind: 'yes_no', options: ['Sí', 'No'] },
    recipientUids: ['admin1', 'member1'], recipientCount: 3, pushCount: 1, emailCount: 1, whatsappCount: 1,
    sentBy: 'admin1', signerName: 'Ana', signerTitle: 'presidente', sentAt: new Date(), nudgeCount: 0, lastNudgedAt: null,
    ...overrides,
  };
}

async function seed() {
  await getEnv().withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `organizations/${ORG}`), { name: 'Asociación', type: 'asociación', status: 'approved', municipalityId: 'mun1' });
    for (const [uid, role] of [['admin1', 'admin'], ['member1', 'member'], ['member2', 'member']]) {
      await setDoc(doc(db, `organizations/${ORG}/members/${uid}`), { userId: uid, joinedAt: new Date(), role });
    }
    await setDoc(doc(db, MSG), message());
    await setDoc(doc(db, `${MSG}/deliveries/member1`), {
      uid: 'member1', socioIds: ['m1'], names: ['Paco'], push: true, email: 'sent', whatsappSocioId: 'm1', whatsappSentAt: null, whatsappSentBy: null,
    });
    await setDoc(doc(db, `${MSG}/deliveries/typed_t1`), {
      uid: null, socioIds: ['t1'], names: ['Pepa'], push: false, email: null, whatsappSocioId: null, whatsappSentAt: null, whatsappSentBy: null,
    });
    await setDoc(doc(db, `${MSG}/votes/admin1`), { option: 0, votedAt: new Date() });
    await setDoc(doc(db, `organizations/${ORG}/messages/plain`), message({ poll: null }));
  });
}

beforeEach(async () => {
  await seed();
});

describe('messages', () => {
  it('admins and recipients read a message; other members and outsiders do not', async () => {
    await assertSucceeds(getDoc(doc(asUser(getEnv(), 'admin1'), MSG)));
    await assertSucceeds(getDoc(doc(asUser(getEnv(), 'member1'), MSG)));
    await assertFails(getDoc(doc(asUser(getEnv(), 'member2'), MSG)));
    await assertFails(getDoc(doc(asUser(getEnv(), 'stranger'), MSG)));
  });

  it('a recipient lists their own messages; the whole history is the admins’', async () => {
    const mine = (uid: string) =>
      query(collection(asUser(getEnv(), uid), `organizations/${ORG}/messages`), where('recipientUids', 'array-contains', uid), orderBy('sentAt', 'desc'), limit(20));
    await assertSucceeds(getDocs(mine('member1')));
    await assertSucceeds(getDocs(query(collection(asUser(getEnv(), 'admin1'), `organizations/${ORG}/messages`), orderBy('sentAt', 'desc'))));
    await assertFails(getDocs(query(collection(asUser(getEnv(), 'member1'), `organizations/${ORG}/messages`), orderBy('sentAt', 'desc'))));
  });

  it('a recipient who left the group no longer reads it', async () => {
    await getEnv().withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), `organizations/${ORG}/members/member1`));
    });
    await assertFails(getDoc(doc(asUser(getEnv(), 'member1'), MSG)));
  });

  it('no client creates or deletes a message; an admin only (un)pins it', async () => {
    await assertFails(setDoc(doc(asUser(getEnv(), 'admin1'), `organizations/${ORG}/messages/new`), message()));
    await assertFails(deleteDoc(doc(asUser(getEnv(), 'admin1'), MSG)));
    await assertSucceeds(updateDoc(doc(asUser(getEnv(), 'admin1'), MSG), { pinned: true }));
    await assertFails(updateDoc(doc(asUser(getEnv(), 'admin1'), MSG), { title: 'Otro' }));
    await assertFails(updateDoc(doc(asUser(getEnv(), 'member1'), MSG), { pinned: true }));
  });
});

describe('deliveries', () => {
  it('are the admins’ only — they name socios', async () => {
    await assertSucceeds(getDocs(collection(asUser(getEnv(), 'admin1'), `${MSG}/deliveries`)));
    await assertFails(getDoc(doc(asUser(getEnv(), 'member1'), `${MSG}/deliveries/member1`)));
  });

  it('an admin ticks a WhatsApp as sent by themself, now, and can untick it', async () => {
    const db = asUser(getEnv(), 'admin1');
    await assertSucceeds(updateDoc(doc(db, `${MSG}/deliveries/member1`), { whatsappSentAt: serverTimestamp(), whatsappSentBy: 'admin1' }));
    await assertSucceeds(updateDoc(doc(db, `${MSG}/deliveries/member1`), { whatsappSentAt: null, whatsappSentBy: null }));
    await assertFails(updateDoc(doc(db, `${MSG}/deliveries/member1`), { whatsappSentAt: serverTimestamp(), whatsappSentBy: 'member1' }));
    await assertFails(updateDoc(doc(db, `${MSG}/deliveries/member1`), { whatsappSentAt: new Date(2020, 0, 1), whatsappSentBy: 'admin1' }));
    await assertFails(updateDoc(doc(db, `${MSG}/deliveries/member1`), { email: 'failed', whatsappSentAt: serverTimestamp(), whatsappSentBy: 'admin1' }));
    // No WhatsApp was planned for this one.
    await assertFails(updateDoc(doc(db, `${MSG}/deliveries/typed_t1`), { whatsappSentAt: serverTimestamp(), whatsappSentBy: 'admin1' }));
    await assertFails(updateDoc(doc(asUser(getEnv(), 'member1'), `${MSG}/deliveries/member1`), { whatsappSentAt: serverTimestamp(), whatsappSentBy: 'member1' }));
  });
});

describe('reads', () => {
  it('a recipient marks it read once, now; nobody else can for them', async () => {
    const db = asUser(getEnv(), 'member1');
    await assertSucceeds(setDoc(doc(db, `${MSG}/reads/member1`), { readAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, `${MSG}/reads/member1`), { readAt: serverTimestamp() }));
    await assertFails(setDoc(doc(asUser(getEnv(), 'member2'), `${MSG}/reads/member2`), { readAt: serverTimestamp() }));
    await assertFails(setDoc(doc(asUser(getEnv(), 'admin1'), `${MSG}/reads/member1`), { readAt: serverTimestamp() }));
    await assertFails(setDoc(doc(asUser(getEnv(), 'admin1'), `${MSG}/reads/admin1`), { readAt: new Date(2020, 0, 1) }));
  });

  it('admins see who read it; a member only their own', async () => {
    await assertSucceeds(getDocs(collection(asUser(getEnv(), 'admin1'), `${MSG}/reads`)));
    await assertSucceeds(getDoc(doc(asUser(getEnv(), 'member1'), `${MSG}/reads/member1`)));
    await assertFails(getDocs(collection(asUser(getEnv(), 'member1'), `${MSG}/reads`)));
  });
});

describe('votes', () => {
  it('a recipient votes one of the options, and may change it', async () => {
    const db = asUser(getEnv(), 'member1');
    await assertSucceeds(setDoc(doc(db, `${MSG}/votes/member1`), { option: 1, votedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(db, `${MSG}/votes/member1`), { option: 0, votedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, `${MSG}/votes/member1`), { option: 2, votedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, `${MSG}/votes/member1`), { option: 0.5, votedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, `${MSG}/votes/member1`)));
  });

  it('no vote on a message without a poll, by a non-recipient or for someone else', async () => {
    await assertFails(setDoc(doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/messages/plain/votes/member1`), { option: 0, votedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(asUser(getEnv(), 'member2'), `${MSG}/votes/member2`), { option: 0, votedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(asUser(getEnv(), 'member1'), `${MSG}/votes/admin1`), { option: 0, votedAt: serverTimestamp() }));
  });

  it('who voted what is for the admins; a member sees only their own vote', async () => {
    await assertSucceeds(getDocs(collection(asUser(getEnv(), 'admin1'), `${MSG}/votes`)));
    await assertFails(getDocs(collection(asUser(getEnv(), 'member1'), `${MSG}/votes`)));
    await assertFails(getDoc(doc(asUser(getEnv(), 'member1'), `${MSG}/votes/admin1`)));
  });
});

describe('groupPrefs', () => {
  it('a member mutes a group for themself only', async () => {
    const db = asUser(getEnv(), 'member1');
    await assertSucceeds(setDoc(doc(db, `users/member1/groupPrefs/${ORG}`), { messagesMuted: true, updatedAt: new Date() }));
    await assertSucceeds(getDoc(doc(db, `users/member1/groupPrefs/${ORG}`)));
    await assertFails(setDoc(doc(db, `users/member1/groupPrefs/${ORG}`), { messagesMuted: 'yes', updatedAt: new Date() }));
    await assertFails(setDoc(doc(db, `users/member1/groupPrefs/${ORG}`), { messagesMuted: true, updatedAt: new Date(), cuota: false }));
    await assertFails(setDoc(doc(db, `users/member2/groupPrefs/${ORG}`), { messagesMuted: true, updatedAt: new Date() }));
    await assertFails(getDoc(doc(asUser(getEnv(), 'member2'), `users/member1/groupPrefs/${ORG}`)));
  });
});

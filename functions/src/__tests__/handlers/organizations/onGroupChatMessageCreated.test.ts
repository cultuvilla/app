// Handler tests for the group chat triggers: the thread summary and who gets a
// push, against the Firestore emulator.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import {
  onAvisoChatMessageCreated,
  onGroupChatMessageCreated,
} from '../../../organizations/onGroupChatMessageCreated';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const ORG_ID = 'org-1';
const AVISO_ID = 'Msg0000000001';
const db = () => admin.firestore();
const at = (min: number) => new Date(Date.UTC(2026, 10, 1, 10, min));

async function seed() {
  await db().doc(`organizations/${ORG_ID}`).set({
    name: 'La Anduela', description: null, images: [], type: 'asociación', status: 'approved', municipalityId: 'mun-1',
    villageSlug: 'villa', requestedBy: 'junta', reviewedBy: null, createdAt: new Date(), reviewedAt: null,
    commentCount: 0, readCount: 0, memberCount: 0, membersPublic: true, joinPolicy: 'open', sociosListVisible: false, chatAdminsOnly: false,
  });
  for (const [uid, role] of [['junta', 'admin'], ['ana', 'member'], ['paco', 'member'], ['pepa', 'member']] as const) {
    await db().doc(`organizations/${ORG_ID}/members/${uid}`).set({ userId: uid, joinedAt: new Date(), role });
  }
  await db().doc(`organizations/${ORG_ID}/messages/${AVISO_ID}`).set({
    title: 'Asamblea', body: 'El sábado', sentBy: 'junta', recipientUids: ['junta', 'ana', 'paco'],
  });
}

function chatSnap(path: string, uid: string, min: number, body = 'Hola') {
  return ft.firestore.makeDocumentSnapshot(
    { authorUid: uid, authorName: uid.toUpperCase(), body, createdAt: admin.firestore.Timestamp.fromDate(at(min)) },
    path,
  );
}

async function writeAviso(chatId: string, uid: string, min: number, body?: string) {
  const wrapped = ft.wrap(onAvisoChatMessageCreated);
  await wrapped({
    data: chatSnap(`organizations/${ORG_ID}/messages/${AVISO_ID}/chat/${chatId}`, uid, min, body),
    params: { orgId: ORG_ID, messageId: AVISO_ID, chatId },
  } as unknown as Parameters<typeof wrapped>[0]);
}

async function writeGeneral(chatId: string, uid: string, min: number) {
  const wrapped = ft.wrap(onGroupChatMessageCreated);
  await wrapped({
    data: chatSnap(`organizations/${ORG_ID}/chat/${chatId}`, uid, min),
    params: { orgId: ORG_ID, chatId },
  } as unknown as Parameters<typeof wrapped>[0]);
}

const notificationsOf = async (uid: string) =>
  (await db().collection(`users/${uid}/notifications`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const thread = async (id: string) => (await db().doc(`organizations/${ORG_ID}/chatThreads/${id}`).get()).data();

beforeEach(async () => {
  await resetEmulators();
  await seed();
});

afterAll(() => {
  ft.cleanup();
});

describe('an aviso’s chat', () => {
  it('pushes the aviso’s author, not the writer and not the other recipients', async () => {
    await writeAviso('c1', 'ana', 1, 'Yo voy');

    expect(await notificationsOf('junta')).toEqual([
      expect.objectContaining({
        id: `group_chat_${AVISO_ID}_c1`,
        type: 'group_message',
        title: 'La Anduela · Asamblea',
        body: 'ANA: Yo voy',
        entityKind: 'organization',
        entityId: ORG_ID,
        municipalityId: 'mun-1',
      }),
    ]);
    expect(await notificationsOf('ana')).toEqual([]);
    expect(await notificationsOf('paco')).toEqual([]);
  });

  it('then also pushes whoever already wrote in the thread', async () => {
    await writeAviso('c1', 'ana', 1);
    await writeAviso('c2', 'paco', 2);

    expect((await notificationsOf('ana')).map((n) => n.id)).toEqual([`group_chat_${AVISO_ID}_c2`]);
    expect((await notificationsOf('junta')).map((n) => n.id).sort()).toEqual([`group_chat_${AVISO_ID}_c1`, `group_chat_${AVISO_ID}_c2`]);
    expect(await notificationsOf('paco')).toEqual([]);
  });

  it('does not push a participant who has left the group', async () => {
    await writeAviso('c1', 'ana', 1);
    await db().doc(`organizations/${ORG_ID}/members/ana`).delete();
    await writeAviso('c2', 'paco', 2);

    expect(await notificationsOf('ana')).toEqual([]);
  });

  it('a redelivered event leaves one notification and one participant entry', async () => {
    await writeAviso('c1', 'ana', 1);
    await writeAviso('c1', 'ana', 1);

    expect(await notificationsOf('junta')).toHaveLength(1);
    expect((await thread(AVISO_ID))?.['participantUids']).toEqual(['ana']);
  });

  it('records nothing under a missing aviso', async () => {
    await db().doc(`organizations/${ORG_ID}/messages/${AVISO_ID}`).delete();
    await writeAviso('c1', 'ana', 1);

    expect(await thread(AVISO_ID)).toBeUndefined();
    expect(await notificationsOf('junta')).toEqual([]);
  });
});

describe('the general chat', () => {
  it('pushes only the members who opted in, never the writer', async () => {
    const prefs = (uid: string, generalChatPush: boolean) =>
      db().doc(`users/${uid}/groupPrefs/${ORG_ID}`).set({ messagesMuted: false, generalChatPush, updatedAt: new Date() });
    await prefs('paco', true);
    await prefs('ana', true);
    await prefs('pepa', false);
    // Written by a binary that predates the opt-in.
    await db().doc(`users/junta/groupPrefs/${ORG_ID}`).set({ messagesMuted: false, updatedAt: new Date() });
    // Opted in, then left.
    await prefs('gone', true);

    await writeGeneral('c1', 'ana', 1);

    expect(await notificationsOf('paco')).toEqual([
      expect.objectContaining({ id: 'group_chat_general_c1', type: 'group_message', title: 'La Anduela · Charla', body: 'ANA: Hola' }),
    ]);
    for (const uid of ['ana', 'pepa', 'junta', 'gone']) expect(await notificationsOf(uid)).toEqual([]);
  });

  it('by default pushes nobody', async () => {
    await writeGeneral('c1', 'ana', 1);
    for (const uid of ['junta', 'paco', 'pepa']) expect(await notificationsOf(uid)).toEqual([]);
  });
});

describe('the thread summary', () => {
  it('tracks the last message and everyone who wrote, once each, in order', async () => {
    await writeGeneral('c1', 'ana', 1);
    await writeGeneral('c2', 'paco', 2);
    await writeGeneral('c3', 'ana', 3);

    const row = await thread('general');
    expect(row?.['lastAuthorUid']).toBe('ana');
    expect((row?.['lastMessageAt'] as admin.firestore.Timestamp).toDate()).toEqual(at(3));
    expect(row?.['participantUids']).toEqual(['ana', 'paco']);
  });

  it('an older message delivered late does not move it back, but its author still counts', async () => {
    await writeGeneral('c2', 'paco', 5);
    await writeGeneral('c1', 'ana', 1);

    const row = await thread('general');
    expect(row?.['lastAuthorUid']).toBe('paco');
    expect((row?.['lastMessageAt'] as admin.firestore.Timestamp).toDate()).toEqual(at(5));
    expect(row?.['participantUids']).toEqual(['paco', 'ana']);
  });

  it('skips a message that does not match the schema', async () => {
    const wrapped = ft.wrap(onGroupChatMessageCreated);
    const snap = ft.firestore.makeDocumentSnapshot({ authorUid: 'ana' }, `organizations/${ORG_ID}/chat/bad`);
    await wrapped({ data: snap, params: { orgId: ORG_ID, chatId: 'bad' } } as unknown as Parameters<typeof wrapped>[0]);

    expect(await thread('general')).toBeUndefined();
  });
});

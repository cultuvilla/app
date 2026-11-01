// Handler tests for the group chat triggers: the thread summary and who gets a
// push, against the Firestore emulator.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import {
  onAvisoChatMessageCreated,
  onAvisoChatMessageDeleted,
  onGroupChatMessageCreated,
  onGroupChatMessageDeleted,
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

const optIn = (uid: string, orgId = ORG_ID) =>
  db().doc(`users/${uid}/groupPrefs/${orgId}`).set({ messagesMuted: false, chatPush: true, orgId, updatedAt: new Date() });

describe('notifications', () => {
  it('by default, no chat notifies anyone: not the aviso’s author, not earlier writers', async () => {
    await writeAviso('c1', 'ana', 1);
    await writeAviso('c2', 'paco', 2);
    await writeGeneral('c3', 'ana', 3);
    for (const uid of ['junta', 'ana', 'paco', 'pepa']) expect(await notificationsOf(uid)).toEqual([]);
  });

  it('an opted-in member gets each message of the general chat, naming its thread', async () => {
    await optIn('paco');
    await writeGeneral('c1', 'ana', 1);
    expect(await notificationsOf('paco')).toEqual([
      expect.objectContaining({
        id: 'group_chat_general_c1', type: 'group_message', title: 'La Anduela · Charla', body: 'ANA: Hola',
        entityKind: 'organization', entityId: ORG_ID, municipalityId: 'mun-1', chatThreadId: 'general',
      }),
    ]);
    expect(await notificationsOf('pepa')).toEqual([]);
  });

  it('the one opt-in covers avisos, for those who can read the aviso', async () => {
    await optIn('paco');
    await optIn('junta');
    await optIn('pepa');
    await writeAviso('c1', 'ana', 1, 'Yo voy');
    expect(await notificationsOf('paco')).toEqual([
      expect.objectContaining({ id: `group_chat_${AVISO_ID}_c1`, title: 'La Anduela · Asamblea', body: 'ANA: Yo voy', chatThreadId: AVISO_ID }),
    ]);
    expect(await notificationsOf('junta')).toHaveLength(1);
    // Opted in, but the aviso did not reach her.
    expect(await notificationsOf('pepa')).toEqual([]);
  });

  it('never the writer, nor someone who left, nor an opt-in for another group or switched off', async () => {
    await optIn('ana');
    await optIn('gone');
    await optIn('paco', 'other-org');
    await db().doc(`users/pepa/groupPrefs/${ORG_ID}`).set({ messagesMuted: false, chatPush: false, orgId: ORG_ID, updatedAt: new Date() });
    await writeGeneral('c1', 'ana', 1);
    for (const uid of ['ana', 'gone', 'paco', 'pepa']) expect(await notificationsOf(uid)).toEqual([]);
  });

  it('a redelivered event leaves one notification', async () => {
    await optIn('paco');
    await writeGeneral('c1', 'ana', 1);
    await writeGeneral('c1', 'ana', 1);
    expect(await notificationsOf('paco')).toHaveLength(1);
  });

  it('records nothing under a missing aviso', async () => {
    await optIn('paco');
    await db().doc(`organizations/${ORG_ID}/messages/${AVISO_ID}`).delete();
    await writeAviso('c1', 'ana', 1);
    expect(await thread(AVISO_ID)).toBeUndefined();
    expect(await notificationsOf('paco')).toEqual([]);
  });
});

describe('deleting a message', () => {
  async function deleteGeneral(chatId: string) {
    const wrapped = ft.wrap(onGroupChatMessageDeleted);
    await wrapped({
      data: chatSnap(`organizations/${ORG_ID}/chat/${chatId}`, 'ana', 1),
      params: { orgId: ORG_ID, chatId },
    } as unknown as Parameters<typeof wrapped>[0]);
  }

  it('takes its text out of the Buzón, and leaves the other messages', async () => {
    await optIn('paco');
    await writeGeneral('c1', 'ana', 1);
    await writeGeneral('c2', 'ana', 2);
    await deleteGeneral('c1');
    expect((await notificationsOf('paco')).map((n) => n.id)).toEqual(['group_chat_general_c2']);
  });

  it('reaches someone who switched the chat off after it arrived', async () => {
    await optIn('paco');
    await writeGeneral('c1', 'ana', 1);
    await db().doc(`users/paco/groupPrefs/${ORG_ID}`).set({ messagesMuted: false, chatPush: false, orgId: ORG_ID, updatedAt: new Date() });
    await deleteGeneral('c1');
    expect(await notificationsOf('paco')).toEqual([]);
  });

  it('an aviso’s message goes the same way, not the same id in the general chat', async () => {
    await optIn('paco');
    await writeAviso('c1', 'ana', 1);
    await writeGeneral('c1', 'ana', 2);
    const wrapped = ft.wrap(onAvisoChatMessageDeleted);
    await wrapped({
      data: chatSnap(`organizations/${ORG_ID}/messages/${AVISO_ID}/chat/c1`, 'ana', 1),
      params: { orgId: ORG_ID, messageId: AVISO_ID, chatId: 'c1' },
    } as unknown as Parameters<typeof wrapped>[0]);
    expect((await notificationsOf('paco')).map((n) => n.id)).toEqual(['group_chat_general_c1']);
  });

  it('leaves another group’s notification with the same ids', async () => {
    await optIn('paco', 'other-org');
    await db().doc('users/paco/notifications/group_chat_general_c1').set({ title: 'Otro grupo' });
    await deleteGeneral('c1');
    expect(await notificationsOf('paco')).toHaveLength(1);
  });
});

describe('the thread summary', () => {
  it('tracks the last message', async () => {
    await writeGeneral('c1', 'ana', 1);
    await writeGeneral('c2', 'paco', 2);
    const row = await thread('general');
    expect(row?.['lastAuthorUid']).toBe('paco');
    expect((row?.['lastMessageAt'] as admin.firestore.Timestamp).toDate()).toEqual(at(2));
  });

  it('an older message delivered late does not move it back', async () => {
    await writeGeneral('c2', 'paco', 5);
    await writeGeneral('c1', 'ana', 1);
    const row = await thread('general');
    expect(row?.['lastAuthorUid']).toBe('paco');
    expect((row?.['lastMessageAt'] as admin.firestore.Timestamp).toDate()).toEqual(at(5));
  });

  it('skips a message that does not match the schema', async () => {
    const wrapped = ft.wrap(onGroupChatMessageCreated);
    const snap = ft.firestore.makeDocumentSnapshot({ authorUid: 'ana' }, `organizations/${ORG_ID}/chat/bad`);
    await wrapped({ data: snap, params: { orgId: ORG_ID, chatId: 'bad' } } as unknown as Parameters<typeof wrapped>[0]);
    expect(await thread('general')).toBeUndefined();
  });
});

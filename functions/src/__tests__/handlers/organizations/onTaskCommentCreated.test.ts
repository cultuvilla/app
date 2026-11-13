// Handler tests for a task's comments: who gets a push, and that a deleted task
// takes its comments along, against the Firestore emulator.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { handleTaskComment, onGroupTaskDeleted } from '../../../organizations/onTaskCommentCreated';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const ORG_ID = 'org-1';
const TASK_ID = 'task-1';
const db = () => admin.firestore();
const params = { orgId: ORG_ID, taskId: TASK_ID, commentId: 'c1' };
const raw = (authorUid: string) => ({
  authorUid,
  authorName: authorUid.toUpperCase(),
  body: '¿Quién trae la llave?',
  createdAt: admin.firestore.Timestamp.fromDate(new Date()),
});
const pushed = async (uid: string) => db().doc(`users/${uid}/notifications/group_task_comment_${TASK_ID}_c1`).get();

async function seed(task: Record<string, unknown> = {}) {
  await db().doc(`organizations/${ORG_ID}`).set({ name: 'La Anduela', municipalityId: 'mun-1' });
  for (const uid of ['creador', 'ana', 'paco', 'otra']) {
    await db().doc(`organizations/${ORG_ID}/members/${uid}`).set({ userId: uid, joinedAt: new Date(), role: 'member' });
  }
  await db().doc(`organizations/${ORG_ID}/tasks/${TASK_ID}`).set({
    title: 'Abrir el local', createdBy: 'creador', assigneeUids: ['ana'], claimedUids: ['paco'], ...task,
  });
}

afterAll(() => {
  ft.cleanup();
});

describe('handleTaskComment', () => {
  beforeEach(async () => {
    await resetEmulators();
  });

  it('pushes the creator and the people on the task, not the writer or the rest', async () => {
    await seed();
    await handleTaskComment(db(), params, raw('ana'));
    const creator = await pushed('creador');
    expect(creator.get('type')).toBe('group_task');
    expect(creator.get('entityId')).toBe(ORG_ID);
    expect(creator.get('title')).toBe('La Anduela · «Abrir el local»');
    expect(creator.get('body')).toBe('ANA: ¿Quién trae la llave?');
    expect((await pushed('paco')).exists).toBe(true);
    expect((await pushed('ana')).exists).toBe(false);
    expect((await pushed('otra')).exists).toBe(false);
  });

  it('skips someone who has left the group', async () => {
    await seed({ assigneeUids: ['ido'] });
    await handleTaskComment(db(), params, raw('otra'));
    expect((await pushed('ido')).exists).toBe(false);
    expect((await pushed('creador')).exists).toBe(true);
  });

  it('does nothing under a missing task', async () => {
    await handleTaskComment(db(), params, raw('ana'));
    expect((await pushed('creador')).exists).toBe(false);
  });
});

describe('onGroupTaskDeleted', () => {
  it('removes the task\'s comments', async () => {
    await resetEmulators();
    const path = `organizations/${ORG_ID}/tasks/${TASK_ID}`;
    await db().doc(`${path}/chat/c1`).set(raw('ana'));
    const wrapped = ft.wrap(onGroupTaskDeleted);
    await wrapped({
      data: ft.firestore.makeDocumentSnapshot({ title: 'x' }, path),
      params: { orgId: ORG_ID, taskId: TASK_ID },
    } as unknown as Parameters<typeof wrapped>[0]);
    expect((await db().doc(`${path}/chat/c1`).get()).exists).toBe(false);
  });
});

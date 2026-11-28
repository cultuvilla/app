// The transactional writer every projection trigger converges through. Each
// trigger's own suite pins its wiring; this one pins the helper's contract.

import { describe, it, expect, beforeEach } from 'vitest';
import * as admin from 'firebase-admin';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { deleteRow, mergeRow, projectRowsFromCurrentSource, setRow } from '../../../shared/convergeOnSource';

const db = admin.firestore();

beforeEach(async () => {
  await resetEmulators();
});

describe('projectRowsFromCurrentSource', () => {
  it('hands the projection null for a source that no longer exists', async () => {
    await db.doc('rows/a').set({ name: 'stale' });

    const outcome = await projectRowsFromCurrentSource({
      db,
      sourceRef: db.doc('sources/s1'),
      project: (current) => [current ? setRow(db.doc('rows/a'), { name: 'x' }) : deleteRow(db.doc('rows/a'))],
    });

    expect(outcome).toEqual({ set: 0, deleted: 1 });
    expect((await db.doc('rows/a').get()).exists).toBe(false);
  });

  it('writes every row from the source as stored, set and merge alike', async () => {
    await db.doc('sources/s1').set({ name: 'Ana' });
    await db.doc('rows/b').set({ keep: true });

    const outcome = await projectRowsFromCurrentSource({
      db,
      sourceRef: db.doc('sources/s1'),
      project: async (current, tx) => {
        const extra = await tx.get(db.doc('rows/b'));
        return [
          setRow(db.doc('rows/a'), { name: current?.['name'] }),
          mergeRow(db.doc('rows/b'), { name: current?.['name'], hadExtra: extra.exists }),
        ];
      },
    });

    expect(outcome).toEqual({ set: 2, deleted: 0 });
    expect((await db.doc('rows/a').get()).data()).toEqual({ name: 'Ana' });
    expect((await db.doc('rows/b').get()).data()).toEqual({ keep: true, name: 'Ana', hadExtra: true });
  });
});

// Trigger tests for assignSocioNumber against the Firestore emulator.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { assignNextSocioNumber, assignSocioNumber } from '../../../organizations/assignSocioNumber';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrapped = ft.wrap(assignSocioNumber);
const ORG_ID = 'org-1';

function socioRow(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'typed', socioNumber: null, displayName: 'Paco', uid: null, personId: null, responsibleUid: null, adminTitle: null,
    altaAt: new Date('2025-01-01'), bajaAt: null, memberJoinedAt: null, createdBy: 'admin', ...overrides,
  };
}

const db = () => admin.firestore();
const numberOf = async (id: string) => (await db().doc(`organizations/${ORG_ID}/socios/${id}`).get()).get('socioNumber') as number | null;

async function fire(socioId: string) {
  const snap = await db().doc(`organizations/${ORG_ID}/socios/${socioId}`).get();
  const event = ft.firestore.makeDocumentSnapshot(snap.data() ?? {}, snap.ref.path);
  await wrapped({ data: event, params: { orgId: ORG_ID, socioId } } as unknown as Parameters<typeof wrapped>[0]);
}

beforeEach(async () => {
  await resetEmulators();
});

afterAll(() => {
  ft.cleanup();
});

describe('assignSocioNumber', () => {
  it('numbers the first socio 1 and the next one 2', async () => {
    await db().doc(`organizations/${ORG_ID}/socios/a`).set(socioRow());
    await fire('a');
    await db().doc(`organizations/${ORG_ID}/socios/b`).set(socioRow());
    await fire('b');
    expect(await numberOf('a')).toBe(1);
    expect(await numberOf('b')).toBe(2);
    expect((await db().doc(`organizations/${ORG_ID}/socioNumbering/current`).get()).data()).toEqual({ lastNumber: 2 });
  });

  it('goes past the highest number set by hand or imported', async () => {
    await db().doc(`organizations/${ORG_ID}/socios/imported`).set(socioRow({ socioNumber: 212 }));
    await db().doc(`organizations/${ORG_ID}/socios/new`).set(socioRow());
    await fire('new');
    expect(await numberOf('new')).toBe(213);
  });

  it('never reuses the number of a baja, nor one the counter already gave', async () => {
    await db().doc(`organizations/${ORG_ID}/socioNumbering/current`).set({ lastNumber: 9 });
    await db().doc(`organizations/${ORG_ID}/socios/gone`).set(socioRow({ socioNumber: 5, bajaAt: new Date() }));
    await db().doc(`organizations/${ORG_ID}/socios/new`).set(socioRow());
    await fire('new');
    expect(await numberOf('new')).toBe(10);
  });

  it('leaves a row that came with its number alone', async () => {
    await db().doc(`organizations/${ORG_ID}/socios/a`).set(socioRow({ socioNumber: 57 }));
    await fire('a');
    expect(await numberOf('a')).toBe(57);
    expect((await db().doc(`organizations/${ORG_ID}/socioNumbering/current`).get()).exists).toBe(false);
  });

  it('a re-delivered event does not renumber', async () => {
    await db().doc(`organizations/${ORG_ID}/socios/a`).set(socioRow());
    await fire('a');
    expect(await assignNextSocioNumber(db(), ORG_ID, 'a')).toBe('already-numbered');
    expect(await numberOf('a')).toBe(1);
  });

  it('rows created at once get different numbers', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    await Promise.all(ids.map((id) => db().doc(`organizations/${ORG_ID}/socios/${id}`).set(socioRow())));
    await Promise.all(ids.map((id) => assignNextSocioNumber(db(), ORG_ID, id)));
    const numbers = await Promise.all(ids.map(numberOf));
    expect([...numbers].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

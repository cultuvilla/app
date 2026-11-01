// Handler tests for the Telegram alerts on a new Embajador request (app) and
// lead (web): each trigger reads what the message names and publishes once.

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';

const published = vi.hoisted(() => [] as unknown[]);
vi.mock('../../../notify/publishNotify', () => ({
  publishNotify: vi.fn((message: unknown) => {
    published.push(message);
    return Promise.resolve();
  }),
}));

import { onAmbassadorLeadCreated, onOrganizerRequestCreated } from '../../../village/onAmbassadorRequestCreated';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const db = () => admin.firestore();

beforeEach(async () => {
  await resetEmulators();
  published.length = 0;
});

afterAll(() => { ft.cleanup(); });

describe('onOrganizerRequestCreated', () => {
  it('announces the requester, pueblo and motivation', async () => {
    await db().doc('municipalities/m1').set({ name: 'Santillana del Mar', province: 'Cantabria' });
    await db().doc('users/u1').set({ displayName: 'Estefanía' });
    const ref = db().doc('organizerRequests/r1');
    await ref.set({ userId: 'u1', municipalityId: 'm1', status: 'pending', motivation: 'Dar visibilidad.', requestedAt: new Date() });
    const snap = ft.firestore.makeDocumentSnapshot((await ref.get()).data() ?? {}, ref.path);

    await ft.wrap(onOrganizerRequestCreated)({ data: snap, params: { requestId: 'r1' }, time: new Date().toISOString() } as never);

    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      title: 'Solicitud de Embajador: Santillana del Mar (Cantabria)',
      body: 'Estefanía · desde la app\n«Dar visibilidad.»',
      dedupeKey: 'organizer-request:r1',
    });
  });

  it('drops an alert whose retries ran past the hour', async () => {
    const ref = db().doc('organizerRequests/r2');
    const snap = ft.firestore.makeDocumentSnapshot({ userId: 'u1', municipalityId: 'm1' }, ref.path);
    const time = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    await ft.wrap(onOrganizerRequestCreated)({ data: snap, params: { requestId: 'r2' }, time } as never);

    expect(published).toHaveLength(0);
  });
});

describe('onAmbassadorLeadCreated', () => {
  it('announces the lead with name and phone', async () => {
    const snap = ft.firestore.makeDocumentSnapshot(
      { municipalityId: null, municipalityName: 'Villarriba', name: 'Juan', phone: '+34612345678', status: 'new', createdAt: new Date() },
      'ambassadorLeads/l1',
    );

    await ft.wrap(onAmbassadorLeadCreated)({ data: snap, params: { leadId: 'l1' }, time: new Date().toISOString() } as never);

    expect(published).toEqual([
      expect.objectContaining({ title: 'Embajador desde la web: Villarriba (sin identificar)', body: 'Juan · +34612345678' }),
    ]);
  });
});

/* eslint-disable @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access */
// vi.mock factories fake the firebase/firestore SDK shape.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const batch = { set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };

vi.mock('../../src/firebase', () => ({ getDb: vi.fn(() => ({})), getFirebaseFunctions: vi.fn(() => ({})) }));
vi.mock('../../src/firebase/refs/client', () => ({
  organizationSociosCollection: vi.fn((_db, orgId: string) => ({ _coll: `organizations/${orgId}/socios` })),
  organizationSocioDoc: vi.fn((_db, orgId: string, id: string) => ({ _path: `organizations/${orgId}/socios/${id}` })),
  organizationSocioPersonaLockDoc: vi.fn((_db, orgId: string, id: string) => ({ _path: `organizations/${orgId}/socioPersonaLocks/${id}` })),
  organizationSocioPrivateDoc: vi.fn((_db, orgId: string, id: string) => ({ _path: `organizations/${orgId}/socioPrivate/${id}` })),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...args: unknown[]) => (args.length === 1 ? { id: 'new-socio' } : { _path: args.slice(1).join('/') })),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(() => batch),
  onSnapshot: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

import { setDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  addPersonaSocio,
  addTypedSocio,
  linkSocioToMember,
  saveSocioContactSharing,
  setSocioAdminTitle,
  setSocioBaja,
  setSocioNumber,
  updateTypedSocio,
} from '../../src/services/socioService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('socioService', () => {
  it('addTypedSocio writes the row and its private contact in one batch', async () => {
    const id = await addTypedSocio('org1', { displayName: ' Paco ', socioNumber: 57, phone: '600', email: '' }, 'admin1');
    expect(id).toBe('new-socio');
    expect(batch.set).toHaveBeenCalledTimes(2);
    const [, row] = batch.set.mock.calls[0];
    expect(row).toMatchObject({ kind: 'typed', socioNumber: 57, displayName: 'Paco', uid: null, bajaAt: null, createdBy: 'admin1' });
    const [privateRef, contact] = batch.set.mock.calls[1];
    expect(privateRef._path).toBe('organizations/org1/socioPrivate/new-socio');
    expect(contact).toEqual({ phone: '600', email: null, consentAnsweredAt: null });
    expect(batch.commit).toHaveBeenCalled();
  });

  it('addPersonaSocio writes the row and the persona lock in one batch', async () => {
    const id = await addPersonaSocio('org1', { id: 'p1', displayName: 'Lucía' }, 'u1');
    const [, row] = batch.set.mock.calls[0];
    expect(row).toMatchObject({ kind: 'persona', personId: 'p1', responsibleUid: 'u1', createdBy: 'u1', uid: null });
    const [lockRef, lock] = batch.set.mock.calls[1];
    expect(lockRef._path).toBe('organizations/org1/socioPersonaLocks/p1');
    expect(lock).toEqual({ socioId: id });
    expect(batch.commit).toHaveBeenCalled();
  });

  it('setSocioBaja stamps a server time, never deletes the row, and frees a persona lock', async () => {
    await setSocioBaja('org1', { id: 's1', kind: 'persona', personId: 'p1' });
    expect(batch.update).toHaveBeenCalledWith({ _path: 'organizations/org1/socios/s1' }, { bajaAt: 'SERVER_TS' });
    expect(batch.delete).toHaveBeenCalledWith({ _path: 'organizations/org1/socioPersonaLocks/p1' });
  });

  it('setSocioBaja on a typed socio touches no lock', async () => {
    await setSocioBaja('org1', { id: 't1', kind: 'typed', personId: null });
    expect(batch.delete).not.toHaveBeenCalled();
  });

  it('updateTypedSocio corrects the name and number together', async () => {
    await updateTypedSocio('org1', 't1', { displayName: ' Paco P ', socioNumber: null, phone: '', email: 'p@x.es' });
    expect(batch.update.mock.calls[0][1]).toEqual({ displayName: 'Paco P', socioNumber: null });
  });

  it('setSocioNumber writes only the number', async () => {
    await setSocioNumber('org1', 's1', 12);
    expect(vi.mocked(updateDoc).mock.calls[0][1]).toEqual({ socioNumber: 12 });
  });

  it('setSocioAdminTitle can clear the title', async () => {
    await setSocioAdminTitle('org1', 's1', null);
    expect(vi.mocked(updateDoc).mock.calls[0][1]).toEqual({ adminTitle: null });
  });

  it('saveSocioContactSharing records the answer with what the member chose to share', async () => {
    await saveSocioContactSharing('org1', 's1', { phone: null, email: 'a@b.es' });
    const [ref, data] = vi.mocked(setDoc).mock.calls[0];
    expect((ref as unknown as { _path: string })._path).toBe('organizations/org1/socioPrivate/s1');
    expect(data).toMatchObject({ phone: null, email: 'a@b.es' });
    expect((data as { consentAnsweredAt: unknown }).consentAnsweredAt).toBeInstanceOf(Date);
  });

  it('linkSocioToMember calls the callable', async () => {
    const call = vi.fn().mockResolvedValue({ data: { ok: true } });
    vi.mocked(httpsCallable).mockReturnValue(call as unknown as ReturnType<typeof httpsCallable>);
    await linkSocioToMember('org1', 's1', 'u2');
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'linkSocioToMember');
    expect(call).toHaveBeenCalledWith({ orgId: 'org1', socioId: 's1', memberUid: 'u2' });
  });
});

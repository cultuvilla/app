// Handler test for the web studio pairing callables. Firestore + Auth run
// against the real emulators.

import { describe, it, expect, beforeEach } from 'vitest';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { resetEmulators } from '../helpers/firestoreEmulator';
import {
  runApproveStudioPairing,
  runClaimStudioPairing,
  runCreateStudioPairing,
  runInspectStudioPairing,
} from '../../studio/studioPairing';

const pairingDoc = (id: string) => getFirestore().collection('studioPairings').doc(id);

/** The uid a custom token was minted for (the emulator signs it unsigned). */
function tokenUid(token: string): string {
  const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as { uid: string };
  return payload.uid;
}

describe('studio pairing callables', () => {
  beforeEach(async () => {
    await resetEmulators();
  });

  it('pairs a studio with the app user who approves it, once', async () => {
    const { uid } = await getAuth().createUser({ email: 'autora@example.com' });
    const pairing = await runCreateStudioPairing('203.0.113.7');
    expect(pairing.code).toMatch(/^[A-Z2-9]{4}$/);
    expect(pairing.expiresAt).toBeGreaterThan(Date.now());

    const claim = { pairingId: pairing.pairingId, claimSecret: pairing.claimSecret };
    await expect(runClaimStudioPairing(claim)).resolves.toEqual({ status: 'pending' });

    await expect(runInspectStudioPairing(uid, { pairingId: pairing.pairingId })).resolves.toEqual({
      code: pairing.code,
      expiresAt: pairing.expiresAt,
    });
    await runApproveStudioPairing(uid, { pairingId: pairing.pairingId });

    const claimed = await runClaimStudioPairing(claim);
    expect(claimed.status).toBe('approved');
    expect(claimed.status === 'approved' && tokenUid(claimed.token)).toBe(uid);

    expect((await pairingDoc(pairing.pairingId).get()).exists).toBe(false);
    await expect(runClaimStudioPairing(claim)).rejects.toMatchObject({ code: 'not-found' });
  });

  it('keeps the claim secret out of the stored pairing', async () => {
    const pairing = await runCreateStudioPairing(null);
    const stored = (await pairingDoc(pairing.pairingId).get()).data();
    expect(JSON.stringify(stored)).not.toContain(pairing.claimSecret);
  });

  it('answers a wrong claim secret as if the pairing did not exist', async () => {
    const pairing = await runCreateStudioPairing(null);
    await runApproveStudioPairing('someone', { pairingId: pairing.pairingId });
    await expect(
      runClaimStudioPairing({ pairingId: pairing.pairingId, claimSecret: 'guess' }),
    ).rejects.toMatchObject({ code: 'not-found' });
    expect((await pairingDoc(pairing.pairingId).get()).data()?.uid).toBe('someone');
  });

  it('needs a signed-in app user to inspect or approve', async () => {
    const pairing = await runCreateStudioPairing(null);
    await expect(runInspectStudioPairing(undefined, { pairingId: pairing.pairingId })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(runApproveStudioPairing(undefined, { pairingId: pairing.pairingId })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('lets only the first app user approve a pairing', async () => {
    const pairing = await runCreateStudioPairing(null);
    await runApproveStudioPairing('first', { pairingId: pairing.pairingId });
    await expect(runApproveStudioPairing('second', { pairingId: pairing.pairingId })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    await expect(runInspectStudioPairing('second', { pairingId: pairing.pairingId })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('refuses an expired pairing, and the claim deletes it', async () => {
    const pairing = await runCreateStudioPairing(null);
    await runApproveStudioPairing('autora', { pairingId: pairing.pairingId });
    await pairingDoc(pairing.pairingId).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });

    await expect(runApproveStudioPairing('autora', { pairingId: pairing.pairingId })).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(
      runClaimStudioPairing({ pairingId: pairing.pairingId, claimSecret: pairing.claimSecret }),
    ).rejects.toMatchObject({ code: 'not-found' });
    expect((await pairingDoc(pairing.pairingId).get()).exists).toBe(false);
  });

  it('sweeps expired pairings when a new one is asked for', async () => {
    await pairingDoc('stale-pairing-0000').set({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    await runCreateStudioPairing(null);
    expect((await pairingDoc('stale-pairing-0000').get()).exists).toBe(false);
  });

  it('rejects a malformed pairing id', async () => {
    await expect(runApproveStudioPairing('autora', { pairingId: '../users/x' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('rate-limits pairings per caller IP', async () => {
    for (let i = 0; i < 20; i++) await runCreateStudioPairing('198.51.100.1');
    await expect(runCreateStudioPairing('198.51.100.1')).rejects.toMatchObject({ code: 'resource-exhausted' });
    await expect(runCreateStudioPairing('198.51.100.2')).resolves.toMatchObject({ code: expect.any(String) });
  });
});

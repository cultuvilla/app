// The read/write pair server-side membership creations (startVillage, organizer
// approval) use to project a seeded member's residence onto their person doc,
// now that syncMemberBarrioToResidence is delete-only. Driven inside real
// emulator transactions, since the helpers take a Transaction.
import { describe, it, expect, beforeEach } from 'vitest';
import * as admin from 'firebase-admin';
import { buildPersonData, type MunicipalityLink } from '@cultuvilla/shared/models';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { readResidenceTarget, upsertResidenceLink } from '../../../village/residenceProjection';

const db = () => admin.firestore();
const USER = 'user-1';

async function seedPerson(id: string, userId: string | null, links: MunicipalityLink[]): Promise<void> {
  await db()
    .doc(`persons/${id}`)
    .set(buildPersonData({ givenName: id, userId, createdBy: USER, municipalityLinks: links }));
}

async function linksOf(id: string): Promise<unknown> {
  return (await db().doc(`persons/${id}`).get()).get('municipalityLinks');
}

async function project(userId: string, municipalityId: string, barrioId: string | null) {
  return db().runTransaction(async (tx) => {
    const target = await readResidenceTarget(tx, db(), userId);
    if (target) upsertResidenceLink(tx, target, municipalityId, barrioId);
    return target;
  });
}

beforeEach(async () => {
  await resetEmulators();
});

describe('residenceProjection', () => {
  it('returns null and writes nothing when the user has no linked person', async () => {
    await seedPerson('someone-elses', 'other-user', []);
    await expect(project(USER, 'm1', null)).resolves.toBeNull();
    expect(await linksOf('someone-elses')).toEqual([]);
  });

  it('reads the account holder’s person, not a persona they merely created', async () => {
    await seedPerson('family-member', null, [{ municipalityId: 'm9', barrioId: null }]);
    await seedPerson('me', USER, [{ municipalityId: 'm2', barrioId: null }]);

    const target = await project(USER, 'm1', null);

    expect(target?.ref.id).toBe('me');
    expect(target?.links).toEqual([{ municipalityId: 'm2', barrioId: null }]);
  });

  it('adds the village link alongside the person’s other villages', async () => {
    await seedPerson('me', USER, [{ municipalityId: 'm2', barrioId: 'b2' }]);
    await project(USER, 'm1', 'centro');
    expect(await linksOf('me')).toEqual([
      { municipalityId: 'm2', barrioId: 'b2' },
      { municipalityId: 'm1', barrioId: 'centro' },
    ]);
  });

  it('replaces an existing link for the same village rather than duplicating it', async () => {
    await seedPerson('me', USER, [
      { municipalityId: 'm1', barrioId: 'old-barrio' },
      { municipalityId: 'm2', barrioId: null },
    ]);
    await project(USER, 'm1', null);
    expect(await linksOf('me')).toEqual([
      { municipalityId: 'm2', barrioId: null },
      { municipalityId: 'm1', barrioId: null },
    ]);
  });
});

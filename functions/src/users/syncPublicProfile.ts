import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import {
  organizationSocioPrivateDoc,
  organizationSociosCollection,
  publicProfileDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import type { PublicProfileData } from '@cultuvilla/shared/models';

const db = admin.firestore();

/**
 * Keeps publicProfiles/{uid} — what anyone may read about an account — in step
 * with users/{uid}, which also holds private contact fields and is readable by
 * its owner only.
 *
 * Source of truth: users/{uid}.displayName + activeMunicipalityId.
 * Read target:    publicProfiles/{uid}, the same two fields and nothing else.
 *
 * Deleting the account doc deletes the projection. The write is skipped when
 * the projected fields are unchanged, so email/telephone/terms edits don't fan
 * out a no-op write.
 *
 * A new phone or email also reaches every group the member shares it with: see
 * syncSharedSocioContact.
 */
export const syncPublicProfile = onDocumentWritten(
  { document: 'users/{userId}', region: 'us-central1' },
  async (event) => {
    const handler = 'syncPublicProfile';
    const { userId } = event.params;
    const ref = publicProfileDoc(db, userId);
    const after = event.data?.after.data();

    if (!after) {
      await ref.delete();
      logger.info('publicProfile deleted with its account', { handler, userId });
      return;
    }

    const next = projectPublicProfile(after);
    const before = event.data?.before.data();
    await syncSharedSocioContact(userId, before, after);
    if (before && samePublicProfile(projectPublicProfile(before), next)) return;

    await ref.set(next);
    logger.info('publicProfile propagated', { handler, userId });
  },
);

function contactValue(user: FirebaseFirestore.DocumentData | undefined, field: 'telephone' | 'email'): string | null {
  const value: unknown = user?.[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Admins read a socio's contact from `socioPrivate`, since a user's own doc is
 * private to them. It holds the account's values, so it follows them: only what
 * the socio already shares, in the groups where they are still one. Removing a
 * value from the account leaves the shared one alone.
 */
async function syncSharedSocioContact(
  uid: string,
  before: FirebaseFirestore.DocumentData | undefined,
  after: FirebaseFirestore.DocumentData,
): Promise<void> {
  const phone = contactValue(after, 'telephone');
  const email = contactValue(after, 'email');
  const phoneChanged = phone !== null && phone !== contactValue(before, 'telephone');
  const emailChanged = email !== null && email !== contactValue(before, 'email');
  if (!before || (!phoneChanged && !emailChanged)) return;

  const memberships = await db.collectionGroup('members').where('userId', '==', uid).get();
  const orgIds = memberships.docs
    .filter((doc) => doc.ref.parent.parent?.parent.id === 'organizations')
    .flatMap((doc) => doc.ref.parent.parent?.id ?? []);
  let updated = 0;
  for (const orgId of orgIds) {
    const rows = await organizationSociosCollection(db, orgId).where('uid', '==', uid).where('bajaAt', '==', null).get();
    for (const row of rows.docs) {
      const ref = organizationSocioPrivateDoc(db, orgId, row.id);
      const shared = (await ref.get()).data();
      if (!shared) continue;
      const patch = {
        ...(phoneChanged && shared.phone ? { phone } : {}),
        ...(emailChanged && shared.email ? { email } : {}),
      };
      if (Object.keys(patch).length === 0) continue;
      await ref.update(patch);
      updated += 1;
    }
  }
  if (updated > 0) logger.info('shared socio contact updated', { handler: 'syncPublicProfile', uid, updated });
}

export function projectPublicProfile(user: FirebaseFirestore.DocumentData): PublicProfileData {
  const displayName: unknown = user['displayName'];
  const activeMunicipalityId: unknown = user['activeMunicipalityId'];
  return {
    displayName: typeof displayName === 'string' ? displayName : '',
    activeMunicipalityId: typeof activeMunicipalityId === 'string' ? activeMunicipalityId : null,
  };
}

function samePublicProfile(a: PublicProfileData, b: PublicProfileData): boolean {
  return a.displayName === b.displayName && a.activeMunicipalityId === b.activeMunicipalityId;
}

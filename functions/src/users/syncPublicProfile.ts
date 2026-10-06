import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { publicProfileDoc } from '@cultuvilla/shared/firebase/refs/admin';
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
    if (before && samePublicProfile(projectPublicProfile(before), next)) return;

    await ref.set(next);
    logger.info('publicProfile propagated', { handler, userId });
  },
);

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

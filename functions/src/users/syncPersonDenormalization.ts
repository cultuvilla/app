import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Keeps users/{uid}.displayName in sync with the linked persons/{personId} doc,
 * and `community.organizerSex` on every pueblo where that user is Embajador
 * (the Embajador/Embajadora title).
 *
 * Source of truth: persons/{personId} (givenName + middleNames[] + firstSurname
 *   + secondSurname).
 * Read target:   users/{persons.userId}.displayName, computed via the same
 *   buildDisplayName projection the UI uses.
 *
 * The trigger fires on every write to a person doc (create, update, delete).
 * It short-circuits when the projected displayName is unchanged so unrelated
 * person mutations don't fan out a no-op user write.
 */
export const syncPersonDenormalization = onDocumentWritten(
  { document: 'persons/{personId}', region: 'us-central1' },
  async (event) => {
    const handler = 'syncPersonDenormalization';
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    // Delete: leave the user doc alone. The displayName is a snapshot — it
    // stays valid even if the source persona is removed. Reads downstream can
    // decide whether to clear it via a separate flow.
    if (!after) return;

    const userId = (after['userId'] as string | undefined) ?? null;
    if (!userId) return;

    await syncOrganizerSex(handler, userId, before, after);

    const beforeName = before ? projectName(before) : null;
    const afterName = projectName(after);
    if (beforeName === afterName) return;

    // typed-refs: allowed — set({merge:true}) with partial payload; user has
    // pending edits in this file (see git status), avoid conflicting refactor.
    const userRef = db.doc(`users/${userId}`);
    const userSnap = await userRef.get();
    if (userSnap.exists && userSnap.get('displayName') === afterName) return;

    // set(merge:true) — handles both "user doc exists" (update displayName) and
    // "user doc not yet created" (onboarding writes person first; the client's
    // subsequent createUserProfile call merges email/telephone/etc. on top
    // without touching displayName). Admin SDK bypasses firestore.rules.
    await userRef.set({ displayName: afterName }, { merge: true });
    logger.info('users.displayName propagated', {
      handler,
      personId: event.params.personId,
      userId,
      createdUserDoc: !userSnap.exists,
    });
  },
);

async function syncOrganizerSex(
  handler: string,
  userId: string,
  before: FirebaseFirestore.DocumentData | undefined,
  after: FirebaseFirestore.DocumentData,
): Promise<void> {
  const afterSex = normalizeSex(after['sex']);
  if (before && normalizeSex(before['sex']) === afterSex) return;

  const snap = await db
    .collection('municipalities')
    .where('community.organizerId', '==', userId)
    .get();
  const stale = snap.docs.filter((d) => d.get('community.organizerSex') !== afterSex);
  if (stale.length === 0) return;

  const batch = db.batch();
  for (const doc of stale) batch.update(doc.ref, { 'community.organizerSex': afterSex });
  await batch.commit();
  logger.info('community.organizerSex propagated', {
    handler,
    userId,
    municipalities: stale.length,
  });
}

function normalizeSex(value: unknown): 'male' | 'female' | 'other' | null {
  return value === 'male' || value === 'female' || value === 'other' ? value : null;
}

function projectName(person: FirebaseFirestore.DocumentData): string {
  const p = person as Record<string, unknown>;
  const parts: string[] = [];
  const given: unknown = p['givenName'];
  if (typeof given === 'string' && given.length > 0) parts.push(given);
  const middle: unknown = p['middleNames'];
  if (Array.isArray(middle)) {
    for (const m of middle as unknown[]) {
      if (typeof m === 'string' && m.length > 0) parts.push(m);
    }
  }
  const first: unknown = p['firstSurname'];
  if (typeof first === 'string' && first.length > 0) parts.push(first);
  const second: unknown = p['secondSurname'];
  if (typeof second === 'string' && second.length > 0) parts.push(second);
  return parts.join(' ');
}

import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { defineDocumentTrigger } from '../shared/define/defineDocumentTrigger';
import { mergeRow, projectRowsFromCurrentSource, type RowWrite } from '../shared/convergeOnSource';

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
 * The event decides which half to sync — the displayName when the projected
 * name changed, the title when the sex did — so unrelated person mutations
 * don't fan out a no-op write. What it writes
 * comes from the person as it stands now, read in the same transaction: a late
 * update delivered after the person (or the whole account) was deleted would
 * otherwise recreate users/{uid} through the merge write below.
 */
export const syncPersonDenormalization = defineDocumentTrigger(
  'syncPersonDenormalization',
  { kind: 'written', document: 'persons/{personId}' },
  async (event) => {
    const handler = 'syncPersonDenormalization';
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    // Delete: leave the user doc alone. The displayName is a snapshot — it
    // stays valid even if the source persona is removed. Reads downstream can
    // decide whether to clear it via a separate flow.
    if (!after) return;
    const nameChanged = !before || projectName(before) !== projectName(after);
    const sexChanged = !before || normalizeSex(before['sex']) !== normalizeSex(after['sex']);
    if (!nameChanged && !sexChanged) return;

    const { personId } = event.params;
    let createdUserDoc = false;
    let userId: string | null = null;
    const outcome = await projectRowsFromCurrentSource({
      db,
      sourceRef: db.doc(`persons/${personId}`),
      project: async (current, tx) => {
        createdUserDoc = false;
        userId = typeof current?.['userId'] === 'string' && current['userId'] ? current['userId'] : null;
        if (!current || !userId) return [];

        const name = projectName(current);
        const sex = normalizeSex(current['sex']);
        // typed-refs: allowed — set({merge:true}) with a partial payload, which
        // the strict users converter would reject.
        const userRef = db.doc(`users/${userId}`);
        const [userSnap, organized] = await Promise.all([
          nameChanged ? tx.get(userRef) : null,
          sexChanged ? tx.get(db.collection('municipalities').where('community.organizerId', '==', userId)) : null,
        ]);

        const rows: RowWrite[] = (organized?.docs ?? [])
          .filter((doc) => doc.get('community.organizerSex') !== sex)
          .map((doc) => mergeRow(doc.ref, { community: { organizerSex: sex } }));
        if (userSnap && (!userSnap.exists || userSnap.get('displayName') !== name)) {
          // set(merge:true) — handles both "user doc exists" (update
          // displayName) and "user doc not yet created" (onboarding writes
          // person first; the client's subsequent createUserProfile call
          // merges email/telephone/etc. on top without touching displayName).
          createdUserDoc = !userSnap.exists;
          rows.push(mergeRow(userRef, { displayName: name }));
        }
        return rows;
      },
    });
    if (outcome.set === 0) return;
    logger.info('person denormalization propagated', {
      handler,
      personId,
      userId,
      writes: outcome.set,
      createdUserDoc,
    });
  },
);

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

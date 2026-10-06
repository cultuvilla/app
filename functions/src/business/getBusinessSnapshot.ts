import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { adminDoc } from '@cultuvilla/shared/firebase/refs/admin';

/**
 * Serve the business registry to the founders' panel.
 *
 * The registry and the panel live in the private `cultuvilla/business` repo,
 * whose deploy publishes the snapshot to this doc. `_admin/**` is denied to
 * every client in firestore.rules, so this callable — which checks the caller
 * is an app admin — is the only way a browser can read it. That is the whole
 * point: an earlier version shipped the JSON in the public web bundle.
 *
 * Stored as a JSON string, not a map: the snapshot nests arrays, which
 * Firestore cannot hold.
 */
const handler = 'getBusinessSnapshot';
export const BUSINESS_SNAPSHOT_DOC = '_admin/businessSnapshot';

export async function runGetBusinessSnapshot(uid: string | null): Promise<unknown> {
  if (!uid) throw new HttpsError('unauthenticated', 'Hay que iniciar sesión.');
  const db = getFirestore();
  const caller = await adminDoc(db, uid).get();
  if (!caller.exists) {
    // Deliberately the same shape for "not signed in" and "not an admin" from
    // the panel's point of view, so the panel has one error path to render.
    throw new HttpsError('permission-denied', 'Esta herramienta es solo para el equipo.');
  }
  const published = await db.doc(BUSINESS_SNAPSHOT_DOC).get();
  const json: unknown = published.get('json');
  if (typeof json !== 'string') {
    throw new HttpsError('not-found', 'Todavía no se ha publicado el registro.');
  }
  return JSON.parse(json);
}

export const getBusinessSnapshot = onCall({ region: 'europe-west1' }, async (request) => {
  const uid = request.auth?.uid ?? null;
  return { handler, snapshot: await runGetBusinessSnapshot(uid) };
});

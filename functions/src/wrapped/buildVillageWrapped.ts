import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { madridDayKey, type WrappedStatus } from '@cultuvilla/shared/models';
import { resolveWrappedRequest, type WrappedRequestProblem } from '@cultuvilla/shared/wrapped';
import { adminDoc, municipalityDoc, municipalityMemberDoc } from '@cultuvilla/shared/firebase/refs/admin';
import { buildAndStoreWrapped } from './storeWrapped';
import { defineCallable } from '../shared/define/defineCallable';

const db = getFirestore();

export interface BuildVillageWrappedResult {
  wrappedId: string;
  status: WrappedStatus;
}

/** What the admin sees when a request is refused — each names what to fix. */
const PROBLEM_MESSAGES: Record<WrappedRequestProblem, string> = {
  malformed: 'Argumentos inválidos.',
  'unknown-block': 'Una de esas fiestas ya no está en el pueblo.',
  'duplicate-block': 'Cada fiesta solo puede aparecer una vez.',
  'outside-year': 'Todas las fechas tienen que ser de ese año.',
  'ends-before-start': 'Un rango de fechas termina antes de empezar.',
  'range-in-future': 'El periodo no puede terminar después de hoy.',
  'range-misses-block': 'El periodo tiene que incluir las fechas de todas las fiestas.',
};

/**
 * Create or regenerate a village's Wrapped for one year, from the days a
 * village admin picked for each fiesta block and the range to count over.
 *
 * The only way a Wrapped is built: the profile no longer knows exact dates, so
 * there is nothing for a timer to build from. Admin-gated because rendering
 * costs up to a minute and a couple of hundred image fetches.
 */
export const buildVillageWrapped = defineCallable<unknown, Promise<BuildVillageWrappedResult>>(
  'buildVillageWrapped',
  { cors: true, memory: '1GiB', timeoutSeconds: 300 },
  async (request) => {
    const handler = 'buildVillageWrapped';
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

    const data = request.data;
    const municipalityId =
      data && typeof data === 'object' && 'municipalityId' in data ? data.municipalityId : null;
    if (typeof municipalityId !== 'string' || municipalityId.length === 0) {
      throw new HttpsError('invalid-argument', PROBLEM_MESSAGES.malformed);
    }

    const [memberSnap, appAdminSnap, muniSnap] = await Promise.all([
      municipalityMemberDoc(db, municipalityId, auth.uid).get(),
      adminDoc(db, auth.uid).get(),
      municipalityDoc(db, municipalityId).get(),
    ]);
    if (memberSnap.get('role') !== 'admin' && !appAdminSnap.exists) {
      throw new HttpsError('permission-denied', 'No autorizado.');
    }
    if (!muniSnap.exists) throw new HttpsError('not-found', 'Pueblo no encontrado.');

    const fiestas = muniSnap.data()?.community?.fiestas ?? [];
    const resolved = resolveWrappedRequest(data, fiestas, madridDayKey(new Date()));
    if (!resolved.ok) {
      throw new HttpsError(
        resolved.problem === 'malformed' ? 'invalid-argument' : 'failed-precondition',
        PROBLEM_MESSAGES[resolved.problem],
        { problem: resolved.problem },
      );
    }

    const built = await buildAndStoreWrapped(db, municipalityId, {
      year: resolved.request.year,
      blocks: resolved.blocks,
      range: resolved.range,
    });

    logger.info('village wrapped built on request', {
      handler,
      municipalityId,
      wrappedId: built.id,
      year: resolved.request.year,
      blockIds: resolved.blocks.map((b) => b.blockId),
      requestedBy: auth.uid,
    });
    return { wrappedId: built.id, status: built.data.status };
  },
);

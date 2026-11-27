import { HttpsError } from 'firebase-functions/v2/https';
import { hashUserId } from '../shared/observability';
import { OBSERVABILITY_USER_ID_SALT } from './secret';
import { defineCallable } from '../shared/define/defineCallable';

export const getUserIdHash = defineCallable(
  'getUserIdHash',
  { cors: true, secrets: [OBSERVABILITY_USER_ID_SALT] },
  (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    return { hash: hashUserId(request.auth.uid) };
  },
);

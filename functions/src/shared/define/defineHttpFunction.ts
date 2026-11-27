// The only place an HTTP function is defined: `onRequest` is restricted to this
// directory by functions/eslint.config.mjs.
import { onRequest } from 'firebase-functions/v2/https';
import type { HttpsFunction, HttpsOptions, Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';

import { DEFAULT_FUNCTIONS_REGION } from './region';
import { register } from './registry';

/** `name` is the export name in `index.ts` — and the Hosting rewrite's `function`. */
export function defineHttpFunction(
  name: string,
  options: HttpsOptions,
  handler: (request: Request, response: Response) => void | Promise<void>,
): HttpsFunction {
  return register(name, 'http', onRequest({ region: DEFAULT_FUNCTIONS_REGION, ...options }, handler));
}

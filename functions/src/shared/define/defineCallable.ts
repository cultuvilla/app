// The only place a callable is defined: `onCall` is restricted to this
// directory by functions/eslint.config.mjs.
import { onCall } from 'firebase-functions/v2/https';
import type { CallableFunction, CallableOptions, CallableRequest } from 'firebase-functions/v2/https';

import { DEFAULT_FUNCTIONS_REGION } from './region';
import { register } from './registry';

/** `name` is the export name in `index.ts` — the name clients call it by. */
export function defineCallable<Data = unknown, Return = unknown>(
  name: string,
  options: CallableOptions<Data>,
  handler: (request: CallableRequest<Data>) => Return,
): CallableFunction<Data, Return extends Promise<unknown> ? Return : Promise<Return>> {
  return register(name, 'callable', onCall<Data, Return>({ region: DEFAULT_FUNCTIONS_REGION, ...options }, handler));
}

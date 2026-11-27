import type { DecodedIdToken } from 'firebase-admin/auth';
import type functionsTestFactory from 'firebase-functions-test';
import type { CallableFunction, CallableRequest } from 'firebase-functions/v2/https';

type FunctionsTest = ReturnType<typeof functionsTestFactory>;

/**
 * What a test hands a wrapped callable: the request without the parts only the
 * HTTPS layer builds. The library types it as the full `CallableRequest`, so a
 * `{ data, auth: { uid } }` fails to type-check for want of a `rawRequest`, an
 * `acceptsStreaming` and a full `auth.token` the handlers never read. `data` is
 * `unknown` because the handlers parse it themselves, and the tests send
 * malformed input on purpose.
 */
export interface TestCallableRequest {
  data: unknown;
  auth?: { uid: string; token?: Partial<DecodedIdToken> } | undefined;
  /** Only what a handler reads off the HTTPS request: the caller's address. */
  rawRequest?: Partial<Pick<CallableRequest['rawRequest'], 'headers' | 'ip'>>;
}

/**
 * `ft.wrap` for a callable, keeping the handler's own response type so a test
 * that expects a different shape fails to compile instead of casting past it.
 */
export function wrapCallable<Data, Return>(
  ft: FunctionsTest,
  callable: CallableFunction<Data, Return>,
): (request: TestCallableRequest) => Return {
  const wrapped = ft.wrap(callable);
  return (request) => wrapped(request as CallableRequest) as Return;
}

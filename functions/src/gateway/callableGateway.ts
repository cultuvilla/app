// One Cloud Run service that serves every light, interactive callable, in the
// region Firestore lives in. Each callable on its own scales to zero and makes
// the next person wait a ~4 s cold start (docs/ops/cloud-run-baseline.md);
// one shared service stays warm under far less traffic, and can be kept warm
// for the price of one instance.
//
// Each route IS the callable's own `onCall` handler, so the callable protocol
// (ID-token check, CORS, `{ data }` / `{ result | error }`, HttpsError codes)
// is exactly what its standalone service runs. The standalone services stay
// deployed until `minSupported` passes the first release that calls the
// gateway (expand → migrate → contract).
import type { HttpsFunction, HttpsOptions, Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';

import { CALLABLE_GATEWAY_FUNCTION, CALLABLE_GATEWAY_REGION } from '@cultuvilla/shared/firebase/callableGateway';

import { defineHttpFunction } from '../shared/define/defineHttpFunction';
import { CALLABLE_GATEWAY_ROUTES } from './routes';

type HttpHandler = (req: Request, res: Response) => void | Promise<void>;

/** The most memory and time a routed callable may declare: what one gateway request can hold. */
export const CALLABLE_GATEWAY_MEMORY_MIB = 1024;
export const CALLABLE_GATEWAY_TIMEOUT_SECONDS = 60;

/**
 * Instances kept warm, in every env. Production stays cold by Álvaro's
 * decision (2026-11-27); warming it is this one value (~€11/month for 1).
 * A constant, not a functions param: a param with no stored value makes the
 * emulator and a non-interactive deploy stop and ask for one.
 */
export const CALLABLE_GATEWAY_MIN_INSTANCES = 0;

/**
 * `cpu: 1` is not a size choice: below 1 vCPU firebase-functions forces
 * request concurrency to 1, and one request per container is the opposite of
 * a gateway.
 */
export const CALLABLE_GATEWAY_OPTIONS = {
  region: CALLABLE_GATEWAY_REGION,
  cpu: 1,
  concurrency: 80,
  memory: '1GiB',
  timeoutSeconds: CALLABLE_GATEWAY_TIMEOUT_SECONDS,
  invoker: 'public',
  minInstances: CALLABLE_GATEWAY_MIN_INSTANCES,
  maxInstances: 10,
} as const satisfies HttpsOptions;

/**
 * The union of the secrets every routed callable binds. A secret is mounted
 * per service, so a routed handler reads an empty value unless the gateway
 * binds it too.
 */
export function gatewaySecretNames(routes: ReadonlyMap<string, HttpsFunction>): string[] {
  const names = new Set<string>();
  for (const callable of routes.values()) {
    for (const secret of callable.__endpoint.secretEnvironmentVariables ?? []) names.add(secret.key);
  }
  return [...names].sort();
}

/**
 * Serves `POST …/callableGateway/<name>` with the `<name>` route. The name is
 * the last path segment: the emulator and the `cloudfunctions.net` front end
 * strip the function's own segment, a direct `run.app` request does not.
 */
export const routeCallableRequest =
  (routes: ReadonlyMap<string, HttpHandler>): HttpHandler =>
  (req, res) => {
    const name = req.path.split('/').filter(Boolean).pop();
    const route = name ? routes.get(name) : undefined;
    if (!route) {
      res.status(404).json({ error: { status: 'NOT_FOUND', message: `Unknown callable: ${name ?? '(none)'}` } });
      return;
    }
    return route(req, res);
  };

export const callableGateway = defineHttpFunction(
  CALLABLE_GATEWAY_FUNCTION,
  { ...CALLABLE_GATEWAY_OPTIONS, secrets: gatewaySecretNames(CALLABLE_GATEWAY_ROUTES) },
  routeCallableRequest(CALLABLE_GATEWAY_ROUTES),
);

// Which callables a client reaches through the callable gateway — one Cloud Run
// service that serves every light, interactive callable — and which keep their
// own service. Read by the client transport (`services/callableTransport.ts`)
// to pick the URL, and by the functions codebase to build the gateway's
// routing table; a functions test holds the two to one answer.
// Why: docs/ops/cloud-run-baseline.md — half of what a person waits on is a
// cold start, and every handler runs an ocean away from Firestore.

/** Export name of the gateway function in `functions/src/index.ts`. */
export const CALLABLE_GATEWAY_FUNCTION = 'callableGateway';

/** Where Firestore lives (decided 2026-11-27, Álvaro): every routed call stays in Madrid. */
export const CALLABLE_GATEWAY_REGION = 'europe-southwest1';

/**
 * Callables that keep a service of their own: ones that would hurt their
 * neighbours in a shared container (more memory or time than one gateway
 * request holds), and fire-and-forget firehoses nobody waits on.
 */
export const CALLABLES_OUTSIDE_GATEWAY: ReadonlySet<string> = new Set([
  // Firehoses: a client loop on them must not queue a person's «Guardar» behind it.
  'logClientError',
  'recordEntityView',
  // Long cascades with their own memory and timeout.
  'deleteAccount',
  'buildVillageWrapped',
  'sendGroupMessage',
]);

/**
 * The projects whose clients call the gateway. Production joins on Álvaro's go
 * (plan cloud-run-gateways); until then its clients keep calling each
 * callable's own service, whatever the backend has deployed.
 */
export const CALLABLE_GATEWAY_PROJECTS: ReadonlySet<string> = new Set(['villa-events', 'cultuvilla-beta']);

/** Whether the gateway serves `callableName` — the functions side's routing table. */
export const isServedByCallableGateway = (callableName: string): boolean => !CALLABLES_OUTSIDE_GATEWAY.has(callableName);

/** Whether a client of `projectId` calls `callableName` through the gateway. */
export const routesThroughCallableGateway = (callableName: string, projectId: string): boolean =>
  CALLABLE_GATEWAY_PROJECTS.has(projectId) && isServedByCallableGateway(callableName);

/**
 * The gateway URL that serves `callableName`. `functionsEmulatorHost` is the
 * `host:port` of a Functions emulator, when the client is wired to one; the
 * emulator serves an HTTP function under `/<project>/<region>/<name>`.
 */
export function callableGatewayUrl(
  callableName: string,
  { projectId, functionsEmulatorHost }: { projectId: string; functionsEmulatorHost?: string | null },
): string {
  if (!projectId) throw new Error('callableGatewayUrl: projectId is required');
  const path = `${CALLABLE_GATEWAY_FUNCTION}/${encodeURIComponent(callableName)}`;
  return functionsEmulatorHost
    ? `http://${functionsEmulatorHost}/${projectId}/${CALLABLE_GATEWAY_REGION}/${path}`
    : `https://${CALLABLE_GATEWAY_REGION}-${projectId}.cloudfunctions.net/${path}`;
}

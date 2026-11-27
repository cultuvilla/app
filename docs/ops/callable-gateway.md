# Callable gateway

`callableGateway` is one Cloud Run service, in `europe-southwest1` next to
Firestore, that serves every light callable. Each route is the callable's own
`onCall` handler, so the protocol, auth and errors are the ones its standalone
service has. Why: [cloud-run-baseline.md](cloud-run-baseline.md). The design
comes from Órdago's gateway.

- **Which callables:** every callable except `CALLABLES_OUTSIDE_GATEWAY` in
  `packages/shared/src/firebase/callableGateway.ts`: the firehoses
  (`logClientError`, `recordEntityView`) and the long ones (`deleteAccount`,
  `buildVillageWrapped`, `sendGroupMessage`).
- **Which clients:** `getCallable` (`services/callableTransport.ts`) routes a
  client through it only when its Firebase project is in
  `CALLABLE_GATEWAY_PROJECTS`, which today means dev and beta. Production
  clients call each callable's own service until Álvaro says otherwise. That
  change is one line plus its test, and it reaches installed apps by OTA.
- **Warm instances:** `CALLABLE_GATEWAY_MIN_INSTANCES` (a functions param,
  default 0) sets them. Every env scales to zero today; prod stays cold by
  Álvaro's decision (2026-11-27). Warming it means adding
  `CALLABLE_GATEWAY_MIN_INSTANCES=1` to `functions/.env.cultuvilla-prod`, at
  about €11/month.
- **The standalone callables stay deployed** (expand → migrate → contract).
  They go only once `minSupported` has passed the first release whose
  production clients call the gateway, in a commit that carries
  `Breaking-Client:`.

## Is it deployed and serving?

```bash
CLOUDSDK_ACTIVE_CONFIG_NAME=cultuvilla gcloud run services describe callablegateway \
  --project=<villa-events|cultuvilla-beta> --region=europe-southwest1 \
  --format='value(status.url,spec.template.metadata.annotations."autoscaling.knative.dev/minScale")'

# An unknown route answers 404 with the callable protocol's NOT_FOUND: a cheap liveness check.
curl -s -X POST -H 'content-type: application/json' -d '{"data":{}}' \
  https://europe-southwest1-<project>.cloudfunctions.net/callableGateway/ping
```

**After the first deploy to a project, wait for one signed-in call to pass.**
For about a minute after Cloud Run creates the service, the `allUsers`
invoker binding has not propagated yet. A request without a token reaches the
function (the `ping` above answers), but one with a Firebase ID token gets an
HTML 401, "The access token could not be verified" (Órdago saw this on dev,
2026-10-27). Watch the service's request logs for a `200` on a routed path.

## Rolling back

A bad gateway revision is rolled back on its own:
`gcloud run services update-traffic callablegateway --region=europe-southwest1 --to-revisions=<previous>=100`.
To send a project's clients back to the standalone services, remove it from
`CALLABLE_GATEWAY_PROJECTS` and ship it by OTA. The standalone services are
still deployed.

## Adding a callable

For a light one there is nothing extra: define it with `defineCallable`, export it from
`functions/src/index.ts` and import it in `functions/src/gateway/routes.ts`.
`callableGatewayRoutes.test.ts` fails until it is either routed or listed in
`CALLABLES_OUTSIDE_GATEWAY`. It also fails if a routed callable declares more
memory or time than a gateway request holds (1 GiB, 60 s), because such a
callable belongs on the outside list. A routed callable's secrets must be
bound by the gateway too; the gateway binds the union automatically, and the
same test checks that.

## Latency per callable

Cloud Run's per-service metrics show one service, `callablegateway`. To see a
single callable, read the request logs by path:
`resource.labels.service_name="callablegateway"` with `httpRequest.requestUrl`
ending in `/<name>`.

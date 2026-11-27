# Cloud Run baseline — before the gateways

Read-only measurement taken 2026-11-27, before any handler moved onto a shared
service. It is the "before" for the gateway work (plan `cloud-run-gateways`) and
the numbers each production step is decided on. Re-run the recipes at the bottom
after each phase and add an "after" section; don't edit these numbers.

## What is deployed

Every handler is its own Cloud Run service (Cloud Functions v2).

| | dev `villa-events` | beta `cultuvilla-beta` | prod `cultuvilla-prod` |
|---|---|---|---|
| Services, `us-central1` | 96 | 96 | 63 |
| Services, `europe-west1` | 4 | 4 | 4 |
| Services, `us-east1` (Storage trigger) | 1 | 1 | 1 |
| Revisions kept, all regions | 16,871 | 1,719 | 1,106 |
| Services with `minScale` > 0 | 0 | 0 | 0 |
| Shape | 1 vCPU · 256 MiB · concurrency 80 (2 at 1 GiB) | same | same |

Prod has 33 fewer services than beta: the handlers added since the last
production release (studio pairing, group chat, cosas, cuotas, ranking, …).

Source today: 43 callables, 46 Firestore triggers (8 of them the
`cleanupRemoved*Images` family), 8 schedules, 3 HTTP functions (`readSite`,
`sitemap`, `staticMap`), 1 Storage trigger.

**Firestore lives in `europe-southwest1` (Madrid) in all three envs.** Almost
every function runs in `us-central1`, so each Firestore round trip a handler
makes crosses the Atlantic, and so does each user's call (from Spain to Iowa).

## Latency, production, 30 days (2026-10-28 → 2026-11-27)

Cloud Run request logs, 38,002 requests. "Cold" = the first request an
instance served.

| Kind | Requests | Cold | p50 | p95 | Cold p50 | Warm p50 |
|---|---|---|---|---|---|---|
| HTTP (98% `readSite`) | 26,648 | 4% | 0.06 s | 0.78 s | 3.27 s | 0.06 s |
| Schedules | 5,043 | 46% | 0.79 s | 4.39 s | 3.44 s | 0.71 s |
| Document/Storage triggers | 3,493 | 26% | 0.59 s | 3.39 s | 2.29 s | 0.01 s |
| Callables, all | 2,818 | 19% | 0.13 s | 4.40 s | 3.76 s | 0.01 s |
| **Callables a person waits on** | **364** | **54%** | **1.85 s** | **5.81 s** | **4.33 s** (p95 6.20 s) | **0.50 s** |

"A person waits on" excludes the two fire-and-forget firehoses,
`logClientError` (1,372) and `recordEntityView` (1,082).

The interactive callables, one by one:

| Callable | n | Cold | p50 | Cold p50 | Warm p50 |
|---|---|---|---|---|---|
| `sendAuthOtpCode` | 102 | 48% | 2.05 s | 4.75 s | 0.94 s |
| `verifyAuthOtpCode` | 71 | 56% | 2.10 s | 4.30 s | 0.01 s |
| `registerToEvent` | 63 | 67% | 4.30 s | 4.65 s | 1.66 s |
| `getUserIdHash` | 59 | 69% | 1.81 s | 1.96 s | 0.01 s |
| `reverseGeocode` | 36 | 17% | 0.10 s | 3.86 s | 0.09 s |
| `geocodeSearch` | 18 | 22% | 0.13 s | 3.69 s | 0.12 s |
| `startVillage`, `cancelRegistration`, `requestOrganizeVillage`, `respondToOrganizerRequest`, `approveOrganization` | 15 | 87% | — | ~5.0 s | — |

What it says:

- **Half of what a person waits on is a cold start.** With ~12 interactive calls
  a day spread over 43 services, nothing stays warm; the sign-in pair alone
  (`sendAuthOtpCode` → `verifyAuthOtpCode`) is cold about half the time, so a
  new user's first minute carries ~4–5 s twice.
- **Container startup**, `container/startup_latencies` across prod: p50 2.03 s,
  p95 3.47 s, before the first handler line. The rest of a cold request is the
  handler loading `functions/lib/index.js` and its first Firestore connection.
- **Warm is not fast either where Firestore is involved**: `registerToEvent`
  warm p50 1.66 s, `sendAuthOtpCode` 0.94 s — several transatlantic round trips
  each.

## Cost, 30 days

No billing export exists on these projects, so this is Cloud Monitoring's
`container/billable_instance_time`:

| | dev | beta | prod |
|---|---|---|---|
| Billable instance-seconds | 50,533 | 16,622 | 24,747 |
| Services that billed anything | 102 | 101 | 44 |
| Top consumers | the four hourly/15-min schedules ~16k | the same four ~15k | `readSite` 6.1k, the four schedules ~12.6k |

All three projects share one billing account, and their sum (~92k vCPU-s at
1 vCPU) is about half the monthly Cloud Run free tier (180k vCPU-s, 360k GiB-s).
**Functions CPU costs approximately nothing today.** The gateways are not a
money saving here; what they buy is latency (cold starts off the user's path),
and a deploy that moves ~6 services instead of ~100 (the CPU-quota and
revision-count side, `cloud-run-revision-cleanup`).

**Idle containers:** with request-based billing and `minScale` 0 everywhere,
idle instances bill nothing; there are none kept warm.

## What a warm gateway would cost

One service, 1 vCPU + 1 GiB, `minInstances: 1`: about €11/month in a Tier-1
region (Órdago's measured figure for `europe-west1`, same tier as
`europe-southwest1` and `us-central1`). Below 1 vCPU firebase-functions forces
concurrency 1, which defeats a gateway, so that is the floor.

## Reproduce

```bash
# requests (cold = first request of an instanceId)
CLOUDSDK_ACTIVE_CONFIG_NAME=cultuvilla gcloud logging read \
  'resource.type="cloud_run_revision" AND logName:"run.googleapis.com%2Frequests"' \
  --project=cultuvilla-prod --freshness=30d --limit=50000 \
  --format="csv[no-heading](resource.labels.service_name,httpRequest.requestMethod,httpRequest.status,httpRequest.latency,timestamp,labels.instanceId)"

# services and revisions per region
CLOUDSDK_ACTIVE_CONFIG_NAME=cultuvilla gcloud run services list --project=<project>
CLOUDSDK_ACTIVE_CONFIG_NAME=cultuvilla gcloud run revisions list --project=<project> --region=<region> --format="value(metadata.name)" | wc -l

# Firestore location
CLOUDSDK_ACTIVE_CONFIG_NAME=cultuvilla gcloud firestore databases describe --database='(default)' --project=<project> --format="value(locationId)"

# billable instance time / startup latency: monitoring.googleapis.com/v3/projects/<project>/timeSeries
#   metric.type="run.googleapis.com/container/billable_instance_time"  ALIGN_SUM, REDUCE_SUM by service_name
#   metric.type="run.googleapis.com/container/startup_latencies"       ALIGN_DELTA, REDUCE_PERCENTILE_50|95
```

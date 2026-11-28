# A few Cloud Run services instead of one per function

**Priority:** high — Álvaro called it the priority of the Órdago harvest (2026-11-27)
**Landed:** dev
**Gate:** blocked:beta gets callableGateway, and beta clients getCallable, only with the next develop → beta release
**Next:** after that release, confirm 200s on routed paths in cultuvilla-beta's `callablegateway` request logs (europe-southwest1), witness `docs/qa/pending/callable-gateway.md`, then build phase 3 (the event gateway)

State 2026-11-27: phases 0–2 merged — #756 (baseline, `docs/ops/cloud-run-baseline.md`), #760 and #764 (all 101 functions through `functions/src/shared/define`, manifest deploy-equivalent), #770 (`callableGateway` in europe-southwest1, 38 routed callables, min 0; `getCallable` routes only villa-events and cultuvilla-beta; standalone callables kept). Live on dev (deploy 46004855577): unknown route → 404, unauthenticated call → 401; a signed-in call is proven in the emulator suite only. Notes for later phases:

- `CALLABLE_GATEWAY_MIN_INSTANCES` is a constant (0), not a functions param (a param with no stored value made the emulator load nothing). Warming prod means making it depend on the project.
- The next promotion to prod creates `callableGateway` there (min 0, no prod client routed). Drop the prod env-parity exception for `europe-southwest1/gcf-artifacts` at that first prod deploy.

**Decided 2026-11-27 (Álvaro):** port Órdago's move from one Cloud Functions service per
handler to a few shared Cloud Run services. Dev and beta go ahead; each prod step needs
his go with the numbers in front of him (`## Approval`).

**Decided 2026-11-27 (Álvaro):** the gateways run in `europe-southwest1` (Madrid), next to Firestore, in every env. Prod stays cold (min 0) for now to save cost; warming it (~€11/month, Órdago's measured figure) is a later call, one config value.

**Goal:** pay for work, not for the number of handlers. Today every handler is its own
Cloud Run service: 43 callables, 40 document triggers, 8 schedules, 3 HTTP and 1
Storage trigger (~95 functions, counted by h1 on 2026-11-27). Each has its own cold starts and its own idle containers, and every
deploy pushes ~95 revisions through the project's CPU quota (what deadlocked Órdago's
prod deploys, `docs/incidents/2026-11-01-prod-cpu-allocation-limit-dropped.md` there).

## The source (`~/githubs/ordago-app/ordago-apps`)

Read these before designing anything; they carry the traps already paid for:

- `docs/plans/ongoing/backend-cost-and-service-shape.md` — the target shape and why
  (callables → `api`, document triggers → `events`, schedules → `jobs`, images → own service).
- `docs/plans/ongoing/functions-cold-start-reduction.md` and `docs/ops/callable-gateway.md`
  — `callableGateway`: one `onRequest` service whose routes call each callable's own
  handler; clients go through `getCallable` (`packages/shared/src/services/callableTransport.ts`).
  Warm (min 1) in prod. Note the ~1 minute `allUsers` invoker delay after first deploy.
- `docs/ops/event-gateway.md` — many Eventarc triggers on one service, one path each, a
  manifest with `connected` (runs both ways) → `served` (gateway only), and
  `scripts/event-gateway-triggers.js connect | status | drain`. Batches of ~8 on a project
  near its CPU limit; a new trigger misses events for ~90 s.
- `docs/ops/job-gateway.md` — schedules on one service with their own Scheduler jobs.
- `functions/src/shared/define/` — the `defineCallable` / `defineDocumentTrigger` /
  `defineSchedule` seam everything goes through, which is what made routing possible.
- `docs/decisions/functions-v2-deploy-gotchas.md`, `verify-running-cf-container-image.md`.

## What is different here

- **No define seam yet.** Handlers call `onCall` / `onDocument*` / `onSchedule` directly,
  so step one is introducing it, with nothing observable changing.
- **The clients call callables from 24 shared service files** with `httpsCallable`. They
  need one transport (`getCallable`) before any routing.
- **Regions are mixed.** Most functions declare `us-central1`, a few `europe-west1`
  (`getBusinessSnapshot`), Storage triggers `us-east1`. The gateway's region, and whether
  to consolidate, is decided in phase 0 from where Firestore lives and the latency
  numbers, not carried over.
- **OTA reaches installed apps** within days, so the old-binary window is shorter than
  Órdago's; still expand → migrate → contract: standalone callables stay deployed until
  `minSupported` passes the first version calling the gateway (`Breaking-Client:` on the
  contract commit only).

## Phases

0. **Measure** on prod (read-only): services and revisions per env, callable p50/p95 and
   cold-start share, Functions CPU on the bill, idle containers. This is the baseline and
   the case for each prod step.
1. **Define seam** for every handler kind, no behaviour change (pre-approved refactor).
2. **Callable gateway + `getCallable`** transport; gateway on dev → beta; prod cold
   (min 0); its prod deploy still needs Álvaro's go.
3. **Event gateway** with the connected → served → drain flow, light and heavy profiles.
4. **Job gateway** for the frequent schedules.
5. **Contract**: drop standalone callables once `minSupported` allows; retire this plan.

Each phase lands on its own and is useful alone. `verify-deployed-functions.md` must know
the gateway services; `cloud-run-revision-cleanup.md` gets simpler as services shrink.

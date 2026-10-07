# Product analytics — behavioral dashboard + ops monitoring

**Priority:** high
**Landed:** prod
**Gate:** none
**Next:** after 1.7.1's first full day (check the `events_20261008` table on 2026-10-09), look for `ANDROID`/`IOS` rows; if there are none, check the stream boxes on GA4 Admin → BigQuery links; in parallel, apply Phase 3 to prod (`node scripts/apply-monitoring.mjs --project=cultuvilla-prod --confirm`, needs the user's go)

Decided 2026-10-06 (user): Phase 2 (Firestore→BigQuery extension + Looker Studio) and Phase 3 (Cloud Monitoring dashboard + alert policies) are approved, including their running cost. BigQuery export stays **prod-only** (no beta).

Builds directly on the shipped
[observability foundation](../../decisions/observability-foundation.md).

## Done

Phase 1 full-engagement instrumentation merged to `develop` (PR #150, merge `295a6d9e`, 2026-07-19). **Google Analytics enabled on all three Firebase projects (dev/beta/prod) on 2026-07-19** — until then no GA4 property existed and no web analytics data was being collected anywhere (the app config carries no `measurementId`; the SDK relies on the runtime dynamic-config fetch, which only resolves once GA is enabled server-side). GA4→BigQuery export linked on `cultuvilla-prod` 2026-07-19 — EU (`eu-west`), Daily + Streaming. **Phase 0 verified 2026-09-11:** dataset `cultuvilla-prod.analytics_546204987` holds ~100 daily tables from `events_20260719` onward, with events every day (13–54/day in the week to 2026-09-10).

## Next steps

0. **Before prod, on beta:** the `develop → beta` promotion builds Cultuvilla Beta (Android) and TestFlight with native analytics, reporting to `cultuvilla-beta`'s GA4 property. Open a beta build and watch GA4 Realtime/DebugView there, and confirm in GA4 Admin → BigQuery links on prod that the **Android and iOS streams** are selected for export — the iOS app was registered on 2026-10-02, after the export link was made, and a link only exports the streams ticked on it.
1. **Verify native data once the store build ships.** In `cultuvilla-prod.analytics_546204987`, filter `platform IN ('ANDROID','IOS')` and check that `user_pseudo_id` is non-null and that `first_open` is not equal to every session start. Native event names use underscores (`content_detail_viewed`), web used dots — join with `REPLACE(event_name, '.', '_')`.
2. Confirm the Phase 1 events in GA4 DebugView on one Android and one iOS build (this replaces the never-run web smoke).
3. Phase 2, on native data.
4. Phase 3 — built (alerts-as-code, `scripts/apply-monitoring.mjs` + `scripts/lib/monitoring.mjs`), applied to dev and beta 2026-10-06. Left: the prod apply (user's go), then watch a week of prod alerts and retune `THRESHOLDS` if they are noisy.

## Open finding: no native rows in prod BigQuery yet

Checked 2026-10-08. Since 2026-09-20, `cultuvilla-prod.analytics_546204987.events_*`
holds only `platform = WEB` rows, all from stream `15284775353`. That alone is
not evidence of a fault: **native analytics (`99b40e65`, 2026-10-02) first
shipped in v1.7.1**, not 1.6.0, and 1.7.1 reached the stores on 2026-10-07/08.
The setup looks right: `analyticsDetails` maps the prod Android app to stream
`15459386333` and the iOS app to `15939689974`, both on property `546204987`.

One signal is worrying. A 1.7.1 Android client logged to prod at 17:15 UTC on
2026-10-07, yet `events_intraday_20261007` holds 3 web rows, last written at
06:21. Streaming export is on, so an exported Android stream should have shown
up. Two causes fit: that stream is not ticked on the BigQuery link, or the
device sent nothing. The GA4 Admin API needs an `analytics.readonly` scope that
no local credential carries, so the link is a console check.

Ruled out in code: `configure.ts` builds the native backend and grants consent
at boot (`setAnalyticsCollectionEnabled(true)`). The prod `google-services.json`
is for `cultuvilla-prod`. iOS's `IS_ANALYTICS_ENABLED=false` in the plist is a
legacy key the current SDK ignores.

## Resolved finding: the web export carried no user identity

Since 2026-08-01, 100% of exported events (all `platform = WEB`) had a null `user_pseudo_id`, and `first_visit` = `page_view` = 1,967 — the signature of GA4 running with `analytics_storage` denied, so no returning visitor could be recognised. **This is no longer worth debugging** (re-checked 2026-10-06):

- That data came from the Expo web export, which the app-only transition deleted on dev (phase 4). The read site (`functions/src/web/`) carries no GA4 tag at all, so prod web analytics stops entirely with the next promotion.
- Native analytics grants consent at boot (`apps/mobile/lib/observability/configure.ts` — `observability.setConsent({ analytics: true })`, covered by the Terms/Privacy Policy accepted at registration) and forwards to `@react-native-firebase/analytics` via `setAnalyticsCollectionEnabled`. Native events should carry a pseudo id; step 1 above proves it.
- The `measurementId` question is moot on native: the config comes from the per-env `google-services.json` / `GoogleService-Info.plist`.

**Consequence for the read site:** with no web analytics, share-link visits are only visible in `readSite` request logs. The web sign-up question that once needed that number is decided (no web sign-up, 2026-10-06), but share-link reach is still the top of the install funnel, so a log-based metric on `readSite` belongs in Phase 3 here.

## Handoff

Read prod BigQuery as `cultuvilla.app@gmail.com` (the default gcloud account; it can `bq query --project_id=cultuvilla-prod`). `matabuena.unida@gmail.com` lost prod access by 2026-08-21, and without access `bq ls` returns an **empty listing, not an error** — never read an empty listing as "no datasets". **Phase 2's Firestore→BigQuery export must use the same region (`eu-west`)** or cross-location joins break. Dev's GA property is under a different Google account (not visible to the prod/beta account).

## Rollout status

| Step | Dev (`villa-events`) | Beta (`cultuvilla-beta`) | Prod (`cultuvilla-prod`) |
|---|---|---|---|
| Prereq — Google Analytics enabled on Firebase project | ✅ | ✅ | ✅ |
| Phase 1 — engagement instrumentation (code) | ✅ | ✅ | ✅ |
| Phase 1 — native DebugView smoke (Android + iOS) | ⬜ | — | — |
| Phase 0 — GA4→BigQuery export enabled | ⏳ | ⬜ | ⏳ daily tables since 2026-07-19; native rows awaited from 1.7.1 — see *Open finding* |
| Phase 2 — Firestore→BigQuery export | ⬜ | ⬜ | ⬜ |
| Phase 2 — Looker Studio dashboard | ⬜ | ⬜ | ⬜ |
| Phase 3 — log-based metrics + Cloud Monitoring dashboard | ✅ 2026-10-06 | ✅ 2026-10-06 | ⬜ (`apply-monitoring.mjs --project=cultuvilla-prod --confirm`) |
| Phase 3 — alert policies | ✅ created **disabled** (dev is a playground) | ✅ enabled → cultuvilla.app@gmail.com | ⬜ |

Legend: ⬜ pending · ⏳ in progress · ✅ done · ⚠️ blocked (note inline) · — n/a

Phase 1 code rides `develop → beta → prod` via the normal promotion flow, so the beta/prod cells flip as releases promote — no separate work.

## Problem

The observability foundation (v0.8.0) gave us three working pillars on the web
build: consent-gated Firebase Analytics, web crash/error capture bridged to Cloud
Error Reporting, and a structured server logger. That is enough to answer **"is
prod healthy?"** and **"are the core funnels converting?"** — both via
Google's built-in consoles, no dashboard of our own.

It is **not** enough to answer **"how is production behaving?"** GA4's UI
(sampling, 24–48h latency, no joins to our domain data, cardinality caps on
high-fan-out dimensions like `villageId`) can never become a real behavioral
dashboard on its own. Phase 1 added the missing engagement events; the remaining
phases stand up the warehouse and dashboard that consume them.

We want the **long-term-correct foundation from the start**, not a throwaway.
Developer time is not the constraint; getting the data architecture right is.

## The one fact that drives the sequencing

**GA4 → BigQuery export has no backfill.** It captures events only from the day
it is enabled, forward — there is no way to recover history from before. So the
cheapest correct move is to enable the export *early*, even before any dashboard
exists, so raw history accumulates while the dashboard work proceeds. This is why
Phase 0 is "flip a switch now," ahead of the dashboard.

## Decisions already settled

1. **Destination is BigQuery, not the GA4 UI.** GA4's console/Explorations become
   just one cheap view among several; the raw-event warehouse in BigQuery is the
   backbone everything else reads from. This **reverses one line** on the
   observability-foundation YAGNI list ("a custom analytics→BigQuery pipeline") —
   a deliberate graduation past launch scope. **Fold this into
   `docs/decisions/observability-foundation.md` when Phase 2 ships.**
2. **Full-engagement instrumentation** (Phase 1, shipped) — not just conversion
   gaps. One generic `content.detail.viewed` (+`entityKind`/`entityId`);
   `search.query.submitted`/`search.result.selected` logging shape not query text;
   `org.join.*` + `org.invite.shared`. Notifications deferred (surface is changing).
3. **No parallel taxonomy doc.** `OBSERVABILITY_EVENTS` stays the single source of
   truth (typed, review-gated by the `observability-conventions` skill). Any
   human-readable event dictionary is a **generated, derived artifact** — never
   hand-maintained — so it cannot diverge from what actually fires. (Deferred until
   the const carries per-event metadata; Phase 1 kept it flat name→string.)
4. **Ops monitoring is a parallel track, not a competitor.** "Is prod healthy"
   (error rates, callable latency, alerting) and "how do users behave" are
   orthogonal; a mature app wants both.
5. **EU data location.** The BigQuery analytics dataset is created in the `EU`
   multi-region (Spanish user base / data-residency). This is irreversible per
   dataset, so it is fixed at link time.

## Approach — four phases

### Phase 0 — Enable GA4 → BigQuery export on prod ⏳ (do first)

- Enable the native GA4 → BigQuery export on `cultuvilla-prod` via the GA4 Admin
  BigQuery Links flow (console-only; no CLI). Data location **EU**. Enable **Daily**
  (always); **Streaming** optional (near-real-time, marginal cost at this volume).
- No code, no dashboard yet — the point is to **start banking raw history** before
  the no-backfill window costs us data.
- Optionally enable on dev (`villa-events`) too, purely to validate the plumbing
  end-to-end fast (dev has test traffic + the DebugView smoke).
- **Done when:** an `analytics_<propertyId>` dataset exists in `cultuvilla-prod`
  BigQuery and is accumulating `events_intraday_`/`events_` tables.
- **Cost:** BigQuery bills on storage (~$0.02/GB/mo) and query bytes scanned
  (~$5/TB, first 1 TB/mo free). At village-app volume this sits at/near the free
  tier.

### Phase 1 — Full-engagement instrumentation ✅ (shipped, PR #150)

Merged. Details in the code (`OBSERVABILITY_EVENTS`, the entity-detail/search/org
call sites) and the `observability-conventions` skill. **Web-first deferral chosen**
for native analytics; the generated event dictionary was deferred (kept the const
flat for a minimal slice). Remaining tail: the manual DebugView smoke to confirm
events fire on the web build.

### Phase 2 — The behavioral dashboard

- **Firestore → BigQuery export** via the Firebase extension, so event rows can be
  **joined to real domain data** (village size, org type, member role). This join
  is the thing GA4's UI can never do and the whole reason BigQuery is the
  destination.
- **Dashboard on SQL** — Looker Studio to start (free, Google-native), reading
  from BigQuery: engagement, content performance, discovery paths, funnel
  drop-off, cohorts/retention broken down by village/org/role.

### Phase 3 — Ops / health track (parallel to 1–2)

- **Log-based metrics** on key callables (error rate, p95 latency, success ratio)
  derived from the structured Cloud Logging the server logger already emits.
- **A `readSite` visits metric** (page kind, entity kind, phone vs. desktop UA) —
  the only web measurement left once the Expo web export is gone: how many
  people reach a shared link, against native `first_open`.
- **Cloud Monitoring dashboard** for prod health.
- **Alert policies** (email/Slack) on error-rate spikes and latency regressions —
  graduating the foundation's "alerting is manual for now" into alerts-as-code.

**As built (2026-10-06).** One idempotent script, `scripts/apply-monitoring.mjs`
(dry run by default, `--confirm` writes), applies the spec in
`scripts/lib/monitoring.mjs` to a project: three log-based counters
(`server_errors` by `handler`, `client_errors` by platform/surface/error code/app
version, `read_site_visits` by page/entity kind/device/platform/status), the
`cultuvilla-ops-health` dashboard, three alert policies (server-error spike,
client-error spike, key-callable p95 latency) and the email channel. Latency and
the 5xx ratio come from Cloud Run's built-in `request_latencies` /
`request_count`, not a log-based distribution. Dashboards and policies carry a
`spec` hash label, so a re-run updates only what changed and a console edit is
overwritten. `readSite` now logs one `readSite visit` line per response (enums
and a status only — no path, slug or user agent). **Caveat:** Hosting caches
200s for an hour at the edge, so the visits metric counts origin renders — a
lower bound. Exact counts would need Hosting's Cloud Logging integration.

## Explicitly still YAGNI

Deferred until data volume or a concrete need justifies them: dbt / warehouse
modeling, session replay, distributed tracing, a bespoke dashboard *service*
(Looker Studio suffices), server-side OpenTelemetry.

## Open questions

- ~~Beta export~~ — decided 2026-10-06: prod-only.
- Streaming vs daily-only export (leaning daily + streaming; revisit if cost shows).
- When to enrich `OBSERVABILITY_EVENTS` with per-event metadata + generate the
  dictionary (Phase 2, once the dashboard reveals which fields matter).

## Success criteria

- Raw GA4 events landing in BigQuery on prod, accumulating history (Phase 0).
- A Looker Studio dashboard answering "how is production behaving" with at least:
  content performance, a multi-step funnel with drop-off, and one domain-joined
  breakdown (e.g. conversion by village) that GA4's UI cannot produce.
- An ops dashboard + at least one live alert policy on prod error rate.
- `OBSERVABILITY_EVENTS` remains the single source of truth; any event dictionary
  is generated and cannot diverge.

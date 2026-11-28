# Observability foundation

## Context

The app had no client-side observability — no crash/error reporting, no product
analytics, no client logger — while Cloud Functions already had structured
Cloud Logging. We wanted a coherent, long-term foundation across all three
pillars (crash/error, analytics, health), built **web-first** but designed so the
native apps plug in unchanged when they ship. The sibling `ordago-apps` repo
provided proven patterns; we adopted its compliance posture and seam discipline
and deliberately skipped its heavier machinery.

The code is the source of truth for *what* exists (see
`packages/shared/src/services/observability/`, `apps/mobile/lib/observability/`,
`functions/src/observability/`, `functions/src/shared/observability.ts`, and the
`observability-conventions` skill). This record captures only the decisions and
why.

## Decision

- **Ports & adapters.** A platform-free *port* in
  `packages/shared/src/services/observability/observabilityService.ts` is the only
  thing screens call (`trackEvent` / `captureError` / `logger.*` /
  `setUserContext` / `setConsent` / `startOperation`). It imports no `firebase/*`
  or platform API. Concrete backends are *adapters* injected at app bootstrap
  (`configureObservability`) from `apps/mobile/lib/observability/`. This keeps the
  port unit-testable via a no-op default and makes the web→native transition a
  one-adapter change, honouring the service-layer-ownership rule.

- **Firebase Analytics for product events** (denied-by-default Consent Mode v2),
  chosen because its event API is identical on web and native — the cleanest
  transition — and BigQuery export reaches BI later for free. **No Sentry**; the
  native crash tool is Crashlytics behind the same seam (below).

- **Web crash capture bridges to Cloud Logging.** Crashlytics is native-only, so
  on web a global handler + error boundary route through the `logClientError`
  callable into structured Cloud Logging → Cloud Error Reporting, *and* emit an
  `app_exception` analytics event ("both sinks"). Native later swaps
  `captureError` to Crashlytics; the analytics half is unchanged.

- **On native, Crashlytics is a third sink, added beside Cloud Logging rather
  than swapped in** (2026-11-28). The SDK records native crashes, ANRs and OOMs
  on its own, which no JS handler can see; `captureError` also files each
  handled error there as a non-fatal with its context as the log line before
  it, `observability.logger.*` become breadcrumbs, and the user id is the same
  hash Analytics gets. Cloud Logging stays because only it joins a client error
  to the server's logs, and only it scrubs PII from messages and stacks — so a
  `captureError` call site must not put personal data in an error *message*.
  Crashlytics is diagnosis, legitimate interest like Cloud Logging, so it does
  not wait for the analytics consent; debug builds collect nothing.
  `apps/mobile/firebase.json` turns off the SDK's own report of an uncaught JS
  error, which would duplicate `captureError`'s and log an `app_exception`
  analytics event outside the consent gate. Known limit: Hermes JS stacks
  arrive minified (no source-map upload); native stacks symbolicate on Android
  through the Gradle plugin's mapping upload. iOS dSYMs are not uploaded yet.

- **Compliance is structural, not per-call.** The server-side `log.*` chokepoint
  (`functions/src/shared/observability.ts`) auto-hashes `user.id` (HMAC-SHA256 +
  `OBSERVABILITY_USER_ID_SALT` from Secret Manager) and PII-scrubs
  `error.message`/`error.stack` via `transformAttrs`. **Never hash or scrub at the
  call site.** The raw uid never reaches a telemetry store: `logClientError`
  stamps the server-authenticated uid, and the client sets the *hashed* uid as the
  Analytics `user_id` via a `getUserIdHash` callable (cached in `AsyncStorage`).
  Right-to-erasure collapses to deleting the user doc + rotating the salt.

- **A single client-side PII allowlist.** `filterContext` (`ALLOWED_CONTEXT_KEYS`)
  drops any key outside `uid, municipalityId, villageId, role, appVersion,
  platform, route, operation_id` before a payload leaves the port.

- **Consent split.** Analytics is consent-gated: denied by default, and granted
  only for a signed-in account that answered yes to «¿Nos ayudas a mejorar
  Cultuvilla?» (never called «anónimas»: the analytics id is a hashed uid, so the
  data is pseudonymous), stored at `users/{uid}/privacySettings/account`,
  changeable under Ajustes → Estadísticas de uso. Guests are never tracked.
  The question is a full-screen page, not part of sign-up (decided 2026-11-20,
  Álvaro: onboarding keeps only the terms checkbox). It asks an onboarded account with no
  answer the moment the app opens, full screen, and nothing gets past it but an
  answer: Android back does nothing (decided 2026-11-20, Álvaro, replacing a
  first-real-action-or-third-day rule the same day, so every user answers right
  away). Never during onboarding. «No, gracias» and «Sí, claro» are the same
  size side by side (no outlined, yes filled) and each closes it. The answer is
  in Firestore; an answer that fails to store asks again on the next launch.
  The drawing
  is built from Views, not SVG: the app ships no react-native-svg, and a native
  module would have waited for a store binary. Error/log *diagnosis* flows regardless, on
  legitimate interest — justified because the app has guest browsing and 14+
  minors. (Decided 2026-11-20, Álvaro, replacing an interim where analytics ran
  for everyone from boot on the strength of the Terms acceptance: the Privacy
  Policy names usage statistics as consent-based and withdrawable.)

- **Taxonomy as a review gate.** Event names live in `OBSERVABILITY_EVENTS`
  (`<domain>.<action>.<outcome>`); the `observability-conventions` skill is the
  naming/PII/debugging gate. Starter funnels: onboarding, village join, event
  sign-up, org creation.

## Consequences

- **Deliberately not built (YAGNI):** server-side OpenTelemetry, a custom
  analytics→BigQuery pipeline, dbt marts, a dashboard service, Sentry,
  distributed tracing, session replay, alerts-as-code.
- **Per-env secret required before deploy:** `OBSERVABILITY_USER_ID_SALT` must
  exist in a project before the observability functions deploy there (created on
  dev; create per-project before beta/prod promotions — see the
  `gcloud-cultuvilla` skill).
- **Alerting is manual for now:** enable Cloud Error Reporting + an email
  notification per env; alerts-as-code is deferred until real traffic.
- **Native transition** added a Crashlytics backend to the `captureError`
  adapter and switched Analytics to the native SDK — no port or screen changes.

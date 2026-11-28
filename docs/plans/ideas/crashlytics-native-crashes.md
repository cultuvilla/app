# Capture native crashes with Crashlytics behind captureError

**Priority:** medium

**Next:** decide: add the native module (store binary, Play data-safety and App Store privacy updates)

**Needs Álvaro's yes** — third Órdago harvest run, 2026-11-27. A native module needs a store binary, and both stores' privacy declarations change. No running cost.

**Goal:** `lib/observability/globalHandlers.ts` catches JS errors only; native crashes, ANRs and OOMs are invisible. `docs/decisions/observability-foundation.md` already chose Crashlytics behind the same seam.

Source: ordago-apps `docs/decisions/crashlytics-only-crash-reporting.md`, `apps/ordago-app/logging/crashlytics.js`.

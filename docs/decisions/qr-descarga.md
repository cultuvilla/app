# Print-forever QR + `/descarga` smart landing

## Context

Wanted a QR code that can be printed once and never reprinted, surviving the
move from web-only to published store apps (both are live since 2026-09). It needed a stable target and a landing page that can evolve
without invalidating printed copies.

## Decision

- **The QR encodes a plain `https://cultuvilla.es/descarga` URL** — a real
  Expo Router web route. The printed bytes never change; behavior
  changes only server/app-side.
- **`/descarga` is deliberately *not* a Universal/App Link** — no
  `web/well-known/**` entries reference it. Its job is to reach
  the store, so it must open in the browser even where the app is installed.
- **Phones go straight to their store, with no page in between.** On web,
  `apps/mobile/app/descarga.tsx` detects the device with the shared
  `resolveStorePlatform` (the same detection the smart app banner uses,
  including the iPadOS-reports-a-Mac case) and `location.replace`s to
  `APP_STORES[platform]`. A picker page cost a QR scanner an extra tap for a
  choice their phone already made. `replace`, not `assign`, so Back from the
  store does not bounce into the redirect again.
- **Desktop, unrecognised devices, and a platform with no listing get the
  picker** (both store buttons + "Seguir en la web"). There is nothing to
  install on a desktop, and redirecting a phone to an empty URL would be a
  dead end. On native, it forwards to the feed (the user is already in the app).
- **Detection is client-side, in the route, deliberately.** A Cloud Function
  returning a UA-based 302 would save the ~1–2 s bundle load, but would put a
  second copy of the store URLs in `functions/` and add a deployed function for
  it. Revisit only if that second actually matters for scan-to-store.
- **QR asset generation is a standalone script** (`scripts/generate-qr.mjs`),
  not part of the app build: PNG + SVG, error-correction level **H** (required,
  non-negotiable — the center-composited Cultuvilla logo eats into the modules
  and needs the 30% redundancy budget), logo squared/trimmed for even fit.

## What this binds

- Don't make `/descarga` a Universal/App Link: a visitor with the app installed
  would be pulled into the app instead of the store page they scanned for.
- The store URLs come only from `APP_STORES` in `packages/shared/src/config/appStores.ts`;
  never hard-code one into the route or the QR.

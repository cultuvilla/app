# Type the organization join redirect

**Priority:** medium

## Goal

Make the organization invite redirect pass Expo Router's typed-route check.

## Evidence

On 2026-09-29, `pnpm check` passed the reference guards and shared, functions and
i18n typechecks, then failed in the mobile typecheck at
`apps/mobile/app/[pueblo]/entidad/[entidad]/unirse.tsx:11` with TS2322.
Appending `?intent=join` to `entityRefHref(...)` produces a union including
`..?intent=join`, which is not assignable to Redirect's `href` type.
The failure surfaced while changing agent instructions and skill discovery;
no application code was changed in that cleanup.

## Approach

Check the route helper's return type and use a typed pathname/params redirect
that retains the join intent. Add coverage at the navigation boundary and run
`pnpm app:typecheck`, then the full `pnpm check` gate.

## Open questions

Determine whether the correction belongs in the shared route helper or this
redirect after inspecting the helper's other consumers.

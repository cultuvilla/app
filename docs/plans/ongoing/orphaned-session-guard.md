# Sign out a device whose account was deleted or disabled elsewhere

**Priority:** medium

**Landed:** none
**Gate:** none
**Next:** detect a deleted or disabled account on launch and sign the device out with a short notice; draft the copy and send it to the leader for Álvaro before landing

Decided 2026-11-28 (Álvaro, `go` to all picks): sign out automatically, with a short notice whose wording Álvaro approves before it ships.


**Needs Álvaro's yes** — third Órdago harvest run, 2026-11-27. It signs a device out and shows a notice.

**Goal:** nothing in `apps/mobile/lib/auth/` handles `auth/user-not-found`, `auth/user-disabled` or `auth/user-token-expired`; the native SDK keeps the restored user, so every read fails while the app looks signed in. Fence with `ongoing/auth-session-state-machine.md`.

Source: ordago-apps `packages/shared/src/services/orphanedSessionService.ts`, `apps/ordago-app/hooks/useOrphanedSessionGuard.ts`, 87bde1203, 56789a1b3.

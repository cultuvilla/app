# Sign out a device whose account was deleted or disabled elsewhere

**Priority:** medium

**Next:** decide the copy and whether to sign out automatically

**Needs Álvaro's yes** — third Órdago harvest run, 2026-11-27. It signs a device out and shows a notice.

**Goal:** nothing in `apps/mobile/lib/auth/` handles `auth/user-not-found`, `auth/user-disabled` or `auth/user-token-expired`; the native SDK keeps the restored user, so every read fails while the app looks signed in. Fence with `ongoing/auth-session-state-machine.md`.

Source: ordago-apps `packages/shared/src/services/orphanedSessionService.ts`, `apps/ordago-app/hooks/useOrphanedSessionGuard.ts`, 87bde1203, 56789a1b3.

# The hard update wall replaces the app tree

**Priority:** high
**Landed:** none
**Gate:** none
**Next:** being built by worker h26 in batch 2026-11-27-harvest

**Pre-approved** under AGENTS.md § Approval — third Órdago harvest run, 2026-11-27 (`_workspace/docs/plans/ideas/harvest-across-repos.md`); Álvaro: "go to everything, keep going". Verify the gap before building. Only the unmount half is pre-approved; remembering the last wall before the network is a separate needs-yes idea.

**Goal:** `apps/mobile/components/AppVersionGate.tsx` always renders `{children}` and puts the blocker in a modal on top, so the router, deep links, notification taps and listeners keep running on a walled binary — Órdago's 2026-10-02 incident (walled clients crashed natively under the overlay). When the wall is hard, render only the blocker; the screen looks the same.

Source: ordago-apps `docs/decisions/hard-wall-replaces-app-tree.md`, `apps/ordago-app/components/updates/` (AppUpdateGate, AppTreeIsGated test), e29141a99.

## Done when

A test proves no route or listener mounts under a hard wall, and a decision record states the rule.

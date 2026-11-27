# The hard update wall replaces the app tree, it is not laid over it

**Date:** 2026-11-27
**Category:** decision

## Context

When the running binary is below `config/appVersion.<platform>.minSupported`,
`resolveVersionGate` answers `block` and the user must update before using the
app. The wall exists because a walled binary can *malfunction* against the new
backend ([breaking-change-and-hard-wall.md](breaking-change-and-hard-wall.md)),
so the guarantee that matters is not "the user cannot tap the app" but "**none
of the walled binary's code runs**": no screen, no domain listener, no deep
link, no notification tap.

Until now `AppVersionGate` always rendered `{children}` and showed the blocker
as a native `<Modal>` on top. The router, `useDeepLinkRouter`, auth's link
listener, `PushProvider`'s notification-tap listener and `VillageSync` all kept
running underneath. Órdago lived the consequence on 2026-10-02: walled 0.40.0
clients crash-looped natively inside a screen a notification tap had mounted
under the overlay.

## Decision

`AppVersionGate` (in [apps/mobile/app/_layout.tsx](../../apps/mobile/app/_layout.tsx),
below `I18nProvider`, `IntroHost`, the gesture and safe-area roots and the
error boundary, above every other provider) renders, per decision:

- **block** → only the blocker (`AppUpdateModal` with no dismiss, on a plain
  `bg-surface` screen), **instead of** its children. Nothing navigable is
  mounted, so a deep link or a notification tap has nothing to reach. A wall
  raised mid-session unmounts the tree, whose effect cleanups detach the
  listeners. It also calls `markAppReady`, since no route will.
- **loading / ok / nudge** → the children, with the soft nudge as a dismissible
  modal on top. Unchanged.

The blocker keeps its look: same card, title, body and button. Only what shows
behind the dim backdrop changes, from the frozen app to an empty screen.

What the blocker needs stays above the gate: i18n (`useT`), the safe-area and
gesture roots, and `Linking` (a module, not a provider) to open the store.
Expo Router's own root container sits above `_layout.tsx` and stays mounted;
with no `Stack` rendered beneath it, a URL it parses has no screen to open.

[appTreeIsGated.test.ts](../../apps/mobile/app/__tests__/appTreeIsGated.test.ts)
locks the wiring at the source (the router, `AuthProvider`, `PushProvider`,
`VillageSync` are inside the gate) and
[AppVersionGate.test.tsx](../../apps/mobile/components/__tests__/AppVersionGate.test.tsx)
proves a wall unmounts a listening child and a lowered wall remounts it.

## Not decided here

*When* the wall is known is unchanged: it comes from `watchAppVersionConfig`,
the app runs while the first answer loads, and the gate fails open on a bad
read. So a cold start into a deep link on a walled binary can still mount a
screen until the first answer lands. Remembering the last wall to block before
the network (Órdago's cached decision) is a separate idea that needs a yes.

## Rejected alternatives

- **Keep the modal over the tree** — closes the screen to taps, not the
  navigation entry points; the crash class above.
- **Gate each entry point (deep link, notification) separately** — every new
  entry point would need its own check. Not mounting the tree covers them all
  by construction.

## What this binds

- Nothing that can navigate or read domain data mounts outside
  `AppVersionGate` in `_layout.tsx`.
- A future "user cannot continue" state (banned account, forced logout) blocks
  the same way: replace the tree, never overlay it.

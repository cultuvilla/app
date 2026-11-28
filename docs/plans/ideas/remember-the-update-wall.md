# Remember the last hard wall so it blocks before the network

**Priority:** medium

**Next:** decide whether a walled binary blocks from its cached wall at cold start

**Needs Álvaro's yes** — third Órdago harvest run, 2026-11-27. It changes when walled users see the blocker.

**Goal:** today the wall is decided from the network on every cold start, so a walled binary runs until the config read lands (or forever offline). Cache the last `minSupported` and block from it at start.

Source: ordago-apps `apps/ordago-app/components/updates/`, e29141a99.

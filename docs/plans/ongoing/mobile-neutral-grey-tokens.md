# Neutral grey tokens for the app's hand-written greys

**Priority:** low — 99 hex literals in `apps/mobile` match no design token, so a brand or dark-mode change cannot reach them
**Landed:** none
**Gate:** none
**Next:** verify the plan against develop (#725 landed the token-equal swap and the hex scan), then build it

Decided 2026-11-20 (user): approve — add neutral/grey tokens and move the remaining hand-written greys onto them, accepting slight visual changes.

**Goal:** every remaining quoted hex in `apps/mobile/app` and `apps/mobile/components` reads a token, so the jest hex scan from `mobile-raw-hex-to-tokens` can drop its allowlist of non-token greys.

## Context
As of `4b30925f` (2026-11-20), after the token-equal literals, 99 literals remain that match no token: slate/gray chevrons (`#cbd5e1` ×15), input borders (`#d1d5db` ×11), `AddressSearchBar` greys, black shadows and backdrops, and `RegisterFab` status colours. The inventory is the `mobile-raw-hex-to-tokens` investigation (`hex.txt`).

## Design
Collapse the near-duplicate greys into a small set of semantic tokens (e.g. `border.subtle`, `fg.chevron`, `overlay.scrim`) in `packages/shared/src/design-system/tokens/colors.ts`. Snap each literal to the nearest token, and list every snap whose value changes in the PR. Contrast tests must pass. Shadows keep `elevation`'s `#000000`.
**Testing strategy:** extend `contrast.test.ts` to the new tokens; drop the scan's allowlist.

## Paths
`packages/shared/src/design-system/tokens/colors.ts`, `apps/mobile/app/**`, `apps/mobile/components/**`, `apps/mobile/__tests__/noTokenHexLiterals.test.ts`; a QA entry (slight visual change).

## Approval
Approved by the user on 2026-11-20 (above).

## Out of scope
Raw Tailwind palette classes (`bg-white`, `text-gray-*`). Migrating those stays opportunistic.

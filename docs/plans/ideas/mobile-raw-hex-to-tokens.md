# Replace mobile hex literals that copy a design token with the token

**Priority:** low — cleanup: 81 literals copy a token's value, and nothing stops the next one
**Gate:** blocked:PRs #677, #680 and branch feat/sheets-drag-only (they edit files this plan rewrites, e.g. `(tabs)/index.tsx`, `completar-perfil.tsx`, `RegisterSheet.tsx`)

**Goal:** Every quoted hex in `apps/mobile/app` and `apps/mobile/components` whose value
equals a colour token reads that token instead, and a jest scan fails on a new one, so a
brand change or the dark mode `colors.ts` promises is "a switch, not a sweep".

## Context

As of `129efeb7` (2026-11-20), `apps/mobile/app/**/*.tsx` and `apps/mobile/components/**/*.tsx`
(tests excluded) hold **180 quoted hex literals in 61 files**. The tokens are
`palette` and `colors.light.{bg,fg,border}` in
`packages/shared/src/design-system/tokens/colors.ts`, and 78 of those mobile files already read them
as `colors.light.fg.accent` and similar (e.g. `app/(tabs)/grupos.tsx`, `app/[pueblo]/evento/[evento].tsx`),
so the shape is settled.

**81 literals, in 44 files, are exactly a token's value** (swapping them changes no pixel):

| Literal | n | Where it is used | Token with that value |
|---|---|---|---|
| `#ffffff` / `#fff` | 25 + 2 | input, picker and sheet backgrounds (`DateField`, `VillagePicker`, `FilterSheet`, `RegisterSheet` …) | `bg['surface-elevated']` |
| | | white icons and text over photos and black backdrops (`FeedCard`, `WrappedStoryViewer`, `ImageLightbox`, `BlockEditor`, `DetailHeroImage`, `ImagePickerField` spinner) | none by intent — `fg['on-danger']` has the value, not the meaning |
| `#f9f0e8` | 18 | text, icons and spinners on terracotta (`Fab`, `BuryFab`, `RegisterFab`, `AppHeader`, `ScreenHeader`, `BlockingOverlay`, `entidad/[entidad]`) | `fg['on-accent']` |
| | | `SegmentedToggle` `INDICATOR_BG`, `VillageSections` `CREST_BG` | `bg.surface` |
| `#bb5d3a` | 14 | tab bar active tint, FAB backgrounds, local `ACCENT` constants in 6 files, `ErrorState` icon | `bg.accent` / `fg.accent` |
| `#566047` | 6 | `h2` titles in the censo/signup editors, `FilterSheet` | `fg.primary` |
| `#16a34a` | 5 | check icons | `fg.success` |
| `#dc2626` | 4 | trash / exit icons | `fg.danger` |
| `#a6a897` | 4 | `placeholderTextColor`, tab bar inactive tint, search glyph | only `border.strong` (a border token) |
| `#dcab93` | 3 | `PLACEHOLDER_BG` in `FeedCard`, `DetailHeroImage`, `VillageSections` | `bg.subtle` |

They sit where NativeWind classes cannot reach — Ionicons `color`, `ActivityIndicator`,
`placeholderTextColor`, `tabBarActiveTintColor`, `StyleSheet` objects — which is why they
were typed by hand. Several carry a comment naming the token they copy
(`FilterSheet.tsx` `ACCENT`, `FeedCard.tsx` `BADGE_BG`), and two name a token that does not
exist: `RegisterSheet.tsx` says `// colors.ts: light.bg.base (white)` and `FeedCard.tsx`
`BADGE_BG` says `// palette.accent` (the key is `palette.terracotta`).

**The other 99 match no token**: Tailwind slate/gray values (`#cbd5e1` ×15 chevrons and sheet
grabbers, `#d1d5db` ×11 input borders, `#94a3b8` ×10, `#e5e7eb` ×8, `#9ca3af` ×8, `#64748b` ×7,
`#0f172a` ×5, …), `AddressSearchBar`'s `#333/#444/#666/#999`, `#000` shadows and backdrops, and
one-offs (`RegisterFab` `#2f7d4f` / `#b07a1e`, `entidad` `#8a7a70`, `VillageSections`
`SKELETON_BG #e7dccf`). Mapping them to tokens would change what users see. They are left
alone here.

Nothing guards this. `apps/mobile` has no ESLint config, and no test scans for hexes. The
pattern exists: `apps/mobile/__tests__/pressCatcherAccessibility.test.ts` walks `app/` and
`components/` `.tsx` and asserts a source invariant.

No plan or decision covers it. `docs/decisions/date-time-pickers.md` says "Design tokens only" and
`creation-stepper.md` says "never raw colors" for their own components, and `AGENTS.md` § Enhance names "the same …
hex colour in two places" as a conventions finding.

## Design

1. **Swap each exact literal for the token whose *meaning* fits**, from the table above. A
   local constant that only renames a token (`const ACCENT = '#bb5d3a'` in `FilterPill`,
   `FilterSheet`, `LocationPicker`, `VillageDiscovery`, `(tabs)/index`, `VillageSections`)
   is deleted or set to the token. `VillageSections` exports `ACCENT` and
   `app/(tabs)/__tests__/perfil.test.tsx` mocks it, so keep the export (assign it the token)
   or update the mock.
2. **Add the two semantic tokens the table lacks, with the value already shipped**, so no
   swap borrows a token whose name says something else (illustrative names):
   `fg['on-media']: '#ffffff'` (text and icons over photos and scrims) and
   `fg.faint: palette.sage` (placeholders, inactive tab tint). Both values are already on
   screen, so nothing visible changes. Tailwind picks them up through `tailwind.config.ts`.
3. **Add a ratchet test** `apps/mobile/__tests__/noTokenHexLiterals.test.ts`, shaped like
   `pressCatcherAccessibility.test.ts`. It collects every value in `palette` and
   `colors.light`, normalises `#fff` → `#ffffff` and case, and fails on any quoted
   literal in `app/` or `components/` (outside `__tests__`) that equals one, naming file,
   line and the token to use. It covers only token-equal literals, so the 99 neutral greys
   don't block it. Elevation's `#000000` shadow colour is not in `colors`, so shadows pass.
4. Fix or drop the stale `light.bg.base` comment in `RegisterSheet.tsx` and `palette.accent`
   in `FeedCard.tsx` as they are touched.

**Alternatives considered:** a lint rule. `apps/mobile` has no ESLint yet, and a jest scan is
what this repo already uses for source invariants. Banning *every* hex: that would force the
99 non-token greys into new tokens or an allowlist, which is a design call (see Out of scope).
Mapping white-on-photo to `fg['on-danger']`: the right value but the wrong meaning, and a
future dark mode would break it.

**Testing strategy:** the ratchet test is the boundary. Run it red on today's tree (it should
report the 81), then green after the swap. Existing component tests stay as they are. No
screenshot test is needed because every value is unchanged by construction. The PR says no
QA entry is needed: nothing user-visible changes.

## Paths

As of 2026-11-20:

- `packages/shared/src/design-system/tokens/colors.ts` (two tokens)
- `packages/shared/src/design-system/README.md` (token vocabulary)
- `apps/mobile/__tests__/noTokenHexLiterals.test.ts` (new)
- `apps/mobile/app/(tabs)/__tests__/perfil.test.tsx` (only if the `ACCENT` export changes)
- the 44 files holding a token-equal literal:
- `apps/mobile/app/crear/noticia.tsx`
- `apps/mobile/app/mis-pueblos.tsx`
- `apps/mobile/app/(onboarding)/completar-perfil.tsx`
- `apps/mobile/app/[pueblo]/censo.tsx`
- `apps/mobile/app/[pueblo]/entidad/[entidad]/index.tsx`
- `apps/mobile/app/(tabs)/index.tsx`
- `apps/mobile/app/(tabs)/_layout.tsx`
- `apps/mobile/components/feature/BlockEditor.tsx`
- `apps/mobile/components/feature/BuryFab.tsx`
- `apps/mobile/components/feature/CensoAnswers.tsx`
- `apps/mobile/components/feature/CensoSchemaEditor.tsx`
- `apps/mobile/components/feature/DeleteHeaderButton.tsx`
- `apps/mobile/components/feature/DetailHeroImage.tsx`
- `apps/mobile/components/feature/FeedCard.tsx`
- `apps/mobile/components/feature/FilterPill.tsx`
- `apps/mobile/components/feature/FilterSheet.tsx`
- `apps/mobile/components/feature/LocationField.tsx`
- `apps/mobile/components/feature/LocationPicker.tsx`
- `apps/mobile/components/feature/MapLocationPicker.tsx`
- `apps/mobile/components/feature/MembershipVillageEditor.tsx`
- `apps/mobile/components/feature/MembersList.tsx`
- `apps/mobile/components/feature/MyVillagePicker.tsx`
- `apps/mobile/components/feature/questions/QuestionCardShell.tsx`
- `apps/mobile/components/feature/RegisterFab.tsx`
- `apps/mobile/components/feature/RegisterSheet.tsx`
- `apps/mobile/components/feature/ResidenceLinksEditor.tsx`
- `apps/mobile/components/feature/SegmentedToggle.tsx`
- `apps/mobile/components/feature/signup/SignupQuestionsEditor.tsx`
- `apps/mobile/components/feature/UserMenuModal.tsx`
- `apps/mobile/components/feature/VillageDiscovery.tsx`
- `apps/mobile/components/feature/VillageSections.tsx`
- `apps/mobile/components/feature/wrapped/WrappedStoryViewer.tsx`
- `apps/mobile/components/layout/AppHeader.tsx`
- `apps/mobile/components/layout/ScreenHeader.tsx`
- `apps/mobile/components/primitives/BarrioPicker.tsx`
- `apps/mobile/components/primitives/BlockingOverlay.tsx`
- `apps/mobile/components/primitives/DateField.tsx`
- `apps/mobile/components/primitives/DateRangeField.tsx`
- `apps/mobile/components/primitives/DateTimeField.tsx`
- `apps/mobile/components/primitives/ErrorState.tsx`
- `apps/mobile/components/primitives/Fab.tsx`
- `apps/mobile/components/primitives/ImageLightbox.tsx`
- `apps/mobile/components/primitives/ImagePickerField.tsx`
- `apps/mobile/components/primitives/VillagePicker.tsx`

## Approval

Pre-approved — "consolidating duplicates into one source of truth — where the copies disagree,
only if the surviving behaviour is the documented or tested one". Here the copies agree to the
byte. The new tokens carry the values already shipped. `AGENTS.md` § Enhance pre-approves this
lens "only when nothing a user sees changes", which holds by construction. The ratchet test
falls under "test and CI health". No hard-stop path is touched.

Open PRs #680 (`app/(onboarding)/completar-perfil.tsx`) and #677 (`app/(tabs)/index.tsx`) touch
two of these files for other reasons. Rebase over them if they are still open when this starts.

## Out of scope

- The 99 literals that match no token: the slate/gray neutrals, `AddressSearchBar`'s greys,
  black backdrops and shadows, and the `RegisterFab` status colours. Giving them tokens such as
  a neutral `border.input` or `fg.chevron` changes colours on screen and needs a design yes. It
  would be a separate idea.
- Raw Tailwind palette *classes* (`bg-white`, `text-gray-500`). `AGENTS.md` § Styling keeps
  that migration opportunistic.
- Dark mode itself, `apps/studio`, and `functions/src/web`.

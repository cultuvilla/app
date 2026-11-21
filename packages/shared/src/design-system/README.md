# `@cultuvilla/shared/design-system`

Platform-agnostic design tokens consumed by both `apps/web` (Tailwind v4)
and the future `apps/mobile` (NativeWind). The contract is intentionally
tight:

- **Tokens are TypeScript objects**, not CSS strings. They render to CSS
  via the Tailwind config (`apps/web/tailwind.config.ts`); the same
  objects are read by NativeWind in the mobile app.
- **Semantic, not raw.** `bg-surface`, not `bg-white`. `text-muted`, not
  `text-gray-500`. The whole point is that dark mode can be a single
  switch later.
- **Never extend ad-hoc.** If a screen needs a value that isn't here,
  that's a design conversation, not a token addition.

## What's exported

| Module | What |
|---|---|
| `tokens/spacing` | `{ 0, 1, 2, 3, 4, 6, 8, 12, 16 }` → `{ 0, 4, 8, 12, 16, 24, 32, 48, 64 }` px |
| `tokens/typography` | 7 variants: `display`, `h1`, `h2`, `h3`, `body`, `bodySm`, `caption`. Each carries `fontSize`, `lineHeight`, `fontWeight`. |
| `tokens/colors` | Semantic light-mode palette (`bg.surface`, `text.primary`, `accent.DEFAULT`, …). Dark mode added later by adding `colors.dark` with the same keys. `fg.faint` (placeholders, inactive tab icons) and `fg.on-media` (text and icons over photos and scrims) cover what a NativeWind class cannot reach. |
| `tokens/radii` | `none / sm / md / lg / xl / full`. |
| `tokens/elevation` | `none / sm / md`. Each carries a `web` CSS string and an `rn` descriptor for React Native. |
| `tokens/zIndex` | Named layers: `base / dropdown / sticky / sheet / modal / toast`. |
| `tokens/a11y` | `minTouchTarget: 44`, `defaultHitSlop`. |
| `icons` | `iconSizes = { sm: 16, md: 20, lg: 24 }` for `lucide-react` / `lucide-react-native`. |

## Web usage

Tokens flow into `apps/web/tailwind.config.ts`, which extends Tailwind's
theme. JSX consumes them as utility classes:

```tsx
<div className="bg-surface text-primary p-4 rounded-md shadow-sm">
  …
</div>
```

When you need a raw number (e.g. computed inline style, animation
target), import directly:

```tsx
import { spacing } from '@cultuvilla/shared/design-system';

const sidebarWidth = spacing[16];  // 64
```

## Mobile usage (when `apps/mobile/` lands)

The mobile app will configure NativeWind with the same `tailwind.config.ts`
shape. Tokens reach NativeWind via the JS config; raw values are
available for `StyleSheet.create` callers that prefer direct numeric
access.

For RN shadows, `elevation.{none,sm,md}.rn` carries the full
`{ shadowColor, shadowOffset, shadowOpacity, shadowRadius, elevation }`
descriptor — never recompute these in a screen.

Where a class cannot reach (Ionicons `color`, `ActivityIndicator`,
`placeholderTextColor`, tab bar tints, `StyleSheet` objects), read the
token (`colors.light.fg.accent`), never its hex: the mobile test
`apps/mobile/__tests__/noTokenHexLiterals.test.ts` fails on a quoted hex
that equals a token.

## Adding a new token

Don't, lightly. Tokens are a small vocabulary on purpose. If you must:

1. Add the value to the relevant `tokens/<name>.ts`.
2. Update its test.
3. Update this README's table.
4. If the value should appear in Tailwind classes, extend
   `apps/web/tailwind.config.ts` in the same PR.

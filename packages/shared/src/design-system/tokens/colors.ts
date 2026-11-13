/**
 * Semantic color tokens, keyed by mode and by Tailwind utility family
 * (`bg`, `fg`, `border`). Light mode is the only shipped mode today —
 * `dark` will be added by mapping the same semantic keys to different
 * raw values, so screens never reach for raw colors and dark mode is a
 * switch, not a sweep.
 *
 * The `bg` / `fg` / `border` split mirrors the Tailwind utility families
 * we extend in `apps/web/tailwind.config.ts`: `bg.X` is what
 * `theme.extend.backgroundColor.X` consumes (producing `bg-X` classes),
 * `fg.X` produces `text-X`, `border.X` produces `border-X`. That keeps
 * class names crisp (`bg-surface`, `text-primary`) instead of
 * doubly-namespaced (`bg-surface`).
 *
 * Naming rule: tokens describe *intent* (surface, on-accent, muted),
 * not appearance (gray-100, slate-900). Never expose raw palette names
 * outside this file. Keys use kebab-case so they survive into Tailwind
 * class generation unchanged.
 */
/**
 * Raw brand palette. Do not consume these directly from screens — map
 * them into the semantic `light` (and future `dark`) tokens below.
 */
export const palette = {
  terracotta: '#bb5d3a',
  cream: '#f9f0e8',
  olive: '#566047',
  clay: '#d08f70',
  peach: '#dcab93',
  sage: '#a6a897',
  rust: '#be6b47',
  // Sage darkened until it reads as text: 4.5:1 or better on cream and on white.
  moss: '#696c5a',
} as const;

export type PaletteColor = keyof typeof palette;

const light = {
  bg: {
    surface: palette.cream,
    'surface-elevated': '#ffffff',
    subtle: palette.peach,
    accent: palette.terracotta,
    'accent-pressed': palette.rust,
    'accent-subtle': palette.clay,
    secondary: palette.olive,
    'secondary-subtle': palette.sage,
    danger: '#dc2626',
    'danger-subtle': '#fef2f2',
    success: '#16a34a',
    'success-subtle': '#f0fdf4',
  },
  fg: {
    primary: palette.olive,
    muted: palette.moss,
    'on-subtle': '#3f4635',
    'on-accent': palette.cream,
    'on-secondary': palette.cream,
    'on-danger': '#ffffff',
    'on-success': '#ffffff',
    accent: palette.terracotta,
    secondary: palette.olive,
    danger: '#dc2626',
    success: '#16a34a',
  },
  border: {
    subtle: palette.peach,
    strong: palette.sage,
    accent: palette.terracotta,
    secondary: palette.olive,
    danger: '#dc2626',
  },
} as const;

export const colors = { light } as const;

export type ColorMode = keyof typeof colors;

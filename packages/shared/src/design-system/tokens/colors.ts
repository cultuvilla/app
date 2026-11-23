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
    // Neutral fills: disabled triggers, search inputs, thumbnail wells.
    muted: '#f3f4f6',
    // An image that has not loaded or does not exist (avatar, escudo).
    placeholder: '#e5e7eb',
    // Loading cards on bg-surface: a darker cream, not a grey.
    skeleton: '#e7dccf',
    // Behind photos and full-screen media (lightbox, Wrapped).
    media: '#000000',
    // Registration and join-request pills, under fg.on-accent labels.
    'status-confirmed': '#2f7d4f',
    'status-waitlisted': '#b07a1e',
    'status-pending': '#8a7a70',
  },
  fg: {
    primary: palette.olive,
    muted: palette.moss,
    // Below text contrast on purpose: placeholders, inactive tab icons, input glyphs.
    faint: palette.sage,
    'on-subtle': '#3f4635',
    'on-accent': palette.cream,
    'on-secondary': palette.cream,
    'on-danger': '#ffffff',
    'on-success': '#ffffff',
    // Text and icons over photos and dark scrims.
    'on-media': '#ffffff',
    // Neutral icon greys, darkest first. strong: icons beside headings.
    // icon: secondary glyphs (dropdown chevrons, empty states), still 3:1.
    // quiet: close/search glyphs and disabled items. chevron: disclosure
    // chevrons, grab handles and disabled glyphs.
    strong: '#0f172a',
    icon: '#64748b',
    quiet: '#94a3b8',
    chevron: '#cbd5e1',
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
    // Neutral outlines of inputs and pickers, and hairline list dividers.
    input: '#d1d5db',
    divider: '#e5e7eb',
  },
} as const;

export const colors = { light } as const;

export type ColorMode = keyof typeof colors;

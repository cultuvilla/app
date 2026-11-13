import { colors, palette } from '@cultuvilla/shared/design-system';

const c = colors.light;

/** The design-system tokens the stylesheet reads, as CSS custom properties. */
export function applyTheme(root: HTMLElement): void {
  const vars: Record<string, string> = {
    '--surface': c.bg.surface,
    '--card': c.bg['surface-elevated'],
    '--subtle': c.bg.subtle,
    '--accent': c.bg.accent,
    '--accent-pressed': c.bg['accent-pressed'],
    '--accent-subtle': c.bg['accent-subtle'],
    '--on-accent': c.fg['on-accent'],
    '--text': c.fg['on-subtle'],
    '--primary': c.fg.primary,
    // Sage is too faint for text on white; secondary text takes the olive.
    '--muted': c.fg.primary,
    '--placeholder': palette.sage,
    '--border': c.border.subtle,
    '--border-strong': c.border.strong,
    '--danger': c.fg.danger,
    '--danger-subtle': c.bg['danger-subtle'],
    '--success': c.fg.success,
  };
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
}

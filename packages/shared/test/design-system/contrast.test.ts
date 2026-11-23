import { describe, expect, it } from 'vitest';
import { colors } from '../../src/design-system/tokens/colors';

const AA_NORMAL_TEXT_RATIO = 4.5;
// WCAG 1.4.11 (non-text contrast) and AA for large or bold text.
const AA_NON_TEXT_RATIO = 3;

function luminance(hex: string): number {
  const channels = hex.replace('#', '').match(/.{2}/g);
  if (!channels) throw new Error(`Invalid hex color: ${hex}`);
  const [r, g, b] = channels.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

const TEXT_TOKENS = ['primary', 'muted', 'secondary', 'strong'] as const;
const PAGE_BACKGROUNDS = ['surface', 'surface-elevated'] as const;

describe('color contrast', () => {
  for (const [mode, tokens] of Object.entries(colors)) {
    for (const text of TEXT_TOKENS) {
      for (const background of PAGE_BACKGROUNDS) {
        it(`${mode}: text-${text} is AA on bg-${background}`, () => {
          expect(contrastRatio(tokens.fg[text], tokens.bg[background])).toBeGreaterThanOrEqual(
            AA_NORMAL_TEXT_RATIO,
          );
        });
      }
    }
  }


  it('keeps text readable on tinted subtle surfaces', () => {
    expect(contrastRatio(colors.light.fg['on-subtle'], colors.light.bg.subtle)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT_RATIO,
    );
  });

  for (const background of PAGE_BACKGROUNDS) {
    it(`fg.icon glyphs meet non-text contrast on bg-${background}`, () => {
      expect(contrastRatio(colors.light.fg.icon, colors.light.bg[background])).toBeGreaterThanOrEqual(
        AA_NON_TEXT_RATIO,
      );
    });
  }

  it('keeps the neutral greys in order, darkest first', () => {
    const { strong, icon, quiet, chevron } = colors.light.fg;
    const order = [strong, icon, quiet, chevron].map(luminance);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  for (const pill of ['accent', 'status-confirmed', 'status-waitlisted', 'status-pending'] as const) {
    it(`bold pill labels read on bg-${pill}`, () => {
      expect(contrastRatio(colors.light.fg['on-accent'], colors.light.bg[pill])).toBeGreaterThanOrEqual(
        AA_NON_TEXT_RATIO,
      );
    });
  }
});

import { describe, expect, it } from 'vitest';
import { colors } from '../../src/design-system/tokens/colors';

const AA_NORMAL_TEXT_RATIO = 4.5;

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

const TEXT_TOKENS = ['primary', 'muted', 'secondary'] as const;
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
});

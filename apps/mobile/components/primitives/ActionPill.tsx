import { useState } from 'react';
import { Pressable as RNPressable, Text as RNText, View } from 'react-native';
import { a11y, colors, typography } from '@cultuvilla/shared/design-system';
import {
  fitLabel,
  MAX_LABEL_FONT_MULTIPLIER,
  MIN_LABEL_SCALE,
} from '../../lib/text/fitFontSize';

const ACCENT = colors.light.fg.accent;
const HORIZONTAL_PADDING = 12;
const BORDER_WIDTH = 1.5;
/**
 * Glyph widths don't scale exactly linearly with font size on Android, so a
 * label scaled to the exact width can still come out a pixel too wide.
 */
const FIT_SLACK = 2;

/**
 * Width given to the off-screen measuring copy. Anything far wider than a
 * phone works: it exists only so the label lays out at its natural width
 * instead of wrapping at the pill's.
 */
const MEASURE_CANVAS_WIDTH = 4000;

export interface ActionPillProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  /**
   * Share the row's width with sibling pills (`flex: 1`). True inside an
   * HStack action row; pass false in a VStack, where flex-grow would stretch
   * the pill vertically instead.
   */
  grow?: boolean;
}

/**
 * The terracotta outline pill used for screen-level actions (Unirme, Compartir,
 * Rellenar censo, …).
 *
 * The label shrinks to stay on one line rather than wrapping — and never
 * ellipsizes. A truncated action label ("Añadir conten…") is worse than a small
 * one, and `adjustsFontSizeToFit` can't be used here because RN-Web ignores it
 * and falls back to exactly that ellipsis. So the label is measured
 * unconstrained and scaled by the ratio, which behaves the same on native and
 * on the web export. Past MIN_LABEL_SCALE it wraps instead of shrinking
 * further, so nothing is ever cut off.
 */
export function ActionPill({
  label,
  onPress,
  disabled = false,
  testID,
  grow = true,
}: ActionPillProps) {
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);

  const base = typography.body.fontSize;
  const { fontSize, fitsOneLine } = fitLabel(naturalWidth, availableWidth, base, MIN_LABEL_SCALE);
  // Before both widths are in, the label would paint at the base size clamped
  // to one line — the first frame ellipsized it («Unirme a este pue…», QA
  // 2026-11-21). It stays invisible for that frame instead.
  const measured = naturalWidth != null && availableWidth != null;

  return (
    <RNPressable
      hitSlop={a11y.defaultHitSlop}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      testID={testID}
      onLayout={(e) =>
        setAvailableWidth(
          e.nativeEvent.layout.width - (HORIZONTAL_PADDING + BORDER_WIDTH) * 2 - FIT_SLACK,
        )
      }
      className={`flex-row items-center justify-center bg-surface${
        disabled ? '' : ' active:opacity-70'
      }`}
      // A plain object, never a function: NativeWind collects the inline style
      // as a declaration and applies it with `{ ...style }`, which spreads a
      // function to nothing — the pill would render as a bare label with no
      // outline. Press feedback rides on the `active:` variant instead.
      style={{
        flex: grow ? 1 : undefined,
        paddingVertical: 5,
        paddingHorizontal: HORIZONTAL_PADDING,
        borderRadius: 24,
        borderWidth: BORDER_WIDTH,
        borderColor: ACCENT,
        minHeight: 32,
        // The measuring copy below is deliberately wider than any screen;
        // clip it so it can't add horizontal overflow to the web build.
        overflow: 'hidden',
        ...(disabled ? { opacity: 0.5 } : null),
      }}
    >
      {/* One line is enforced only at the measured base size. A shrunk label
          is sized to fit but not clamped: should it still come out a hair too
          wide, it wraps instead of ellipsizing («Inicia sesión para uni…»). */}
      <RNText
        numberOfLines={fitsOneLine && fontSize === base ? 1 : undefined}
        maxFontSizeMultiplier={MAX_LABEL_FONT_MULTIPLIER}
        className="font-semibold text-center"
        style={{ color: ACCENT, fontSize, lineHeight: typography.body.lineHeight, opacity: measured ? 1 : 0 }}
      >
        {label}
      </RNText>
      {/* Off-screen copy at the base size: its width is what the visible label
          would need if it never wrapped. Hidden from a11y so the pill's own
          accessibilityLabel stays the single announced string. */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          opacity: 0,
          width: MEASURE_CANVAS_WIDTH,
        }}
      >
        <RNText
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_LABEL_FONT_MULTIPLIER}
          className="font-semibold"
          style={{ alignSelf: 'flex-start', fontSize: base }}
          onLayout={(e) => setNaturalWidth(e.nativeEvent.layout.width)}
        >
          {label}
        </RNText>
      </View>
    </RNPressable>
  );
}

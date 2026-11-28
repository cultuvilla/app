import type { TextProps } from "react-native";

/**
 * How far a piece of text may follow the OS font-size setting.
 *
 * The OS range is wide — iOS reaches 3.57× in its accessibility sizes, Android
 * 2× — and unbounded text clips cards and pushes buttons off screen. So every
 * text declares one of these caps: the `Text` primitive takes it as its
 * `scaling` prop (default `body`), and a raw React Native `<Text>` or
 * `<TextInput>` spreads `{...TEXT_SCALING.<preset>}`, which
 * `textScaling.test.ts` enforces. RN's `defaultProps` would not do: React 19
 * ignores them on function components.
 *
 * - `body`: everything by default. 1.5× still honours a large system font.
 * - `label`: one-line action labels in a row that has no width to grow into —
 *   a 3-up ActionPill row at a 200% system font has none left to shrink into.
 * - `fixed`: geometry that is the design itself (initials inside an avatar).
 */
export type TextScalingPreset = "body" | "label" | "fixed";

export type TextScalingProps = Required<
  Pick<TextProps, "maxFontSizeMultiplier">
>;

/** Decided 2026-11-28 (Álvaro): no text grows past 1.5× its design size. */
export const MAX_FONT_SIZE_MULTIPLIER = 1.5;

export const TEXT_SCALING: Readonly<
  Record<TextScalingPreset, TextScalingProps>
> = Object.freeze({
  body: Object.freeze({ maxFontSizeMultiplier: MAX_FONT_SIZE_MULTIPLIER }),
  label: Object.freeze({ maxFontSizeMultiplier: 1.3 }),
  fixed: Object.freeze({ maxFontSizeMultiplier: 1 }),
});

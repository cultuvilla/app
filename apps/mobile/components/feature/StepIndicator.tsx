// apps/mobile/components/feature/StepIndicator.tsx
import { Fragment } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from '../primitives';
import { colors } from '@cultuvilla/shared/design-system';

type Glyph = keyof typeof Ionicons.glyphMap;

export interface StepIndicatorProps {
  count: number;
  current: number;
  highestReached: number;
  onStepPress: (index: number) => void;
  /** Ionicons glyph per step; falls back to a neutral dot when absent. */
  icons?: (Glyph | undefined)[];
  /** Accessibility label per step (the step title), since dots show no text. */
  labels?: (string | undefined)[];
  /** Whether each step already has its info filled in (marks the circle). */
  complete?: boolean[];
  /** Edit mode: every step is reachable/clickable regardless of progress. */
  allReachable?: boolean;
}

// A step is "marked" by an accent circumference + icon once it has its info;
// the circle is never filled. Not-yet-filled steps use neutral greys.
const ACCENT = colors.light.fg.accent;
const IDLE_BORDER = colors.light.border.input;
const IDLE_ICON = colors.light.fg.quiet;

export function StepIndicator({
  count,
  current,
  highestReached,
  onStepPress,
  icons,
  labels,
  complete,
  allReachable = false,
}: StepIndicatorProps) {
  return (
    <View className="flex-row items-center justify-center px-5 py-3">
      {Array.from({ length: count }, (_, i) => {
        const reached = allReachable || i <= highestReached;
        // Marked only once the step has been reached AND has its info.
        const marked = reached && (complete?.[i] ?? false);
        const baseGlyph: Glyph = icons?.[i] ?? 'ellipse';
        // The step you're on shows the filled icon variant; others stay outline.
        // Ionicons names filled variants without the `-outline` suffix; guard
        // against glyphs that have no filled counterpart.
        const filled = baseGlyph.replace(/-outline$/, '') as Glyph;
        const glyph: Glyph = i === current && filled in Ionicons.glyphMap ? filled : baseGlyph;
        return (
          <Fragment key={i}>
            <Pressable
              testID={`step-dot-${i}`}
              accessibilityLabel={labels?.[i]}
              disabled={!reached}
              onPress={() => onStepPress(i)}
              className="w-10 h-10 rounded-full border-2 items-center justify-center"
              style={{ borderColor: marked ? ACCENT : IDLE_BORDER }}
            >
              <Ionicons name={glyph} size={20} color={marked ? ACCENT : IDLE_ICON} />
            </Pressable>
            {i < count - 1 && (
              <View className="w-12 h-0.5 mx-2" style={{ backgroundColor: IDLE_BORDER }} />
            )}
          </Fragment>
        );
      })}
    </View>
  );
}

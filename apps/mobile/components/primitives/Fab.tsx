import { Animated, Pressable, Text } from 'react-native';
import { colors, elevation } from '@cultuvilla/shared/design-system';

export type FabProps = {
  onPress: () => void;
  /** Text shown inside the pill (e.g. "Crear evento" / "Crear noticia"). */
  label: string;
  testID?: string;
  /**
   * Optional animated (or static) opacity, e.g. to fade the pill out on
   * scroll-down and back in on scroll-up. Defaults to fully shown.
   */
  opacity?: Animated.AnimatedInterpolation<number> | number;
  /**
   * When false the pill ignores touches — pair with a faded-out `opacity` so
   * the invisible button doesn't intercept taps meant for the feed behind it.
   * Defaults to interactive.
   */
  interactive?: boolean;
};

/**
 * Orange, horizontally-centered floating action button (ordago-style "create"
 * pill). Pinned just above the bottom; the outer wrapper is `box-none` so it
 * never blocks taps on the feed behind it. All visual styles live on `style`
 * (never `className`) so the button renders on the RN-Web build.
 */
export function Fab({ onPress, label, testID, opacity = 1, interactive = true }: FabProps) {
  return (
    <Animated.View
      pointerEvents={interactive ? 'box-none' : 'none'}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 24,
        alignItems: 'center',
        zIndex: 20,
        opacity,
      }}
    >
      <Pressable
        onPress={onPress}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 10,
          paddingHorizontal: 22,
          borderRadius: 999,
          // accent (terracotta) — matches the AppHeader bg-accent token
          backgroundColor: colors.light.bg.accent,
          elevation: 6,
          shadowColor: elevation.md.rn.shadowColor,
          shadowOpacity: 0.25,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
        }}
      >
        <Text style={{ color: colors.light.fg['on-accent'], fontSize: 22, lineHeight: 24, marginRight: 8 }}>+</Text>
        <Text style={{ color: colors.light.fg['on-accent'], fontSize: 16, fontWeight: '700' }}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

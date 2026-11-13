import { useEffect, useRef, useState } from 'react';
import { View, Animated, Easing } from 'react-native';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';

export type SegmentedToggleOption<T extends string> = {
  value: T;
  label: string;
};

export type SegmentedToggleProps<T extends string> = {
  options: readonly SegmentedToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Each segment gets `${testID}-${value}`. */
  testID?: string;
};

// NativeWind 4 strips `className` from Animated.View on the web target, so
// any class set there silently no-ops (the indicator was rendering without
// `position: absolute`, which pushed both pressables into the right half).
// All Animated.View styling is therefore inlined. Colors mirror the design
// tokens at packages/shared/src/design-system/tokens/colors.ts:
//   surface         = palette.cream (#f9f0e8)
//   subtle          = palette.peach (#dcab93)  (applied via the View track)
const INDICATOR_BG = '#f9f0e8';

/**
 * Pill-style segmented toggle with an animated sliding indicator.
 * Inspired by ordago-apps' TORNEOS/PARTIDAS switch.
 */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  testID,
}: SegmentedToggleProps<T>) {
  const [trackWidth, setTrackWidth] = useState(0);
  const activeIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value),
  );
  const indicatorAnim = useRef(new Animated.Value(activeIndex)).current;

  useEffect(() => {
    // Plain eased slide — no spring overshoot/bounce.
    Animated.timing(indicatorAnim, {
      toValue: activeIndex,
      useNativeDriver: false,
      duration: 200,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [activeIndex, indicatorAnim]);

  const segmentWidth = trackWidth > 0 ? Math.max((trackWidth - 4) / options.length, 0) : 0;

  return (
    <View
      className="flex-row bg-subtle rounded-md p-[2px]"
      testID={testID}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={{
          position: 'absolute',
          top: 2,
          bottom: 2,
          left: 2,
          width: segmentWidth,
          backgroundColor: INDICATOR_BG,
          borderRadius: 8,
          pointerEvents: 'none',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
          elevation: 2,
          transform: [
            {
              translateX: indicatorAnim.interpolate({
                inputRange: options.map((_, i) => i),
                outputRange: options.map((_, i) => i * segmentWidth),
              }),
            },
          ],
        }}
      />
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            testID={testID ? `${testID}-${opt.value}` : undefined}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            className="flex-1 py-2 px-1 items-center justify-center"
          >
            <Text
              variant="caption"
              tone={isActive ? 'primary' : 'onSubtle'}
              className="uppercase font-semibold text-center"
              numberOfLines={2}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

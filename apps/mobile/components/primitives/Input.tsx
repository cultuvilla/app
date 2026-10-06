import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import {
  Animated,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
  type TextInputProps,
  type TextInputScrollEvent,
} from 'react-native';
import { colors, spacing, typography } from '@cultuvilla/shared/design-system';
import { Text } from './Text';
import { FieldLabel } from './FieldLabel';
import { VStack } from './VStack';

/** One line of body text — the composer's resting height. */
const AUTO_GROW_MIN_HEIGHT = typography.body.lineHeight;
/** 5 lines: enough to read a long comment whole without eating the screen. */
const AUTO_GROW_MAX_HEIGHT = typography.body.lineHeight * 5;
/** Half a one-line pill (line + the wrapper's py-2), so it reads as a capsule at
 * rest. `rounded-full` would turn a grown, multi-line field into a stadium whose
 * curved ends cut across the text. */
const PILL_RADIUS = (typography.body.lineHeight + spacing[2] * 2) / 2;
/** How long the scroll hint stays after the last scroll or keystroke. */
const SCROLL_HINT_VISIBLE_MS = 900;
const SCROLL_HINT_WIDTH = 3;

/**
 * Thin bar on the left edge of a field that has outgrown `maxAutoGrowHeight`,
 * so a typist can tell there is hidden text. Drawn by hand: Android draws no
 * indicator on a TextInput at all, and iOS only on the right, under the send
 * arrow. Its size and position mirror the visible window over the content.
 */
function ScrollHint({
  visibleHeight,
  contentHeight,
  scrollY,
  pulse,
  left,
  top,
}: {
  visibleHeight: number;
  contentHeight: number;
  scrollY: number;
  /** Changes whenever the hint should flash into view. */
  pulse: number;
  left: number;
  top: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (pulse === 0) return;
    opacity.stopAnimation();
    opacity.setValue(1);
    const fade = Animated.timing(opacity, {
      toValue: 0,
      duration: 300,
      delay: SCROLL_HINT_VISIBLE_MS,
      useNativeDriver: true,
    });
    fade.start();
    return () => fade.stop();
  }, [pulse, opacity]);

  const barHeight = Math.max((visibleHeight / contentHeight) * visibleHeight, 12);
  const maxScroll = contentHeight - visibleHeight;
  const progress = maxScroll > 0 ? Math.min(Math.max(scrollY / maxScroll, 0), 1) : 0;
  // style, not className: NativeWind drops className on Animated components.
  return (
    <Animated.View
      pointerEvents="none"
      testID="input-scroll-hint"
      style={{
        position: 'absolute',
        left,
        top: top + progress * (visibleHeight - barHeight),
        width: SCROLL_HINT_WIDTH,
        height: barHeight,
        borderRadius: SCROLL_HINT_WIDTH / 2,
        backgroundColor: colors.light.fg.accent,
        opacity: Animated.multiply(opacity, 0.5),
      }}
    />
  );
}

export type InputProps = Omit<TextInputProps, 'style' | 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (next: string) => void;
  label?: string;
  error?: string;
  /** Node rendered inside the bordered area on the right, vertically centered. */
  rightAdornment?: ReactNode;
  /** Tighter vertical padding (e.g. dense forms). */
  dense?: boolean;
  /** Fully rounded accent-outlined capsule, no fill (chat/comment composers). */
  pill?: boolean;
  /** Ref to the underlying field, for imperative `.focus()` / `.blur()`. */
  inputRef?: Ref<TextInput>;
  /** Multiline field that grows with its content up to `maxAutoGrowHeight`,
   * then scrolls. Keeps a long comment fully visible while it is being typed. */
  autoGrow?: boolean;
  /** Ceiling for `autoGrow`, in px. Past it the field scrolls instead of growing. */
  maxAutoGrowHeight?: number;
};

// Controlled text input. `onChangeText` (vs `onChange`) keeps the API aligned
// with apps/web/components/primitives/Input.tsx — and with React Native
// convention. Label and error are rendered inline.
export function Input({
  label,
  value,
  onChangeText,
  error,
  rightAdornment,
  dense = false,
  pill = false,
  inputRef,
  autoGrow = false,
  maxAutoGrowHeight = AUTO_GROW_MAX_HEIGHT,
  onScroll,
  ...rest
}: InputProps) {
  // RN does not resize a multiline field to fit its text, so the height is
  // driven from the reported content size and clamped at both ends: one line at
  // rest, `maxAutoGrowHeight` before it starts scrolling instead of growing.
  const [contentHeight, setContentHeight] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [hintPulse, setHintPulse] = useState(0);
  const grownHeight = Math.min(Math.max(contentHeight, AUTO_GROW_MIN_HEIGHT), maxAutoGrowHeight);
  const overflowing = autoGrow && contentHeight > maxAutoGrowHeight;
  const flashHint = () => setHintPulse((n) => n + 1);

  // Typing past the ceiling hides the top lines — show the hint as it happens.
  useEffect(() => {
    if (overflowing) flashHint();
  }, [overflowing, contentHeight]);

  const autoGrowProps = autoGrow
    ? ({
        multiline: true,
        scrollEnabled: overflowing,
        onContentSizeChange: (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) =>
          setContentHeight(e.nativeEvent.contentSize.height),
      } as const)
    : null;
  const handleScroll = (e: TextInputScrollEvent) => {
    onScroll?.(e);
    if (!overflowing) return;
    setScrollY(e.nativeEvent.contentOffset.y);
    flashHint();
  };
  const heightStyle = autoGrow ? { height: grownHeight } : null;
  return (
    <VStack gap={1}>
      {label && <FieldLabel>{label}</FieldLabel>}
      <View
        className={`flex-row ${autoGrow ? 'items-end' : 'items-center'} border ${
          pill ? 'px-4 gap-2 py-2' : `rounded-md px-3 bg-surface ${dense ? 'py-1' : 'py-2'}`
        } ${error ? 'border-danger' : pill ? 'border-accent' : 'border-subtle'}`}
        style={pill ? { borderRadius: PILL_RADIUS } : undefined}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel={rest.accessibilityLabel ?? label ?? rest.placeholder}
          placeholderTextColor={pill ? colors.light.fg.accent : undefined}
          className={`flex-1 text-body ${pill ? 'text-accent' : 'text-primary'}`}
          textAlignVertical={rest.multiline || autoGrow ? 'top' : 'center'}
          // The visible box height is dominated by the field's own intrinsic
          // padding (large on Android) + font padding, NOT the wrapper's py-*.
          // In dense/pill mode we zero both so the wrapper padding alone sets height.
          style={
            dense || pill || autoGrow
              ? { ...(dense || pill ? { paddingVertical: 0, includeFontPadding: false } : {}), ...heightStyle }
              : undefined
          }
          {...autoGrowProps}
          {...rest}
          onScroll={handleScroll}
        />
        {rightAdornment}
        {overflowing ? (
          <ScrollHint
            visibleHeight={grownHeight}
            contentHeight={contentHeight}
            scrollY={scrollY}
            pulse={hintPulse}
            left={pill ? spacing[1] + 2 : spacing[1]}
            top={dense ? spacing[1] : spacing[2]}
          />
        ) : null}
      </View>
      {error && (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      )}
    </VStack>
  );
}

import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable as RNPressable,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { iconSizes } from '@cultuvilla/shared/design-system';
import { HStack } from './HStack';
import { KeyboardAvoider } from './KeyboardAvoider';
import { Text } from './Text';

/** Drag distance (px) past which a release dismisses instead of springing back. */
const DISMISS_DISTANCE = 90;
/** Fling velocity that dismisses regardless of how far the sheet was dragged. */
const DISMISS_VELOCITY = 0.6;

/**
 * Decide what releasing a downward drag means. Pure so the rule is
 * unit-testable — PanResponder's gesture state cannot be driven in jest.
 *
 * Either a long enough pull or a fast enough flick dismisses; a short, slow
 * drag springs the sheet back.
 */
export function shouldDismissOnRelease(dy: number, vy: number): boolean {
  return dy > DISMISS_DISTANCE || vy > DISMISS_VELOCITY;
}

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Rendered next to the close button in the header; omit for a bare sheet. */
  title?: string;
  /** Accessibility label for the ✕ button. */
  closeLabel: string;
  /** Fraction of the viewport the sheet may grow to before its body scrolls. */
  maxHeightRatio?: number;
  /** Pinned below the scrollable body (e.g. a Confirm button). */
  footer?: ReactNode;
  children: ReactNode;
  testID?: string;
}

/**
 * Bottom-anchored modal sheet: grows with its content up to `maxHeightRatio` of
 * the viewport, then lets the caller's body scroll inside it.
 *
 * Four ways out, because no single one works everywhere:
 *
 * - **drag the sheet down** — native only. RN-Web does not move a translateY
 *   spring (the reason `AddContentSheet` never had a swipe), so the gesture is
 *   simply not attached there rather than half-working.
 * - **tap the grab handle** — the web stand-in for the drag.
 * - **the ✕ button** — on web mobile there is no Escape key, no hardware back
 *   and no swipe, so this is the primary affordance there.
 * - **tap the backdrop.**
 *
 * The transform lives on `style`, never `className`: NativeWind drops
 * `className` on an `Animated.View`.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  closeLabel,
  maxHeightRatio = 0.85,
  footer,
  children,
  testID,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const translateY = useRef(new Animated.Value(0)).current;
  // PanResponder is built once, so it must reach `onClose` through a ref rather
  // than closing over the first render's prop.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // A dismissed-by-drag sheet keeps its offset; reset it so the next open does
  // not start off-screen.
  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible, translateY]);

  const pan = useRef(
    PanResponder.create({
      // Downward-only, and clearly more vertical than horizontal, so the body's
      // own scrolling is never hijacked.
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 12 && g.dy > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (shouldDismissOnRelease(g.dy, g.vy)) {
          closeRef.current();
          return;
        }
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  const dragHandlers = pan.panHandlers;

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* flex-1, not absoluteFill: an absolute backdrop would ignore the padding
          KeyboardAvoider adds, and the keyboard would cover the sheet's fields. */}
      <KeyboardAvoider>
        <RNPressable
          accessible={false}
          onPress={onClose}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
        >
          {/* flexShrink: with the keyboard up the backdrop is shorter than
              `maxHeight`, and the sheet must shrink (its body scrolls) rather
              than overflow off the top of the screen. */}
          <Animated.View style={{ flexShrink: 1, transform: [{ translateY }] }}>
            <RNPressable
              accessible={false}
              // Its backdrop is not an accessibility element, so VoiceOver closes the
              // sheet with the escape gesture instead.
              onAccessibilityEscape={onClose}
              onPress={() => {}}
              testID={testID}
              className="bg-surface-elevated border-t border-subtle"
              style={{
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                flexShrink: 1,
                paddingBottom: insets.bottom + 12,
                maxHeight: windowHeight * maxHeightRatio,
              }}
            >
              <View {...dragHandlers}>
                <RNPressable onPress={onClose} className="items-center pt-3 pb-1 active:opacity-60">
                  <View
                    style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1' }}
                  />
                </RNPressable>
                <HStack gap={3} className="items-center px-5 pt-2 pb-1">
                  {title ? (
                    <Text tone="primary" className="flex-1 font-semibold" style={{ fontSize: 17 }}>
                      {title}
                    </Text>
                  ) : (
                    <View className="flex-1" />
                  )}
                  <RNPressable
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={closeLabel}
                    testID={testID ? `${testID}-close` : undefined}
                    hitSlop={12}
                    className="active:opacity-60"
                  >
                    <Ionicons name="close" size={iconSizes.lg} color="#94a3b8" />
                  </RNPressable>
                </HStack>
              </View>
              {children}
              {footer}
            </RNPressable>
          </Animated.View>
        </RNPressable>
      </KeyboardAvoider>
    </Modal>
  );
}

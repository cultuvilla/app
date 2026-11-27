import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  Modal,
  PanResponder,
  Pressable as RNPressable,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@cultuvilla/shared/design-system';
import { BlockingOverlayHost, useBlockingOverlayActive } from './BlockingOverlay';
import { HStack } from './HStack';
import { KeyboardAvoider } from './KeyboardAvoider';
import { Text } from './Text';

/** Drag distance (px) past which a release dismisses instead of springing back. */
const DISMISS_DISTANCE = 90;
/** On a short sheet, this share of its height is far enough. */
const DISMISS_SHARE = 0.25;
/** Fling velocity that dismisses regardless of how far the sheet was dragged. */
const DISMISS_VELOCITY = 0.6;

/**
 * Decide what releasing a downward drag means. Pure so the rule is
 * unit-testable — PanResponder's gesture state cannot be driven in jest.
 *
 * Either a long enough pull or a fast enough flick dismisses; a short, slow
 * drag springs the sheet back. "Long enough" shrinks with the sheet: a short
 * sheet sits near the bottom edge, where a finger has little room to travel —
 * the iOS run of the report sheet's "Gracias" state sprang back on a full drag.
 */
export function shouldDismissOnRelease(dy: number, vy: number, sheetHeight?: number): boolean {
  const distance = sheetHeight ? Math.min(DISMISS_DISTANCE, sheetHeight * DISMISS_SHARE) : DISMISS_DISTANCE;
  return dy > distance || vy > DISMISS_VELOCITY;
}

/**
 * The drag-down-to-close gesture every sheet shares. Spread `panHandlers` on
 * the area that should grab (the handle and the title, never the scrolling
 * body) and put `translateY` on the sheet's `style` transform.
 */
export function useDragToDismiss(onClose: () => void, visible: boolean) {
  const translateY = useRef(new Animated.Value(0)).current;
  // PanResponder is built once, so it must reach `onClose` through a ref rather
  // than closing over the first render's prop.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const heightRef = useRef(0);
  // Where the finger first touched. `gestureState.dy` counts only from the
  // grant, which comes after the slop, so on a short sheet near the bottom
  // edge it under-reports a full drag (seen on both platforms in e2e).
  const startYRef = useRef<number | null>(null);

  // A dismissed-by-drag sheet keeps its offset; reset it so the next open does
  // not start off-screen.
  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible, translateY]);

  const pan = useRef(
    PanResponder.create({
      // Downward-only, and clearly more vertical than horizontal. Capture as
      // well as bubble: the handle is itself a Pressable (tap closes), and it
      // already holds the touch by the time the finger moves.
      onStartShouldSetPanResponderCapture: (e) => {
        startYRef.current = e.nativeEvent.pageY;
        return false;
      },
      onMoveShouldSetPanResponderCapture: (_e, g) => g.dy > 8 && g.dy > Math.abs(g.dx),
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 8 && g.dy > Math.abs(g.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (e, g) => {
        const start = startYRef.current;
        const travel = start === null ? g.dy : Math.max(g.dy, e.nativeEvent.pageY - start);
        startYRef.current = null;
        if (shouldDismissOnRelease(travel, g.vy, heightRef.current || undefined)) {
          closeRef.current();
          return;
        }
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  /** Put on the sheet's outer view so a short sheet needs a shorter drag. */
  const onLayout = (e: LayoutChangeEvent) => {
    heightRef.current = e.nativeEvent.layout.height;
  };

  return { translateY, panHandlers: pan.panHandlers, onLayout };
}

/**
 * The grab bar at the top of every sheet, and its only visible way out: drag
 * it down, or tap it. It is the accessible "close" button too, so VoiceOver and
 * TalkBack users have a named control where sighted users have the bar.
 */
export function SheetHandle({ onClose, label, testID }: { onClose: () => void; label: string; testID?: string }) {
  return (
    <RNPressable
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      hitSlop={{ top: 8, bottom: 8, left: 40, right: 40 }}
      className="items-center pt-3 pb-2 active:opacity-60"
    >
      <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.light.fg.chevron }} />
    </RNPressable>
  );
}

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Shown under the grab bar; omit for a bare sheet. */
  title?: string;
  /** Accessibility label for the grab bar, which closes the sheet when tapped. */
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
 * There is no ✕ (decided 2026-11-20, Álvaro): the grab bar is the way out.
 * Drag it (or the title) down, or tap it. The backdrop tap, Android's back
 * button and VoiceOver's escape gesture also close it.
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
  const { translateY, panHandlers, onLayout } = useDragToDismiss(onClose, visible);
  const blocking = useBlockingOverlayActive();

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={blocking ? () => {} : onClose}>
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
          <Animated.View onLayout={onLayout} style={{ flexShrink: 1, transform: [{ translateY }] }}>
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
              <View {...panHandlers} testID={testID ? `${testID}-grab` : undefined}>
                <SheetHandle onClose={onClose} label={closeLabel} testID={testID ? `${testID}-handle` : undefined} />
                {title ? (
                  <HStack gap={3} className="items-center px-5 pb-1">
                    <Text tone="primary" className="flex-1 font-semibold" style={{ fontSize: 17 }}>
                      {title}
                    </Text>
                  </HStack>
                ) : null}
              </View>
              {children}
              {footer}
            </RNPressable>
          </Animated.View>
        </RNPressable>
      </KeyboardAvoider>
      <BlockingOverlayHost />
    </Modal>
  );
}

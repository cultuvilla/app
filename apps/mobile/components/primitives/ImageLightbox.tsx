import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable as RNPressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  GestureDetector,
  GestureHandlerRootView,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { iconSizes } from '@cultuvilla/shared/design-system';
import { RemoteImage } from './RemoteImage';
import {
  DOUBLE_TAP_SCALE,
  MIN_SCALE,
  clampOffset,
  clampScale,
  dismissBackdropOpacity,
  fitSize,
  nextScaleOnDoubleTap,
  offsetCenteringPoint,
  offsetForScaleAbout,
  panBounds,
  panResistance,
  shouldDismissOnRelease,
  softClampScale,
  type Point,
  type Size,
} from '../../lib/imageZoom';

/**
 * Full-screen image viewer: pinch to zoom, drag to pan with momentum, double-tap
 * to toggle between fit and 3x, swipe down (or ✕) to dismiss. All the geometry
 * lives in `lib/imageZoom.ts` so it stays unit-testable; this file is the wiring.
 *
 * The viewer requests the `original` rendition, over the `card` the screen has
 * already cached so something shows at once: zooming into the downscaled `card`
 * would only magnify mush.
 */
export type ImageLightboxProps = {
  uri: string;
  onClose: () => void;
  /** Accessibility label for the ✕ button. */
  closeLabel: string;
  accessibilityLabel?: string;
  /** Where in the picture (0–1 on each axis) to open zoomed, or fitted if null. */
  zoomAt?: Point | null;
};

const SETTLE_SPRING = { damping: 22, stiffness: 220, overshootClamping: true };

export function ImageLightbox({
  uri,
  onClose,
  closeLabel,
  accessibilityLabel,
  zoomAt = null,
}: ImageLightboxProps) {
  const windowSize = useWindowDimensions();
  // Read the context directly rather than through `useSafeAreaInsets`, which
  // throws when no provider is above it. The viewer is mounted from leaf image
  // components all over the app (and from tests that render one in isolation);
  // a missing provider should cost the ✕ button its inset, not crash the screen.
  const insets = useContext(SafeAreaInsetsContext);
  const topInset = insets?.top ?? 0;

  // Measured: on Android a translucent Modal is not the size of the window, and
  // gesture coordinates are relative to this area.
  const [measured, setMeasured] = useState<Size | null>(null);
  const viewport = measured ?? { width: windowSize.width, height: windowSize.height };

  const [natural, setNatural] = useState<Size | null>(null);
  const displayed = useMemo(() => fitSize(natural ?? viewport, viewport), [natural, viewport]);

  const scale = useSharedValue(MIN_SCALE);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const backdrop = useSharedValue(1);
  const activeGestures = useSharedValue(0);
  const displayedSize = useSharedValue(displayed);
  const viewportSize = useSharedValue(viewport);

  useEffect(() => {
    displayedSize.value = displayed;
    viewportSize.value = viewport;
  }, [displayed, viewport, displayedSize, viewportSize]);

  const openedZoomed = useRef(false);
  useEffect(() => {
    if (!zoomAt || !natural || openedZoomed.current) return;
    openedZoomed.current = true;
    const offset = clampOffset(
      offsetCenteringPoint(zoomAt, displayed, DOUBLE_TAP_SCALE),
      displayed,
      viewport,
      DOUBLE_TAP_SCALE,
    );
    scale.value = withSpring(DOUBLE_TAP_SCALE, SETTLE_SPRING);
    translateX.value = withSpring(offset.x, SETTLE_SPRING);
    translateY.value = withSpring(offset.y, SETTLE_SPRING);
  }, [zoomAt, natural, displayed, viewport, scale, translateX, translateY]);

  const settle = (velocityX: number, velocityY: number) => {
    'worklet';
    const rest = clampScale(scale.value);
    const current = { x: translateX.value, y: translateY.value };
    const target =
      rest <= MIN_SCALE
        ? { x: 0, y: 0 }
        : clampOffset(current, displayedSize.value, viewportSize.value, rest);
    const bounds = panBounds(displayedSize.value, viewportSize.value, rest);
    backdrop.value = withTiming(1, { duration: 140 });
    scale.value = withSpring(rest, SETTLE_SPRING);
    // A flick inside the bounds carries on; anything past them springs back.
    translateX.value =
      target.x === current.x && rest > MIN_SCALE
        ? withDecay({ velocity: velocityX, clamp: [-bounds.x, bounds.x] })
        : withSpring(target.x, SETTLE_SPRING);
    translateY.value =
      target.y === current.y && rest > MIN_SCALE
        ? withDecay({ velocity: velocityY, clamp: [-bounds.y, bounds.y] })
        : withSpring(target.y, SETTLE_SPRING);
  };

  const pan = usePanGesture({
    onActivate: () => {
      'worklet';
      activeGestures.value += 1;
      cancelAnimation(translateX);
      cancelAnimation(translateY);
    },
    onUpdate: (e) => {
      'worklet';
      if (scale.value <= MIN_SCALE + 0.01) {
        // Fitted: a vertical drag is the dismiss gesture, tracked by the image
        // itself so the picture follows the finger.
        translateY.value += e.changeY;
        backdrop.value = dismissBackdropOpacity(translateY.value, viewportSize.value.height);
        return;
      }
      const bounds = panBounds(displayedSize.value, viewportSize.value, scale.value);
      translateX.value += e.changeX * panResistance(translateX.value, bounds.x);
      translateY.value += e.changeY * panResistance(translateY.value, bounds.y);
    },
    onDeactivate: (e) => {
      'worklet';
      activeGestures.value -= 1;
      if (activeGestures.value > 0) return;
      if (shouldDismissOnRelease(translateY.value, e.velocityY, scale.value)) {
        backdrop.value = withTiming(0, { duration: 160 });
        translateY.value = withTiming(viewportSize.value.height, { duration: 160 }, (done) => {
          if (done) scheduleOnRN(onClose);
        });
        return;
      }
      settle(e.velocityX, e.velocityY);
    },
  });

  const pinch = usePinchGesture({
    onActivate: () => {
      'worklet';
      activeGestures.value += 1;
      cancelAnimation(scale);
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      backdrop.value = 1;
    },
    onUpdate: (e) => {
      'worklet';
      const next = softClampScale(scale.value * e.scaleChange);
      const offset = offsetForScaleAbout(
        { x: e.focalX - viewportSize.value.width / 2, y: e.focalY - viewportSize.value.height / 2 },
        { x: translateX.value, y: translateY.value },
        scale.value,
        next,
      );
      scale.value = next;
      translateX.value = offset.x;
      translateY.value = offset.y;
    },
    onDeactivate: () => {
      'worklet';
      activeGestures.value -= 1;
      if (activeGestures.value > 0) return;
      settle(0, 0);
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: (e) => {
      'worklet';
      const next = nextScaleOnDoubleTap(scale.value);
      const offset =
        next <= MIN_SCALE
          ? { x: 0, y: 0 }
          : clampOffset(
              offsetForScaleAbout(
                { x: e.x - viewportSize.value.width / 2, y: e.y - viewportSize.value.height / 2 },
                { x: translateX.value, y: translateY.value },
                scale.value,
                next,
              ),
              displayedSize.value,
              viewportSize.value,
              next,
            );
      scale.value = withSpring(next, SETTLE_SPRING);
      translateX.value = withSpring(offset.x, SETTLE_SPRING);
      translateY.value = withSpring(offset.y, SETTLE_SPRING);
    },
  });

  const gestures = useSimultaneousGestures(pan, pinch, doubleTap);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const stageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const handleNaturalSize = (width: number, height: number) => {
    setNatural({ width, height });
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* A Modal is its own native root, outside the app's gesture root. */}
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
        <GestureDetector gesture={gestures}>
          <View
            style={styles.touchArea}
            collapsable={false}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setMeasured({ width, height });
            }}
          >
            <Animated.View
              style={[{ width: displayed.width, height: displayed.height }, stageStyle]}
              testID="image-lightbox-stage"
            >
              <RemoteImage
                uri={uri}
                variant="card"
                style={StyleSheet.absoluteFill}
                contentFit="contain"
                transitionMs={0}
                onNaturalSize={handleNaturalSize}
              />
              <RemoteImage
                uri={uri}
                variant="original"
                style={StyleSheet.absoluteFill}
                contentFit="contain"
                allowDownscaling={false}
                onNaturalSize={handleNaturalSize}
                accessibilityLabel={accessibilityLabel}
                testID="image-lightbox-image"
              />
            </Animated.View>
          </View>
        </GestureDetector>
        <RNPressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          testID="image-lightbox-close"
          style={[styles.close, { top: topInset + 8 }]}
        >
          <Ionicons name="close" size={iconSizes.md} color="#ffffff" />
        </RNPressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { backgroundColor: '#000000' },
  touchArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  close: {
    position: 'absolute',
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
});

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable as RNPressable, type GestureResponderEvent } from 'react-native';
import type { ImageContentFit } from 'expo-image';
import { GestureDetector, usePinchGesture } from 'react-native-gesture-handler';
import Animated, {
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { ImageVariant } from '@cultuvilla/shared/utils';
import { useT } from '../../lib/i18n';
import {
  DOUBLE_TAP_MS,
  clampScale,
  inPlaceTranslation,
  isDoubleTap,
  type Point,
} from '../../lib/imageZoom';
import { ImageLightbox } from './ImageLightbox';
import { useImageZoomOverlay, type ImageZoomOverlayValue } from './ImageZoomOverlay';

/**
 * Makes a rendered image zoomable where it sits. Pinching grows it over the page
 * under the fingers and letting go sends it back; a tap opens the full-screen
 * viewer, where a picture stays zoomed to be read, and a double-tap opens it
 * already zoomed on the spot tapped.
 *
 * Wraps the image the screen already renders rather than replacing it, so the
 * layout, cropping and variant choice of the surrounding surface are untouched.
 * `uri` is normally the same source the child renders.
 */
export type ZoomableImageProps = {
  /** Image to zoom. `null` renders the child with no gestures. */
  uri: string | null;
  children: ReactNode;
  /** Describes the picture, e.g. the event's title. */
  accessibilityLabel?: string;
  /** How the child fits its frame, so the pinched copy lines up with it. */
  contentFit?: ImageContentFit;
  /** The rendition the child shows: the copy starts from it, already cached. */
  previewVariant?: ImageVariant | 'original';
  testID?: string;
};

type OpenViewer = { zoomAt: Point | null };

export function ZoomableImage({
  uri,
  children,
  accessibilityLabel,
  contentFit = 'cover',
  previewVariant = 'card',
  testID,
}: ZoomableImageProps) {
  const { t } = useT();
  const overlay = useImageZoomOverlay();
  const [viewer, setViewer] = useState<OpenViewer | null>(null);
  const size = useRef({ width: 0, height: 0 });
  const lastTapAt = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A pinch's first finger is also a press on the Pressable below it.
  const pinchedSincePressIn = useRef(false);

  useEffect(
    () => () => {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    },
    [],
  );

  if (!uri) return <>{children}</>;

  const handlePress = (e: GestureResponderEvent) => {
    if (pinchedSincePressIn.current) return;
    const now = Date.now();
    if (isDoubleTap(lastTapAt.current, now)) {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      lastTapAt.current = 0;
      const { width, height } = size.current;
      const { locationX, locationY } = e.nativeEvent;
      setViewer({
        zoomAt: {
          x: width > 0 ? locationX / width : 0.5,
          y: height > 0 ? locationY / height : 0.5,
        },
      });
      return;
    }
    lastTapAt.current = now;
    singleTapTimer.current = setTimeout(() => {
      lastTapAt.current = 0;
      setViewer({ zoomAt: null });
    }, DOUBLE_TAP_MS);
  };

  const target = (
    <RNPressable
      onPressIn={() => {
        pinchedSincePressIn.current = false;
      }}
      onPress={handlePress}
      onLayout={(e) => {
        size.current = e.nativeEvent.layout;
      }}
      accessibilityRole="imagebutton"
      accessibilityLabel={accessibilityLabel ?? t('common.imageViewer.open')}
      accessibilityHint={t('common.imageViewer.hint')}
      testID={testID ?? 'zoomable-image'}
    >
      {children}
    </RNPressable>
  );

  return (
    <>
      {overlay ? (
        <InPlacePinch
          overlay={overlay}
          uri={uri}
          contentFit={contentFit}
          previewVariant={previewVariant}
          onPinch={() => {
            pinchedSincePressIn.current = true;
          }}
        >
          {target}
        </InPlacePinch>
      ) : (
        target
      )}
      {/* Mounted only while open: a screen can hold dozens of these wrappers,
          and each idle viewer would otherwise carry a Modal and its gestures
          for a picture nobody has tapped. */}
      {viewer ? (
        <ImageLightbox
          uri={uri}
          zoomAt={viewer.zoomAt}
          onClose={() => {
            setViewer(null);
          }}
          closeLabel={t('common.imageViewer.close')}
          accessibilityLabel={accessibilityLabel}
        />
      ) : null}
    </>
  );
}

const SETTLE_SPRING = { damping: 24, stiffness: 260, overshootClamping: true };

let lastSessionId = 0;

function InPlacePinch({
  overlay,
  uri,
  contentFit,
  previewVariant,
  onPinch,
  children,
}: {
  overlay: ImageZoomOverlayValue;
  uri: string;
  contentFit: ImageContentFit;
  previewVariant: ImageVariant | 'original';
  onPinch: () => void;
  children: ReactNode;
}) {
  const { begin, finish, visibleId, frame, scale, translateX, translateY } = overlay;
  const [id] = useState(() => {
    lastSessionId += 1;
    return lastSessionId;
  });
  const ref = useAnimatedRef<Animated.View>();
  const pinching = useSharedValue(false);
  const focalStart = useSharedValue<Point>({ x: 0, y: 0 });

  const startSession = () => {
    onPinch();
    begin({ id, uri, previewVariant, contentFit });
  };

  const pinch = usePinchGesture({
    onActivate: (e) => {
      'worklet';
      const measured = measure(ref);
      if (!measured) return;
      frame.value = {
        x: measured.pageX,
        y: measured.pageY,
        width: measured.width,
        height: measured.height,
      };
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      focalStart.value = { x: e.focalX, y: e.focalY };
      pinching.value = true;
      scheduleOnRN(startSession);
    },
    onUpdate: (e) => {
      'worklet';
      if (!pinching.value) return;
      const next = clampScale(e.scale);
      const { width, height } = frame.value;
      const offset = inPlaceTranslation(
        focalStart.value,
        { x: e.focalX, y: e.focalY },
        { x: width / 2, y: height / 2 },
        next,
      );
      scale.value = next;
      translateX.value = offset.x;
      translateY.value = offset.y;
    },
    onDeactivate: () => {
      'worklet';
      if (!pinching.value) return;
      pinching.value = false;
      // The page can still have moved a little before the scroll lock landed.
      const measured = measure(ref);
      const restX = measured ? measured.pageX - frame.value.x : 0;
      const restY = measured ? measured.pageY - frame.value.y : 0;
      scale.value = withSpring(1, SETTLE_SPRING);
      translateX.value = withSpring(restX, SETTLE_SPRING);
      translateY.value = withSpring(restY, SETTLE_SPRING, (settled) => {
        if (settled) scheduleOnRN(finish);
      });
    },
  });

  const hiddenWhileCopied = useAnimatedStyle(() => ({
    opacity: visibleId.value === id ? 0 : 1,
  }));

  return (
    <GestureDetector gesture={pinch}>
      <Animated.View ref={ref} collapsable={false} style={hiddenWhileCopied}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

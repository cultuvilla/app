import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import type { ImageContentFit } from 'expo-image';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import type { ImageVariant } from '@cultuvilla/shared/utils';
import { RemoteImage } from './RemoteImage';
import { inPlaceBackdropOpacity } from '../../lib/imageZoom';

/**
 * The layer a picture grows into when pinched in place.
 *
 * A ScrollView clips its children and the header sits above them, so a picture
 * transformed where it lives would be cut off at the first edge it reached. It
 * is drawn here instead, at the app root, over the frame `ZoomableImage`
 * measured, and the gesture stays on the original view.
 */
export type ZoomSession = {
  id: number;
  uri: string;
  previewVariant: ImageVariant | 'original';
  contentFit: ImageContentFit;
};

export type ZoomFrame = { x: number; y: number; width: number; height: number };

export type ImageZoomOverlayValue = {
  begin: (session: ZoomSession) => void;
  finish: () => void;
  /** Session whose picture is on screen here, 0 for none. Its original hides. */
  visibleId: SharedValue<number>;
  frame: SharedValue<ZoomFrame>;
  scale: SharedValue<number>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
};

const ImageZoomOverlayContext = createContext<ImageZoomOverlayValue | null>(null);
const ZoomingContext = createContext(false);

/** `null` outside the provider, where a picture still opens on tap. */
export function useImageZoomOverlay(): ImageZoomOverlayValue | null {
  return useContext(ImageZoomOverlayContext);
}

/**
 * For a ScrollView holding zoomable pictures. Both platforms scroll with two
 * fingers, so without this the page slides away under a pinch.
 */
export function useScrollEnabledWhileZooming(): boolean {
  return !useContext(ZoomingContext);
}

export function ImageZoomOverlayProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ZoomSession | null>(null);
  const visibleId = useSharedValue(0);
  const frame = useSharedValue<ZoomFrame>({ x: 0, y: 0, width: 0, height: 0 });
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const finish = useCallback(() => {
    visibleId.value = 0;
    setSession(null);
  }, [visibleId]);

  const value = useMemo(
    () => ({ begin: setSession, finish, visibleId, frame, scale, translateX, translateY }),
    [finish, visibleId, frame, scale, translateX, translateY],
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: visibleId.value === 0 ? 0 : inPlaceBackdropOpacity(scale.value),
  }));
  const pictureStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: frame.value.x,
    top: frame.value.y,
    width: frame.value.width,
    height: frame.value.height,
    opacity: visibleId.value === 0 ? 0 : 1,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <ImageZoomOverlayContext.Provider value={value}>
      <ZoomingContext.Provider value={session !== null}>{children}</ZoomingContext.Provider>
      {session ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="image-zoom-overlay">
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
          <Animated.View style={pictureStyle}>
            {/* The swap waits for this load, or the picture would blink out
                between hiding the original and drawing its copy. */}
            <RemoteImage
              uri={session.uri}
              variant={session.previewVariant}
              style={StyleSheet.absoluteFill}
              contentFit={session.contentFit}
              transitionMs={0}
              onNaturalSize={() => {
                visibleId.value = session.id;
              }}
            />
            {session.previewVariant === 'original' ? null : (
              <RemoteImage
                uri={session.uri}
                variant="original"
                style={StyleSheet.absoluteFill}
                contentFit={session.contentFit}
                allowDownscaling={false}
              />
            )}
          </Animated.View>
        </View>
      ) : null}
    </ImageZoomOverlayContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#000000' },
});

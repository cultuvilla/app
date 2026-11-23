import { act, render, fireEvent } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DOUBLE_TAP_MS } from '../../../lib/imageZoom';
import { ZoomableImage } from '../ZoomableImage';
import { ImageZoomOverlayProvider } from '../ImageZoomOverlay';

// expo-image is a native module; RN's View records the props it was handed so
// the viewer's variant choice can be asserted (same stand-in as RemoteImage's).
jest.mock('expo-image', () => ({ Image: require('react-native').View }));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
// Deliberately NO SafeAreaProvider and no safe-area mock: the viewer is opened
// from leaf images all over the app, so it must survive a tree without one.

const BUCKET = 'villa-events.firebasestorage.app';
const ORIGINAL = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(
  'municipalities/28013/events/e1/image/abc.jpg',
)}?alt=media&token=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`;

function renderZoomable(uri: string | null) {
  return render(
    <ZoomableImage uri={uri} accessibilityLabel="Fiestas de San Roque">
      <View testID="child">
        <Text>flyer</Text>
      </View>
    </ZoomableImage>,
  );
}

function tap(tree: ReturnType<typeof render>) {
  fireEvent.press(tree.getByTestId('zoomable-image'), {
    nativeEvent: { locationX: 10, locationY: 10 },
  });
}

function tapAndWait(tree: ReturnType<typeof render>) {
  tap(tree);
  act(() => {
    jest.advanceTimersByTime(DOUBLE_TAP_MS);
  });
}

describe('ZoomableImage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not open the viewer until the image is tapped', () => {
    const tree = renderZoomable(ORIGINAL);
    expect(tree.getByTestId('child')).toBeTruthy();
    expect(tree.queryByTestId('image-lightbox-stage')).toBeNull();
  });

  it('opens the full-screen viewer on tap', () => {
    const tree = renderZoomable(ORIGINAL);
    tapAndWait(tree);
    expect(tree.getByTestId('image-lightbox-stage')).toBeTruthy();
  });

  it('shows the original rendition in the viewer, not the downscaled card', () => {
    const tree = renderZoomable(ORIGINAL);
    tapAndWait(tree);
    const props = tree.getByTestId('image-lightbox-image').props as { source: { uri: string } };
    expect(props.source.uri).toBe(ORIGINAL);
  });

  it('waits out a possible double-tap before opening on a single tap', () => {
    const tree = renderZoomable(ORIGINAL);
    tap(tree);
    expect(tree.queryByTestId('image-lightbox-stage')).toBeNull();
  });

  it('opens at once on a double-tap', () => {
    const tree = renderZoomable(ORIGINAL);
    tap(tree);
    tap(tree);
    expect(tree.getByTestId('image-lightbox-stage')).toBeTruthy();
  });

  it('takes the same tap inside the app, where the pinch is wired', () => {
    const tree = render(
      <GestureHandlerRootView>
        <ImageZoomOverlayProvider>
          <ZoomableImage uri={ORIGINAL}>
            <View testID="child" />
          </ZoomableImage>
        </ImageZoomOverlayProvider>
      </GestureHandlerRootView>,
    );
    tapAndWait(tree);
    expect(tree.getByTestId('image-lightbox-stage')).toBeTruthy();
    expect(tree.queryByTestId('image-zoom-overlay')).toBeNull();
  });

  it('closes again from the ✕ button', () => {
    const tree = renderZoomable(ORIGINAL);
    tapAndWait(tree);
    fireEvent.press(tree.getByTestId('image-lightbox-close'));
    expect(tree.queryByTestId('image-lightbox-stage')).toBeNull();
  });

  it('renders the child bare when there is no image to zoom into', () => {
    const tree = renderZoomable(null);
    expect(tree.getByTestId('child')).toBeTruthy();
    expect(tree.queryByTestId('zoomable-image')).toBeNull();
  });
});

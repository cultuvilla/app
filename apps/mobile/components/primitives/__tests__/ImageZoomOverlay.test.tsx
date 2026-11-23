import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import {
  ImageZoomOverlayProvider,
  useImageZoomOverlay,
  useScrollEnabledWhileZooming,
  type ImageZoomOverlayValue,
} from '../ImageZoomOverlay';

// expo-image is a native module; RN's View records the props it was handed.
jest.mock('expo-image', () => ({ Image: require('react-native').View }));

const URI = 'https://example.test/flyer.jpg';

function renderOverlay() {
  let overlay: ImageZoomOverlayValue | null = null;
  function Consumer() {
    overlay = useImageZoomOverlay();
    return <Text testID="scroll">{String(useScrollEnabledWhileZooming())}</Text>;
  }
  const tree = render(
    <ImageZoomOverlayProvider>
      <Consumer />
    </ImageZoomOverlayProvider>,
  );
  return { tree, overlay: () => overlay as unknown as ImageZoomOverlayValue };
}

describe('ImageZoomOverlay', () => {
  it('draws nothing and leaves scrolling alone until a pinch begins', () => {
    const { tree } = renderOverlay();
    expect(tree.queryByTestId('image-zoom-overlay')).toBeNull();
    expect(tree.getByTestId('scroll').props.children).toBe('true');
  });

  it('draws the copy and locks scrolling for the length of a pinch', () => {
    const { tree, overlay } = renderOverlay();
    act(() => {
      overlay().begin({ id: 1, uri: URI, previewVariant: 'card', contentFit: 'cover' });
    });
    expect(tree.getByTestId('image-zoom-overlay')).toBeTruthy();
    expect(tree.getByTestId('scroll').props.children).toBe('false');

    act(() => {
      overlay().finish();
    });
    expect(tree.queryByTestId('image-zoom-overlay')).toBeNull();
    expect(tree.getByTestId('scroll').props.children).toBe('true');
  });
});

describe('useImageZoomOverlay', () => {
  it('is null outside the provider, where a picture falls back to tap only', () => {
    let overlay: ImageZoomOverlayValue | null | undefined;
    function Consumer() {
      overlay = useImageZoomOverlay();
      return null;
    }
    render(<Consumer />);
    expect(overlay).toBeNull();
  });
});

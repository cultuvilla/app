import { useCallback, useMemo, useState } from 'react';
import type { StyleProp } from 'react-native';
import { Image, type ImageContentFit, type ImageStyle } from 'expo-image';
import { variantImageURL, type ImageVariant } from '@cultuvilla/shared/utils';

/**
 * Every remote image in the app goes through here.
 *
 * Three things it buys over React Native's `<Image>`:
 *
 * 1. **A real cache.** `expo-image` keeps a memory *and* disk cache, so an
 *    image survives a tab switch and an app restart. RN's Image has neither on
 *    the paths we use, which is why the feed re-downloaded everything on every
 *    visit.
 * 2. **The right pixels.** The URL is rewritten to the downscaled variant that
 *    `generateImageVariants` wrote next to the original, so a card fetches tens
 *    of kilobytes instead of megabytes. A variant that does not exist yet 404s
 *    and we fall back to the original — never a broken image.
 * 3. **Natural size without a second fetch.** `onLoad` carries the decoded
 *    dimensions, so callers that need the aspect ratio no longer issue a
 *    separate `Image.getSize` request for the same bytes.
 */
export type RemoteImageProps = {
  uri: string;
  /** Which rendition to request. `'original'` opts out of the rewrite. */
  variant: ImageVariant | 'original';
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  /** Called once the image decodes, with its real pixel dimensions. */
  onNaturalSize?: (width: number, height: number) => void;
  /** Cross-fade duration in ms. 0 disables it (avatars, escudos). */
  transitionMs?: number;
  /**
   * Off for a picture that gets zoomed by a transform: otherwise the bitmap is
   * decoded at the view's size and scaling it up only magnifies that.
   */
  allowDownscaling?: boolean;
  accessibilityLabel?: string;
  testID?: string;
};

export function RemoteImage({
  uri,
  variant,
  style,
  contentFit = 'cover',
  onNaturalSize,
  transitionMs = 160,
  allowDownscaling = true,
  accessibilityLabel,
  testID,
}: RemoteImageProps) {
  // Reset by keying off `uri`: a recycled row pointing at a new image must get
  // a fresh attempt at the variant rather than inheriting the previous row's
  // fallback. Comparing against the rendered uri is cheaper than an effect.
  const [fellBackFor, setFellBackFor] = useState<string | null>(null);
  const useOriginal = variant === 'original' || fellBackFor === uri;

  const source = useMemo(
    () => (useOriginal ? uri : variantImageURL(uri, variant)),
    [uri, variant, useOriginal],
  );

  const handleError = useCallback(() => {
    // Only the variant is worth retrying as the original; if the original
    // itself failed there is nothing left to try, and re-setting the same
    // state is a no-op so this cannot loop.
    setFellBackFor(uri);
  }, [uri]);

  const handleLoad = useCallback(
    (event: { source?: { width: number; height: number } | null }) => {
      const size = event.source;
      if (!onNaturalSize || !size) return;
      if (size.width > 0 && size.height > 0) onNaturalSize(size.width, size.height);
    },
    [onNaturalSize],
  );

  return (
    <Image
      source={{ uri: source }}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      // Without this a FlatList row that scrolls back into view briefly shows
      // the previous row's image while the new one decodes.
      recyclingKey={source}
      transition={transitionMs}
      allowDownscaling={allowDownscaling}
      onError={handleError}
      onLoad={handleLoad}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    />
  );
}

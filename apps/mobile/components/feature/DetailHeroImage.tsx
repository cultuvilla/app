import { View } from 'react-native';
import { colors } from '@cultuvilla/shared/design-system';
import { Ionicons } from '@expo/vector-icons';
import { NaturalImage } from '../primitives/NaturalImage';
import { ZoomableImage } from '../primitives/ZoomableImage';

/**
 * Full-bleed hero image ("flyer") shown directly below the EntityDetailHeader
 * on every entity detail screen. Follows the FeedCard image chain: the item's
 * own image → the village cover photo (`fallbackImageUri`) → a tinted
 * placeholder with `fallbackIcon`. A real photo is shown at its natural aspect
 * ratio (never cropped); only the placeholder uses the fixed 4:3 box. Back /
 * share / edit affordances live in the header bar above, not on this image.
 */

// Width:height for the placeholder fallback (matches FeedCard's card image).
const ASPECT_RATIO = 4 / 3;
const PLACEHOLDER_BG = colors.light.bg.subtle;

export type DetailHeroImageProps = {
  imageUri: string | null;
  fallbackImageUri?: string | null;
  fallbackIcon: keyof typeof Ionicons.glyphMap;
  /** Entity title, used to describe the picture to a screen reader. */
  accessibilityLabel?: string;
};

export function DetailHeroImage({
  imageUri,
  fallbackImageUri = null,
  fallbackIcon,
  accessibilityLabel,
}: DetailHeroImageProps) {
  const displayUri = imageUri ?? fallbackImageUri;
  return (
    <View style={{ width: '100%' }}>
      {displayUri ? (
        <ZoomableImage
          uri={displayUri}
          accessibilityLabel={accessibilityLabel}
          testID="hero-image-zoom"
        >
          <NaturalImage uri={displayUri} initialAspectRatio={ASPECT_RATIO} />
        </ZoomableImage>
      ) : (
        <View
          className="items-center justify-center"
          style={{ width: '100%', aspectRatio: ASPECT_RATIO, backgroundColor: PLACEHOLDER_BG }}
        >
          <Ionicons name={fallbackIcon} size={72} color={colors.light.fg['on-media']} />
        </View>
      )}
    </View>
  );
}

import { View, StyleSheet } from 'react-native';
import { RemoteImage } from './RemoteImage';
import { Text } from './Text';
import { ZoomableImage } from './ZoomableImage';

export interface EscudoProps {
  url: string | null | undefined;
  size?: number;
  /** First letter(s) of the municipality name, shown when `url` is null. */
  fallbackInitial?: string;
  /**
   * Render as a rounded square that fully covers its box (`resizeMode="cover"`)
   * instead of letterboxing inside it. Use for square-cropped manual escudos;
   * leave off for Wikidata heraldic shields, which `contain` so detail isn't cut.
   */
  fill?: boolean;
  /**
   * Opt in to tap-to-zoom. Off by default: most escudos sit in list rows and
   * pickers where a tap must select or navigate, not open a viewer. Turn it on
   * for the large identity escudo at the top of a village.
   */
  zoomable?: boolean;
  /** Municipality name, used to describe the escudo to a screen reader. */
  accessibilityLabel?: string;
}

/**
 * Square heraldic image for a municipality (coat of arms).
 *
 * `null` URL renders an initial-letter placeholder — ~38% of Spanish munis
 * have no escudo on Wikidata, so the empty state is common, not exceptional.
 *
 * Defaults to `resizeMode="contain"` so heraldic detail isn't cropped at small
 * sizes; pass `fill` for square images that should fill a rounded square.
 */
export function Escudo({
  url,
  size = 64,
  fallbackInitial,
  fill = false,
  zoomable = false,
  accessibilityLabel,
}: EscudoProps) {
  if (url) {
    const image = (
      // `original`: escudos are reference data, already resized to 256px and
      // already served immutably by scripts/upload-escudos.mjs, so there is no
      // variant to fetch. RemoteImage is still the right host — it brings the
      // memory + disk cache the raw RN Image lacked.
      <RemoteImage
        uri={url}
        variant="original"
        style={{
          width: size,
          height: size,
          borderRadius: fill ? Math.max(4, size * 0.18) : 0,
        }}
        contentFit={fill ? 'cover' : 'contain'}
        transitionMs={0}
      />
    );
    if (!zoomable) return image;
    return (
      <ZoomableImage
        uri={url}
        accessibilityLabel={accessibilityLabel}
        contentFit={fill ? 'cover' : 'contain'}
        previewVariant="original"
        testID="escudo-zoom"
      >
        {image}
      </ZoomableImage>
    );
  }
  return (
    <View
      style={[
        styles.placeholder,
        { width: size, height: size, borderRadius: Math.max(4, size * 0.1) },
      ]}
    >
      <Text variant={size >= 96 ? 'h2' : 'body'} tone="muted">
        {(fallbackInitial ?? '·').slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

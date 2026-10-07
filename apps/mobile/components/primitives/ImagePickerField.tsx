import { ActivityIndicator, Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@cultuvilla/shared/design-system';
import { Pressable } from './Pressable';

const ACCENT = colors.light.fg.accent;

export interface ImagePickerFieldProps {
  /** Preview URI of the picked/existing image, or null/undefined for the empty state. */
  uri?: string | null;
  onPress: () => void;
  /** Accessibility label (e.g. "Añadir imagen"). */
  label: string;
  /** Square side in px. Ignored when `width`/`height` are given. */
  size?: number;
  /** Explicit width (e.g. `'100%'` for a full-width cover). Overrides `size`. */
  width?: number | `${number}%`;
  /** Explicit height in px. Overrides `size`. */
  height?: number;
  /** How the image fills the card. `contain` keeps un-cropped art (e.g. Wikidata shields). */
  resizeMode?: 'cover' | 'contain';
  /** Shows a spinner overlay + disables the press while an upload is in flight. */
  loading?: boolean;
  testID?: string;
}

// Image input that reuses the dashed "add" card affordance from the pueblo tab
// (VillageSections.AddCard): an empty state shows a `+` on a dashed rounded
// square; once an image is picked it fills the same square. Replaces the old
// filled-circle Avatar picker so every image input reads as the same "add" card.
export function ImagePickerField({
  uri,
  onPress,
  label,
  size = 120,
  width,
  height,
  resizeMode = 'cover',
  loading = false,
  testID,
}: ImagePickerFieldProps) {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityLabel={label}
      testID={testID}
      className={`relative rounded-2xl overflow-hidden border items-center justify-center ${
        uri ? 'border-subtle' : 'border-dashed border-subtle'
      }`}
      style={{ width: w, height: h }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: w, height: h }} resizeMode={resizeMode} />
      ) : (
        <Ionicons name="add" size={44} color={ACCENT} />
      )}
      {loading ? (
        <View className="absolute inset-0 items-center justify-center bg-black/30">
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}
    </Pressable>
  );
}

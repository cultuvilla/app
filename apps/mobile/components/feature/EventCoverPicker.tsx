import { useState } from 'react';
import { Image } from 'react-native';
import type { ImageLoadEventData, NativeSyntheticEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@cultuvilla/shared/design-system';
import { Pressable } from '../primitives/Pressable';

const ACCENT = colors.light.fg.accent;
// Side of the empty-state "add" card (a bit smaller than a full-width square).
const EMPTY_SIZE = 120;

export interface EventCoverPickerProps {
  /** Preview URI of the picked/existing image, or null for the empty state. */
  uri?: string | null;
  onPress: () => void;
  /** Accessibility label (e.g. "Añadir imagen"). */
  label: string;
  testID?: string;
}

/**
 * Event cover picker. The flyer is uploaded at whatever resolution the user
 * picked, so the preview shows the WHOLE image at its natural aspect ratio
 * (nothing cropped or highlighted). When empty it shows a small dashed "add"
 * card matching the other image inputs.
 */
export function EventCoverPicker({ uri, onPress, label, testID }: EventCoverPickerProps) {
  // Natural ratio comes from the rendered image's onLoad (not Image.getSize,
  // which is imperative and fragile under the test mock); default 1 until known.
  const [ratio, setRatio] = useState(1);

  const onLoad = (e: NativeSyntheticEvent<ImageLoadEventData>) => {
    const src = e.nativeEvent?.source;
    if (src && src.width > 0 && src.height > 0) setRatio(src.width / src.height);
  };

  // Empty state: small dashed "add" card, matching the other image inputs.
  if (!uri) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityLabel={label}
        testID={testID}
        className="rounded-2xl overflow-hidden border border-dashed border-subtle items-center justify-center"
        style={{ width: EMPTY_SIZE, height: EMPTY_SIZE }}
      >
        <Ionicons name="add" size={44} color={ACCENT} />
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      testID={testID}
      className="rounded-2xl overflow-hidden border border-subtle"
      style={{ width: '100%', aspectRatio: ratio }}
    >
      <Image
        source={{ uri }}
        onLoad={onLoad}
        style={{ width: '100%', height: '100%' }}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
    </Pressable>
  );
}

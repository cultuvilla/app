import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes, spacing } from '@cultuvilla/shared/design-system';
import { ImagePickerField } from '../primitives/ImagePickerField';
import { Pressable } from '../primitives/Pressable';

const THUMB = 96;

export type MultiImagePickerRowProps = {
  uris: string[];
  onAddPress: () => void;
  onRemove: (index: number) => void;
  max?: number;
  adding?: boolean;
  addLabel: string;
  removeLabel: string;
  /** Names the add square (`<id>-add`) and each thumbnail's remove (`<id>-remove-<i>`). */
  testID?: string;
};

/**
 * Horizontal row of squared image thumbnails with a trailing dashed "+" square
 * (the "add" affordance sits to the right of the picked images and disappears
 * at `max`). Purely presentational: the parent owns pick/upload/remove state.
 * The first thumbnail is the cover by convention.
 */
export function MultiImagePickerRow({
  uris,
  onAddPress,
  onRemove,
  max = 5,
  adding = false,
  addLabel,
  removeLabel,
  testID,
}: MultiImagePickerRowProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        {uris.map((uri, i) => (
          <View key={uri} style={{ width: THUMB, height: THUMB }}>
            <ImagePickerField uri={uri} onPress={() => {}} label={uri} size={THUMB} />
            <Pressable
              onPress={() => onRemove(i)}
              accessibilityLabel={removeLabel}
              testID={testID ? `${testID}-remove-${i}` : undefined}
              className="absolute rounded-full bg-black/60 items-center justify-center"
              style={{ top: 4, right: 4, width: 24, height: 24 }}
            >
              <Ionicons name="close" size={iconSizes.sm} color={colors.light.fg['on-accent']} />
            </Pressable>
          </View>
        ))}
        {uris.length < max ? (
          <ImagePickerField
            uri={null}
            onPress={onAddPress}
            label={addLabel}
            size={THUMB}
            loading={adding}
            testID={testID ? `${testID}-add` : undefined}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

import { Ionicons } from '@expo/vector-icons';
import { Pressable } from '../primitives/Pressable';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';

export type HeaderIconButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
};

/** A single action affordance in the EntityDetailHeader bar (accent icon on the
 * neutral surface bar). The neutral-bar analogue of the old floating disc. */
export function HeaderIconButton({ icon, onPress, accessibilityLabel, testID }: HeaderIconButtonProps) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={accessibilityLabel} testID={testID} className="p-1 ml-2">
      <Ionicons name={icon} size={iconSizes.md} color={colors.light.fg.accent} />
    </Pressable>
  );
}

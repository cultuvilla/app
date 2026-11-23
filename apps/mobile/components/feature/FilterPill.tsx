import { Ionicons } from '@expo/vector-icons';
import { colors } from '@cultuvilla/shared/design-system';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';

// Pills are an Animated-free, inline-styled primitive so the ordago-style
// border/active-fill renders identically on the web build (NativeWind would
// otherwise be fine here, but matching ordago's exact pill metrics is easier
// in one place with raw style values).
const ACCENT = colors.light.fg.accent;
const ON_ACCENT = colors.light.fg['on-accent'];
const SURFACE_ELEVATED = colors.light.bg['surface-elevated'];

/**
 * Fixed pill height shared by every filter control (including the inline
 * search box) so the row keeps a constant height whether a pill shows a Text
 * label or a focused TextInput — a TextInput's intrinsic height is taller and
 * grows on focus, which would otherwise make the row jump.
 */
export const FILTER_PILL_HEIGHT = 36;

export type FilterPillProps = {
  label: string;
  /** Filled-accent appearance when the filter holds a non-default value. */
  active: boolean;
  onPress: () => void;
  /** Hide the trailing chevron (e.g. for a toggle pill that opens no sheet). */
  hideChevron?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
};

export function FilterPill({
  label,
  active,
  onPress,
  hideChevron = false,
  icon,
  testID,
}: FilterPillProps) {
  const fg = active ? ON_ACCENT : ACCENT;
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? ACCENT : SURFACE_ELEVATED,
        borderRadius: 24,
        borderWidth: 1.5,
        borderColor: ACCENT,
        height: FILTER_PILL_HEIGHT,
        paddingHorizontal: 16,
        marginRight: 8,
      }}
    >
      {icon ? (
        <Ionicons name={icon} size={15} color={fg} style={{ marginRight: 6 }} />
      ) : null}
      <Text variant="bodySm" style={{ color: fg, fontWeight: '700', marginRight: hideChevron ? 0 : 4 }}>
        {label}
      </Text>
      {hideChevron ? null : <Ionicons name="chevron-down" size={15} color={fg} />}
    </Pressable>
  );
}

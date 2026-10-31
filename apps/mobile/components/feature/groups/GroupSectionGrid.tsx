import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import type { GroupSection } from '@cultuvilla/shared/utils';
import { Pressable, Text } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { GROUP_SECTION_ICONS } from '../../../lib/orgs/groupSections';

/** A group's screens as a grid of buttons, three to a row, each with an optional count badge. */
export function GroupSectionGrid({
  sections,
  badges = {},
  onOpen,
  admin = false,
}: {
  sections: GroupSection[];
  badges?: Partial<Record<GroupSection, number>>;
  onOpen: (section: GroupSection) => void;
  admin?: boolean;
}) {
  const { t } = useT();
  const tint = admin ? colors.light.fg.secondary : colors.light.fg.accent;
  return (
    <View className="flex-row flex-wrap -mx-1">
      {sections.map((section) => {
        const badge = badges[section] ?? 0;
        const label = t(`groups.sections.${section}`);
        return (
          <View key={section} className="w-1/3 p-1">
            <Pressable
              testID={`group-section-${section}`}
              accessibilityRole="button"
              accessibilityLabel={badge > 0 ? t('groups.sections.withCount', { label, count: badge }) : label}
              onPress={() => onOpen(section)}
              className="bg-surface-elevated rounded-md shadow-sm items-center px-1 py-3 gap-2"
            >
              <View className={`rounded-md p-2 ${admin ? 'bg-secondary-subtle/40' : 'bg-accent-subtle/30'}`}>
                <Ionicons name={GROUP_SECTION_ICONS[section]} size={iconSizes.lg} color={tint} />
              </View>
              <Text variant="bodySm" className="text-center" numberOfLines={2}>
                {label}
              </Text>
              {badge > 0 ? (
                <View
                  className="absolute top-1 right-1 bg-accent rounded-full items-center justify-center px-1"
                  style={{ minWidth: 18, height: 18 }}
                  testID={`group-section-${section}-badge`}
                >
                  <Text variant="caption" tone="onAccent" style={{ fontSize: 11, lineHeight: 13 }}>
                    {badge > 99 ? '99+' : badge}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

import { ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import type { MyGroup } from '../../../lib/orgs/useMyGroups';
import { BottomSheet, HStack, Pressable, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';

/** Every group the user belongs to, with their role in it; opened from the group's name in the header. */
export function GroupSwitcherSheet({
  visible,
  groups,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  groups: MyGroup[];
  selectedId: string | null;
  onSelect: (orgId: string) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('groups.switcherLabel')} closeLabel={t('common.close')}>
      <ScrollView style={{ flexShrink: 1 }}>
        <VStack gap={1} className="px-5 pb-2">
          {groups.map(({ org, role }) => {
            const selected = org.id === selectedId;
            return (
              <Pressable
                key={org.id}
                testID={`group-switcher-${org.id}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onSelect(org.id)}
                className={`rounded-md px-3 py-3 ${selected ? 'bg-surface' : ''}`}
              >
                <HStack gap={3} align="center">
                  <VStack gap={0} className="flex-1">
                    <Text className={selected ? 'font-bold' : ''}>{org.name}</Text>
                    <Text variant="bodySm" tone="muted">
                      {t(role === 'admin' ? 'groups.roleAdmin' : 'groups.roleMember')}
                    </Text>
                  </VStack>
                  {selected ? <Ionicons name="checkmark" size={iconSizes.md} color={colors.light.fg.accent} /> : null}
                </HStack>
              </Pressable>
            );
          })}
        </VStack>
      </ScrollView>
    </BottomSheet>
  );
}

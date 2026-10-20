import { ScrollView } from 'react-native';
import type { MyGroup } from '../../../lib/orgs/useMyGroups';
import { Pressable, Text } from '../../primitives';
import { useT } from '../../../lib/i18n';

/** The user's groups as a row of chips. Not rendered with a single group. */
export function GroupSwitcher({
  groups,
  selectedId,
  onSelect,
}: {
  groups: MyGroup[];
  selectedId: string | null;
  onSelect: (orgId: string) => void;
}) {
  const { t } = useT();
  if (groups.length < 2) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={t('groups.switcherLabel')}
      contentContainerClassName="gap-2 px-4 py-2"
      testID="group-switcher"
    >
      {groups.map(({ org }) => {
        const selected = org.id === selectedId;
        return (
          <Pressable
            key={org.id}
            testID={`group-switcher-${org.id}`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onSelect(org.id)}
            className={`rounded-full px-4 py-2 border ${selected ? 'bg-accent border-accent' : 'bg-surface border-subtle'}`}
          >
            <Text variant="bodySm" tone={selected ? 'onAccent' : 'primary'}>
              {org.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

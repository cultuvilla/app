import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet, Pressable, Text, HStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { ACCENT } from '../VillageSections';

export interface TypeSheetRow {
  /** Stable identifier handed back to `onSelect`. */
  id: string;
  /** Full i18n key for the label. */
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export interface TypeSheetSection {
  /** Full i18n key for a heading above the rows; omitted for the first block. */
  headingKey?: string;
  rows: TypeSheetRow[];
}

/**
 * Bottom sheet listing the question types a form builder offers. Generic over
 * the rows so the census builder (which also offers village-element sources)
 * and the event sign-up builder share one presentation.
 */
export function TypeSheet({
  visible,
  titleKey,
  sections,
  currentId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  titleKey: string;
  sections: TypeSheetSection[];
  currentId?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useT();

  function renderRow(row: TypeSheetRow) {
    const active = currentId === row.id;
    return (
      <Pressable
        key={row.id}
        testID={`type-sheet-row-${row.id}`}
        onPress={() => {
          onSelect(row.id);
          onClose();
        }}
        className={`px-4 py-3 ${active ? 'bg-subtle' : ''}`}
      >
        <HStack gap={3} align="center">
          <Ionicons name={row.icon} size={22} color={ACCENT} />
          <Text className="flex-1">{t(row.labelKey)}</Text>
          {active ? <Ionicons name="checkmark" size={20} color={ACCENT} /> : null}
        </HStack>
      </Pressable>
    );
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t(titleKey)}
      closeLabel={t('common.close')}
      maxHeightRatio={0.9}
      testID="type-sheet"
    >
      <ScrollView className="shrink">
        {sections.map((section, i) => (
          <View key={section.headingKey ?? String(i)}>
            {section.headingKey ? (
              <View className="px-4 pt-4 pb-1">
                <Text variant="bodySm" tone="muted">{t(section.headingKey)}</Text>
              </View>
            ) : null}
            {section.rows.map(renderRow)}
          </View>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

import { Dimensions, Modal, Pressable as RNPressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, HStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { ACCENT } from '../VillageSections';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.9);

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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* absoluteFill (not flex-1): RN-Web collapses a flex-1 Modal child to zero
          height, which in turn starved the sheet's max-height calculation and
          cropped the last rows with no way to scroll to them. */}
      <RNPressable
        accessible={false}
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }]}
      >
        {/* No-op onPress stops a tap on the sheet itself from bubbling to the
            backdrop and closing the sheet. */}
        <RNPressable
          accessible={false}
          onPress={() => {}}
          className="bg-surface rounded-t-2xl overflow-hidden"
          style={{ maxHeight: SHEET_MAX_HEIGHT }}
        >
          <SafeAreaView edges={['bottom']} className="shrink">
            <View className="px-4 pt-4 pb-2">
              <Text variant="h3">{t(titleKey)}</Text>
            </View>
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
          </SafeAreaView>
        </RNPressable>
      </RNPressable>
    </Modal>
  );
}

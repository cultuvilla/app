import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Input, Pressable, Text, VStack, HStack } from '../../primitives';
import { useT } from '../../../lib/i18n';

/**
 * Static option editor styled after a forms builder: each option is a row with
 * a leading radio/checkbox glyph (matching single vs multiple choice), an inline
 * text field, and a remove (✕) control. A ghosted final row adds a new option.
 */
export function OptionsEditor({
  options,
  mode,
  onChange,
  testIDPrefix,
}: {
  options: string[];
  /** 'single' shows radio bullets, 'multi' shows checkbox squares. */
  mode: 'single' | 'multi';
  onChange: (next: string[]) => void;
  /** `<prefix>-option-<i>`, `<prefix>-option-remove-<i>`, `<prefix>-option-add`. */
  testIDPrefix?: string;
}) {
  const { t } = useT();
  const glyph = mode === 'multi' ? 'square-outline' : 'radio-button-off';

  return (
    <VStack gap={1}>
      {options.map((opt, i) => (
        <HStack key={i} gap={2} align="center">
          <Ionicons name={glyph} size={20} color="#9ca3af" />
          <View className="flex-1">
            <Input
              value={opt}
              onChangeText={(v) => onChange(options.map((o, j) => (j === i ? v : o)))}
              placeholder={t('questions.optionPlaceholder')}
              testID={testIDPrefix ? `${testIDPrefix}-option-${i}` : undefined}
            />
          </View>
          <Pressable
            onPress={() => onChange(options.filter((_, j) => j !== i))}
            accessibilityLabel={t('common.delete')}
            testID={testIDPrefix ? `${testIDPrefix}-option-remove-${i}` : undefined}
            className="p-1"
          >
            <Ionicons name="close" size={20} color="#9ca3af" />
          </Pressable>
        </HStack>
      ))}

      <Pressable
        onPress={() => onChange([...options, ''])}
        testID={testIDPrefix ? `${testIDPrefix}-option-add` : undefined}
        className="py-2"
      >
        <HStack gap={2} align="center">
          <Ionicons name={glyph} size={20} color="#d1d5db" />
          <Text tone="muted">{t('questions.addOption')}</Text>
        </HStack>
      </Pressable>
    </VStack>
  );
}

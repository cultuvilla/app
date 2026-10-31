import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { View } from 'react-native';
import { FieldLabel, Pressable, Text } from '../../primitives';
import { OptionsSheet } from './OptionsSheet';
import type { Choice } from './ChoiceRow';

/**
 * A form field showing the current choice; tapping it opens the list. For a
 * choice among many (a month) — a few options read better as a `ChoiceRow`.
 * The trigger matches `DateField`'s, so the two sit together in a form.
 */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  testID,
}: {
  label: string;
  value: T;
  options: readonly Choice<T>[];
  onChange: (value: T) => void;
  testID: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View testID={testID}>
      <FieldLabel>{label}</FieldLabel>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? ''}`}
        testID={`${testID}-trigger`}
        className="flex-row items-center justify-between rounded-md border border-subtle bg-surface-elevated px-3 py-3 mt-1"
      >
        <Text numberOfLines={1} className="shrink mr-2">
          {current?.label ?? ''}
        </Text>
        <Ionicons name="chevron-down" size={iconSizes.sm} color={colors.light.fg.accent} />
      </Pressable>
      <OptionsSheet
        visible={open}
        title={label}
        options={options.map((o) => ({ key: o.value, label: o.label, selected: o.value === value }))}
        onPick={(key) => {
          onChange(key as T);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
        testID={`${testID}-options`}
      />
    </View>
  );
}

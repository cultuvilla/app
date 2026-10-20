import { View } from 'react-native';
import { Pressable, Text } from '../../primitives';

export interface Choice<T extends string> {
  value: T;
  label: string;
}

/** A wrapping row of pill choices, one selected — a period, a method, a filter. */
export function ChoiceRow<T extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  options: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  testID: string;
}) {
  return (
    <View className="flex-row flex-wrap gap-2" testID={testID}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={`${testID}-${o.value}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            className={`px-3 py-2 rounded-full border ${selected ? 'bg-accent border-accent' : 'bg-surface border-subtle'}`}
          >
            <Text variant="bodySm" tone={selected ? 'onAccent' : 'primary'} className={selected ? 'font-bold' : ''}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

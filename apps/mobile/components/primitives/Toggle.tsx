import { View } from 'react-native';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { HStack } from './HStack';

export interface ToggleProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  label?: string;
  /** Frozen: still shows its value, but can't be flipped (dimmed). */
  disabled?: boolean;
  testID?: string;
}

// Yes/no toggle switch. Track and thumb use plain `View` (not Animated.View)
// to satisfy the NativeWind/RN-Web constraint: styles must not go on className
// of Animated components. Token names match existing primitives:
//   bg-accent  — active track  (same as Button primary)
//   bg-subtle  — inactive track (same as Button secondary / Input border)
//   bg-surface — thumb  (same as Input background)
export function Toggle({ value, onValueChange, label, disabled = false, testID }: ToggleProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
    >
      <HStack gap={2} align="center" className={disabled ? 'opacity-50' : ''}>
        <View
          className={`w-12 h-7 shrink-0 rounded-full px-1 justify-center ${
            value ? 'bg-accent' : 'bg-subtle'
          }`}
        >
          <View
            className={`w-5 h-5 rounded-full bg-surface ${
              value ? 'self-end' : 'self-start'
            }`}
          />
        </View>
        {/* `shrink`: a row child keeps its natural width and runs off the
            screen; shrinking lets a long label wrap beside the switch. */}
        {label ? <Text className="shrink">{label}</Text> : null}
      </HStack>
    </Pressable>
  );
}

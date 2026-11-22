import { Avatar, Checkbox, HStack, Text } from '../../primitives';

/** One person to tick in a list of the group's people: their photo, or their initial, and their name. */
export function PersonCheckbox({
  name,
  photoURL,
  value,
  onValueChange,
  testID,
}: {
  name: string;
  photoURL: string | null;
  value: boolean;
  onValueChange: (next: boolean) => void;
  testID?: string;
}) {
  return (
    <Checkbox
      value={value}
      onValueChange={onValueChange}
      testID={testID}
      label={
        <HStack gap={2} align="center" className="flex-1 py-1">
          <Avatar uri={photoURL} size={32} initials={name.slice(0, 1).toUpperCase()} />
          <Text className="flex-1" numberOfLines={1}>
            {name}
          </Text>
        </HStack>
      }
    />
  );
}

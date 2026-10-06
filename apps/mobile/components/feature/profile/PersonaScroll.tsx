import { FlatList, View } from 'react-native';
import { Text } from '../../primitives';
import { PersonCard, AddCard } from '../VillageSections';
import { buildDisplayName, type PersonData } from '@cultuvilla/shared/models/person';

type Persona = PersonData & { id: string };

export interface PersonaScrollProps {
  personas: Persona[];
  addLabel?: string;
  emptyLabel: string;
  onPressPersona: (id: string) => void;
  onPressAdd?: () => void;
  /** Hides the "add persona" tile — used by the 'other' profile variant. Defaults to true. */
  showAdd?: boolean;
}

export function PersonaScroll({
  personas,
  addLabel,
  emptyLabel,
  onPressPersona,
  onPressAdd,
  showAdd = true,
}: PersonaScrollProps) {
  if (personas.length === 0) {
    if (!showAdd) {
      return (
        <View className="px-4">
          <Text tone="muted">{emptyLabel}</Text>
        </View>
      );
    }
    return (
      <View className="flex-row items-center px-4">
        <AddCard label={addLabel ?? ''} onPress={() => onPressAdd?.()} />
        <Text tone="muted" className="flex-1 ml-2">
          {emptyLabel}
        </Text>
      </View>
    );
  }
  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={personas}
      keyExtractor={(p) => p.id}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      renderItem={({ item }) => (
        <PersonCard
          name={buildDisplayName(item)}
          photoURL={item.photoURL ?? null}
          onPress={() => onPressPersona(item.id)}
        />
      )}
      ListFooterComponent={
        showAdd ? <AddCard label={addLabel ?? ''} onPress={() => onPressAdd?.()} /> : null
      }
    />
  );
}

import { FlatList, View } from 'react-native';
import { Text } from '../../primitives';
import { EntityCard, AddCard } from '../VillageSections';

export interface VillageRow {
  municipalityId: string;
  name: string;
  comunidadAutonoma: string;
  escudoUrl: string | null;
  /** True when the village admin uploaded their own escudo — keep it full-bleed. */
  manualEscudo: boolean;
  role: 'admin' | 'user';
}

export interface VillagesScrollProps {
  villages: VillageRow[];
  activeId: string | null;
  joinLabel?: string;
  emptyLabel: string;
  onPressVillage: (municipalityId: string) => void;
  onPressJoin?: () => void;
  /** Hides the "join village" tile — used by the 'other' profile variant. Defaults to true. */
  showJoin?: boolean;
}

export function VillagesScroll({
  villages,
  activeId,
  joinLabel,
  emptyLabel,
  onPressVillage,
  onPressJoin,
  showJoin = true,
}: VillagesScrollProps) {
  if (villages.length === 0) {
    if (!showJoin) {
      return (
        <View className="px-4">
          <Text tone="muted">{emptyLabel}</Text>
        </View>
      );
    }
    return (
      <View className="flex-row items-center px-4">
        <AddCard label={joinLabel ?? ''} onPress={() => onPressJoin?.()} />
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
      data={villages}
      keyExtractor={(v) => v.municipalityId}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      renderItem={({ item }) => (
        <EntityCard
          label={item.name}
          sub={item.comunidadAutonoma}
          icon="map-outline"
          imageUri={item.escudoUrl}
          crest={!item.manualEscudo}
          accent={item.municipalityId === activeId}
          onPress={() => onPressVillage(item.municipalityId)}
        />
      )}
      ListFooterComponent={
        showJoin ? <AddCard label={joinLabel ?? ''} onPress={() => onPressJoin?.()} /> : null
      }
    />
  );
}

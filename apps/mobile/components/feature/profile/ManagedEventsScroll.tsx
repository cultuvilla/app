import { FlatList, View } from 'react-native';
import { Text } from '../../primitives';
import { EntityCard } from '../VillageSections';
import { formatDate } from '@cultuvilla/shared/utils';
import {
  isEventOngoing,
  type EventData,
} from '@cultuvilla/shared/models/event/EventDataModel';

export type ManagedEvent = EventData & { id: string };

export interface ManagedEventsScrollProps {
  events: ManagedEvent[];
  now: Date;
  ongoingLabel: string;
  emptyLabel: string;
  onPressEvent: (event: ManagedEvent) => void;
}

export function ManagedEventsScroll({
  events,
  now,
  ongoingLabel,
  emptyLabel,
  onPressEvent,
}: ManagedEventsScrollProps) {
  if (events.length === 0) {
    return (
      <View className="px-4">
        <Text tone="muted">{emptyLabel}</Text>
      </View>
    );
  }

  // Ongoing first (soonest-started first), then the rest in their incoming
  // (createdAt-desc) order.
  const ongoing = events
    .filter((e) => isEventOngoing(e, now))
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const rest = events.filter((e) => !isEventOngoing(e, now));
  const ordered = [...ongoing, ...rest];
  const ongoingIds = new Set(ongoing.map((e) => e.id));

  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={ordered}
      keyExtractor={(e) => e.id}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      renderItem={({ item }) => {
        const isOngoing = ongoingIds.has(item.id);
        return (
          <EntityCard
            label={item.title}
            sub={isOngoing ? ongoingLabel : formatDate(item.startDate, 'short')}
            icon="calendar-outline"
            imageUri={item.imageURL ?? item.villageCoverImage}
            accent={isOngoing}
            onPress={() => onPressEvent(item)}
          />
        );
      }}
    />
  );
}

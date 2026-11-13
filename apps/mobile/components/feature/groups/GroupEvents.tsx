import { useMemo, useState } from 'react';
import { FlatList, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { spacing } from '@cultuvilla/shared/design-system';
import { eventEndBoundary, upcomingThenPast, type EventData } from '@cultuvilla/shared/models/event/EventDataModel';
import { firstOfEachSeries } from '@cultuvilla/shared/models/event/EventSeriesModel';
import type { OrganizationData } from '@cultuvilla/shared/models/organization';
import { watchEventsByOrganization } from '@cultuvilla/shared/services/eventService';
import { formatDate } from '@cultuvilla/shared/utils';
import { Text } from '../../primitives';
import { Fab } from '../../primitives/Fab';
import { SegmentedToggle } from '../SegmentedToggle';
import { EntityCard } from '../VillageSections';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { useEventTaskBadges } from '../../../lib/orgs/useEventTaskBadges';
import { createEventHref, groupEventHref } from '../../../lib/navigation/routes';

type OrgEvent = EventData & { id: string };
type EventFilter = 'upcoming' | 'past' | 'all';

/** The group's events in two columns, filtered by when, each with its tasks' progress, and the way to create one for the group. */
export function GroupEvents({ org }: { org: OrganizationData & { id: string } }) {
  const { t } = useT();
  const { width } = useWindowDimensions();
  const { data, status } = useWatch<OrgEvent[]>('groups:watchEventsByOrganization', org.id, (next, error) =>
    watchEventsByOrganization(org.id, { includePrivate: true }, next, error),
  );
  const [filter, setFilter] = useState<EventFilter>('upcoming');
  const events = useMemo(() => {
    const now = new Date();
    const all = firstOfEachSeries(upcomingThenPast(data ?? [], now));
    if (filter === 'all') return all;
    return all.filter((e) => eventEndBoundary(e) >= now === (filter === 'upcoming'));
  }, [data, filter]);
  const eventIds = useMemo(() => events.map((e) => e.id), [events]);
  const taskBadge = useEventTaskBadges(org.id, eventIds);
  const cardSize = (width - spacing[4] * 2 - spacing[3]) / 2;

  return (
    <View className="flex-1">
      <View className="px-4 pt-3">
        <SegmentedToggle
          testID="group-events-filter"
          value={filter}
          options={[
            { value: 'upcoming', label: t('groups.events.filter.upcoming') },
            { value: 'past', label: t('groups.events.filter.past') },
            { value: 'all', label: t('groups.events.filter.all') },
          ]}
          onChange={setFilter}
        />
      </View>
      <FlatList
        testID="group-events"
        data={events}
        numColumns={2}
        keyExtractor={(e) => e.id}
        columnWrapperStyle={{ gap: spacing[3] }}
        contentContainerClassName="px-4 pt-3 pb-24 gap-3"
        ListEmptyComponent={
          status === 'loading' ? null : (
            <Text tone="muted" className="py-6 text-center">
              {t('groups.sections.empty.eventos')}
            </Text>
          )
        }
        renderItem={({ item: e }) => (
          <EntityCard
            size={cardSize}
            label={e.title}
            sub={formatDate(e.startDate, 'short')}
            icon="calendar-outline"
            imageUri={e.imageURL ?? e.villageCoverImage}
            statBadge={{ icon: 'person-outline', count: e.confirmedCount, spoken: 'attendees' }}
            progressBadge={taskBadge(e.id)}
            onPress={() => router.push(groupEventHref(org.id, e.id))}
          />
        )}
      />
      <Fab
        testID="group-events-create"
        label={t('feed.events.create')}
        onPress={() => router.push(createEventHref({ villageId: org.municipalityId, organizerOrgId: org.id }))}
      />
    </View>
  );
}

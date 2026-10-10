import { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { watchEventsByOrganization } from '@cultuvilla/shared/services/eventService';
import { upcomingThenPast, type EventData } from '@cultuvilla/shared/models/event/EventDataModel';
import { formatDate } from '@cultuvilla/shared/utils';
import { Section, EntityCard } from './VillageSections';
import { useWatch } from '../../lib/hooks/useWatch';
import { useT } from '../../lib/i18n';
import { eventHref } from '../../lib/navigation/routes';

type Event = EventData & { id: string };

/**
 * The events an organization has organized, read like the village home's:
 * upcoming first, then past. `includePrivate` only for a vetted member — the
 * only viewer the rules let read the org's private events.
 */
export function OrgEventsSection({ orgId, includePrivate }: { orgId: string; includePrivate: boolean }) {
  const { t } = useT();
  const { data, status } = useWatch<Event[]>(
    'orgDetail:watchEventsByOrganization',
    `${orgId}|${includePrivate}`,
    (next, error) => watchEventsByOrganization(orgId, { includePrivate }, next, error),
  );
  const events = useMemo(() => upcomingThenPast(data ?? [], new Date()), [data]);

  return (
    // Bleed past the detail body's padding: the row scrolls edge to edge, as
    // it does on the village home, and Section pads its own content.
    <View className="-mx-4">
      <Section
        title={t('organization.events')}
        isEmpty={events.length === 0}
        status={status}
        data={events}
        keyExtractor={(e) => e.id}
        renderItem={({ item: e }) => (
          <EntityCard
            label={e.title}
            sub={formatDate(e.startDate, 'short')}
            icon="calendar-outline"
            imageUri={e.imageURL ?? e.villageCoverImage}
            statBadge={{ icon: 'person-outline', count: e.confirmedCount, spoken: 'attendees' }}
            onPress={() => router.push(eventHref(e))}
          />
        )}
      />
    </View>
  );
}

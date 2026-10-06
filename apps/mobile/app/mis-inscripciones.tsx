import { eventHref } from '../lib/navigation/routes';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../components/primitives/Screen';
import { Text } from '../components/primitives/Text';
import { ErrorState } from '../components/primitives/ErrorState';
import { EventCard } from '../components/feature/EventCard';
import { SegmentedToggle } from '../components/feature/SegmentedToggle';
import { ScreenHeader } from '../components/layout/ScreenHeader';
import { useAuth } from '../lib/auth/useAuth';
import { useT } from '../lib/i18n';
import { splitEventsByTime } from '../lib/registrations/splitEventsByTime';
import { useWatch } from '../lib/hooks/useWatch';
import {
  watchUserRegistrationsAcrossEvents,
  type UserRegistration,
} from '@cultuvilla/shared/services/registrationService';
import { watchEventsByIds } from '@cultuvilla/shared/services/eventService';
import type { EventData } from '@cultuvilla/shared/models/event/EventDataModel';

type Row = EventData & { id: string };

const NO_EVENTS: Row[] = [];
type RegistrationsTab = 'proximos' | 'pasados';

const TABS = ['proximos', 'pasados'] as const satisfies readonly RegistrationsTab[];

const TAB_LABEL_KEY: Record<RegistrationsTab, string> = {
  proximos: 'me.registrations.tab.upcoming',
  pasados: 'me.registrations.tab.past',
};

const TAB_EMPTY_KEY: Record<RegistrationsTab, string> = {
  proximos: 'me.registrations.emptyUpcoming',
  pasados: 'me.registrations.emptyPast',
};

export default function MyRegistrationsScreen() {
  const { user } = useAuth();
  const { t } = useT();
  const [activeTab, setActiveTab] = useState<RegistrationsTab>('proximos');
  // A retry resubscribes: bumping it changes both listeners' keys.
  const [attempt, setAttempt] = useState(0);
  const uid = user?.uid ?? null;

  // Both are live: a sign-up or a cancellation elsewhere, or an edit to one of
  // the events, shows here without reloading on focus.
  const registrations = useWatch<UserRegistration[]>(
    'myRegistrations:watchUserRegistrations',
    uid ? `${uid}#${String(attempt)}` : null,
    uid ? (next, error) => watchUserRegistrationsAcrossEvents(uid, next, error) : null,
  );
  const eventIds = useMemo(
    () =>
      Array.from(
        new Set(
          (registrations.data ?? [])
            .map((r) => r.eventPath.split('/')[1])
            .filter((id): id is string => typeof id === 'string'),
        ),
      ),
    [registrations.data],
  );
  const eventsWatch = useWatch<Row[]>(
    'myRegistrations:watchEventsByIds',
    registrations.data ? `${String(attempt)}#${eventIds.join(',')}` : null,
    registrations.data ? (next, error) => watchEventsByIds(eventIds, next, error) : null,
  );
  const events = registrations.data ? (eventsWatch.data ?? null) : null;
  const error = registrations.error?.message ?? eventsWatch.error?.message ?? null;

  // `new Date()` is read once per emission, not per render: the split only
  // ever moves an event across the boundary at midnight.
  const { upcoming, past } = useMemo(
    () => splitEventsByTime(events ?? NO_EVENTS, new Date()),
    [events],
  );
  const visible = activeTab === 'proximos' ? upcoming : past;

  return (
    <Screen padded={false}>
      <ScreenHeader title={t('me.registrations.title')} />
      <View className="px-4 pt-3 pb-2">
        <SegmentedToggle<RegistrationsTab>
          value={activeTab}
          onChange={setActiveTab}
          options={TABS.map((tab) => ({ value: tab, label: t(TAB_LABEL_KEY[tab]) }))}
        />
      </View>
      {events === null && !error ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : error ? (
        <ErrorState error={error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : (
        <FlatList
          contentContainerClassName="p-4 gap-4"
          data={visible}
          keyExtractor={(e) => e.id}
          ListEmptyComponent={<Text tone="muted">{t(TAB_EMPTY_KEY[activeTab])}</Text>}
          renderItem={({ item }) => (
            <EventCard
              event={{
                id: item.id,
                title: item.title,
                startDate: item.startDate,
                locationName: item.location?.displayName ?? null,
                imageURL: item.imageURL,
                villageCoverImage: item.villageCoverImage,
                commentCount: item.commentCount,
              }}
              onPress={() => router.push(eventHref(item))}
            />
          )}
        />
      )}
    </Screen>
  );
}

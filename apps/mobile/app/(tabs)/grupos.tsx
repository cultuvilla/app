import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { GroupSection } from '@cultuvilla/shared/utils';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { eventEndBoundary, upcomingThenPast, type EventData } from '@cultuvilla/shared/models/event/EventDataModel';
import { firstOfEachSeries } from '@cultuvilla/shared/models/event/EventSeriesModel';
import { compareTasksByDue, hasSocioRoster, isActiveSocio, periodLabel, personalizeGroupMessage } from '@cultuvilla/shared/models/organization';
import { watchEventsByOrganization } from '@cultuvilla/shared/services/eventService';
import { watchOrgSocios, type Socio } from '@cultuvilla/shared/services/socioService';
import { formatDate } from '@cultuvilla/shared/utils';
import { Card, Escudo, HStack, Pressable, Screen, ScreenTitle, Text, VStack } from '../../components/primitives';
import { StatsRow } from '../../components/feature/StatsRow';
import { EntityCard, Section, SectionHeader } from '../../components/feature/VillageSections';
import { NoticeCard, TaskCard, taskPeople } from '../../components/feature/groups/GroupHomeCards';
import { useMemberFaces } from '../../lib/orgs/useOrgMembers';
import { watchOpenGroupTasks, type GroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { AppHeader } from '../../components/layout/AppHeader';
import { GroupSwitcherSheet } from '../../components/feature/groups/GroupSwitcher';
import { GroupSectionGrid } from '../../components/feature/groups/GroupSectionGrid';
import { SocioConsentCard } from '../../components/feature/groups/SocioConsentCard';
import { useAuth } from '../../lib/auth/useAuth';
import { useT } from '../../lib/i18n';
import { eventHref, groupSectionHref } from '../../lib/navigation/routes';
import { useWatch } from '../../lib/hooks/useWatch';
import { CUOTA_STATUS_TONE } from '../../lib/orgs/cuota';
import { useMyCuota } from '../../lib/orgs/useMyCuota';
import { groupSections } from '../../lib/orgs/groupSections';
import { useGroupNotices } from '../../lib/orgs/useGroupNotices';
import { useMyMessageValues } from '../../lib/orgs/useMyMessageValues';
import { useMyGroups, type MyGroup } from '../../lib/orgs/useMyGroups';
import { useMyOpenTasks } from '../../lib/orgs/useMyOpenTasks';
import { pickGroupId, readLastGroupId, rememberLastGroupId } from '../../lib/orgs/lastGroup';

/**
 * Mis grupos: the private side of the groups the user belongs to. The home
 * reads like the village's — picture, name, stats, rows of avisos, events and
 * tasks — with the group's buttons at the end; each feature opens its own screen
 * (`/grupos/<orgId>/<section>`), and the group's name in the header switches
 * group. The public org page stays the org's face; nothing here is public.
 */
export default function GroupsTabScreen() {
  const { t } = useT();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { groups, status } = useMyGroups(uid);
  const [remembered, setRemembered] = useState<string | null | undefined>(undefined);
  const [switching, setSwitching] = useState(false);
  // `/grupos?grupo=<orgId>` opens the tab on that group (a WhatsApp link, a switch from a group screen).
  const { grupo } = useLocalSearchParams<{ grupo?: string }>();

  useEffect(() => {
    if (grupo) {
      setRemembered(grupo);
      void rememberLastGroupId(grupo);
      return;
    }
    void readLastGroupId().then(setRemembered);
  }, [grupo]);

  const groupIds = useMemo(() => groups.map((g) => g.org.id), [groups]);
  const selectedId = remembered === undefined ? null : pickGroupId(groupIds, remembered);
  const selected = groups.find((g) => g.org.id === selectedId) ?? null;

  const select = (orgId: string) => {
    setSwitching(false);
    setRemembered(orgId);
    void rememberLastGroupId(orgId);
  };

  return (
    <Screen padded={false} topInset={false} bottomInset={false}>
      <AppHeader centerLabel={t('tabs.groups')} />
      {!uid ? null : status === 'loading' || remembered === undefined ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : selected ? (
        <GroupHome
          key={selected.org.id}
          group={selected}
          uid={uid}
          onSwitch={groups.length > 1 ? () => setSwitching(true) : null}
        />
      ) : (
        // A failed read, or the user just left their last group (the tab hides next).
        <View className="flex-1 items-center justify-center px-4" testID="groups-empty">
          <Text tone="muted">{t(status === 'error' ? 'groups.loadError' : 'groups.empty')}</Text>
        </View>
      )}
      <GroupSwitcherSheet
        visible={switching}
        groups={groups}
        selectedId={selectedId}
        onSelect={select}
        onClose={() => setSwitching(false)}
      />
    </Screen>
  );
}

type OrgEvent = EventData & { id: string };

function GroupHome({ group, uid, onSwitch }: { group: MyGroup; uid: string; onSwitch: (() => void) | null }) {
  const { t } = useT();
  const { org, role } = group;
  const isAdmin = role === 'admin';
  const roster = hasSocioRoster(org.type);
  const { member, admin } = groupSections(group);
  const notices = useGroupNotices(org.id, roster ? uid : null);
  const myValues = useMyMessageValues(org.id, roster ? uid : null);
  const tasks = useMyOpenTasks(org.id, uid);
  const cuota = useMyCuota(org.id, roster ? uid : null);
  // Rules let members read the roster only while the estatutos allow it.
  const canReadRoster = roster && (isAdmin || org.sociosListVisible);
  const socios = useWatch<Socio[]>(
    'groups:watchOrgSocios',
    canReadRoster ? org.id : null,
    canReadRoster ? (next, error) => watchOrgSocios(org.id, next, error) : null,
  );
  const events = useWatch<OrgEvent[]>(
    'orgDetail:watchEventsByOrganization',
    org.id,
    (next, error) => watchEventsByOrganization(org.id, { includePrivate: true }, next, error),
  );
  // Only what is still ahead: the row is "Próximos eventos".
  const eventRows = useMemo(() => {
    const now = new Date();
    return firstOfEachSeries(upcomingThenPast(events.data ?? [], now)).filter((e) => eventEndBoundary(e) >= now);
  }, [events.data]);
  // Every task of the group still to be done, not only mine.
  const openTasks = useWatch<GroupTask[]>('groups:watchOpenGroupTasks', org.id, (next, error) =>
    watchOpenGroupTasks(org.id, next, error),
  );
  const upcomingTasks = useMemo(() => [...(openTasks.data ?? [])].sort(compareTasksByDue), [openTasks.data]);
  const eventTitles = useMemo(() => new Map((events.data ?? []).map((e) => [e.id, e.title])), [events.data]);
  const faces = useMemberFaces(upcomingTasks.flatMap(taskPeople));
  const ownStatus = cuota.statuses.find((s) => cuota.rows.find((r) => r.id === s.socioId)?.kind === 'member') ?? cuota.statuses[0];

  const badges: Partial<Record<GroupSection, number>> = { avisos: notices.unreadCount, tareas: tasks.mine.length };
  const open = (section: GroupSection) => router.push(groupSectionHref(org.id, section));

  return (
    <ScrollView contentContainerClassName="pb-16" testID="group-home">
      {/* ── Header (picture + name), as on the village home ── */}
      <HStack gap={4} className="items-center px-4 pt-4">
        <View className="bg-surface rounded-full overflow-hidden">
          <Escudo url={org.images[0] ?? null} size={88} fill fallbackInitial={org.name} accessibilityLabel={org.name} />
        </View>
        <VStack gap={0} className="flex-1">
          {/* The group's name is what changes: the switch sits right beside it. */}
          {onSwitch ? (
            <Pressable
              onPress={onSwitch}
              accessibilityRole="button"
              accessibilityLabel={`${org.name}. ${t('groups.switcherLabel')}`}
              testID="group-switcher-open"
            >
              <HStack gap={1} align="center">
                <ScreenTitle numberOfLines={2} className="shrink">
                  {org.name}
                </ScreenTitle>
                <Ionicons name="chevron-down" size={iconSizes.md} color={colors.light.fg.accent} />
              </HStack>
            </Pressable>
          ) : (
            <ScreenTitle numberOfLines={2}>{org.name}</ScreenTitle>
          )}
          <Text tone="muted" variant="bodySm">
            {t(`organization.${org.type}`)}
          </Text>
        </VStack>
      </HStack>

      <View className="px-4 py-4">
        <StatsRow
          stats={[
            // Socios include the integrantes, so one or the other, never both.
            canReadRoster
              ? {
                  label: t('groups.stats.socios'),
                  value: socios.status === 'ready' ? (socios.data ?? []).filter(isActiveSocio).length : null,
                  onPress: () => open('socios'),
                }
              : {
                  label: t('groups.stats.members'),
                  value: org.memberCount,
                  onPress: isAdmin ? () => open('miembros') : undefined,
                },
            { label: t('groups.stats.followers'), value: org.followerCount },
            { label: t('groups.stats.events'), value: events.status === 'ready' ? eventRows.length : null, onPress: () => open('eventos') },
          ]}
        />
      </View>

      {/* Avisos are what the junta needs everyone to read: the first row. */}
      {roster ? (
        <Section
          title={t('groups.sections.avisos')}
          isEmpty={notices.notices.length === 0}
          status={notices.status}
          actionLabel={t('village.home.seeAll')}
          onManage={() => open('avisos')}
        >
          {notices.notices.slice(0, 5).map((m) => (
            <NoticeCard key={m.id} message={personalizeGroupMessage(m, myValues)} onPress={() => open('avisos')} />
          ))}
        </Section>
      ) : null}

      <VStack gap={3} className="px-4 pt-4">
        {roster ? <SocioConsentCard orgId={org.id} onlyWhenUnanswered /> : null}
        {roster && ownStatus && cuota.periodKey ? (
          <Pressable testID="group-home-cuota" accessibilityRole="button" onPress={() => open('cuota')}>
            <Card>
              <HStack gap={2} align="center">
                <Text className="flex-1 font-bold">{t('groups.summary.cuota', { period: periodLabel(cuota.periodKey) })}</Text>
                <Text variant="bodySm" tone={CUOTA_STATUS_TONE[ownStatus.status]} className="font-bold">
                  {t(`groups.cuota.status.${ownStatus.status}`)}
                </Text>
                <Ionicons name="chevron-forward" size={iconSizes.sm} color={colors.light.fg.muted} />
              </HStack>
            </Card>
          </Pressable>
        ) : null}
      </VStack>

      <Section
        title={t('groups.upcomingEvents')}
        testID="group-home-events"
        isEmpty={eventRows.length === 0}
        status={events.status}
        data={eventRows}
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

      <Section
        title={t('groups.home.upcomingTasks')}
        testID="group-home-tasks"
        isEmpty={upcomingTasks.length === 0}
        status={openTasks.status}
        actionLabel={t('village.home.seeAll')}
        onManage={() => open('tareas')}
      >
        {upcomingTasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            eventTitle={task.eventId ? (eventTitles.get(task.eventId) ?? null) : null}
            faces={faces}
            onPress={() => open('tareas')}
          />
        ))}
      </Section>

      {/* One list for everyone; an admin's extra buttons follow, in their own colour. */}
      <VStack gap={3} className="pt-4" testID="group-actions">
        <SectionHeader title={t('groups.home.actions')} />
        <View className="px-4">
          <GroupSectionGrid sections={member} adminSections={admin} badges={badges} onOpen={open} />
        </View>
      </VStack>
    </ScrollView>
  );
}

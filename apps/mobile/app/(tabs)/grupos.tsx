import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { GroupSection } from '@cultuvilla/shared/utils';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { upcomingThenPast, type EventData } from '@cultuvilla/shared/models/event/EventDataModel';
import { firstOfEachSeries } from '@cultuvilla/shared/models/event/EventSeriesModel';
import { hasSocioRoster, isActiveSocio, periodLabel } from '@cultuvilla/shared/models/organization';
import { watchEventsByOrganization } from '@cultuvilla/shared/services/eventService';
import { watchOrgSocios, type Socio } from '@cultuvilla/shared/services/socioService';
import { formatDate } from '@cultuvilla/shared/utils';
import { Card, Escudo, HStack, Pressable, Screen, ScreenTitle, Text, VStack } from '../../components/primitives';
import { StatsRow } from '../../components/feature/StatsRow';
import { EntityCard, Section } from '../../components/feature/VillageSections';
import { NoticeCard, TaskCard } from '../../components/feature/groups/GroupHomeCards';
import { AppHeader } from '../../components/layout/AppHeader';
import { GroupSwitcherSheet } from '../../components/feature/groups/GroupSwitcher';
import { GroupSectionGrid } from '../../components/feature/groups/GroupSectionGrid';
import { SocioConsentCard } from '../../components/feature/groups/SocioConsentCard';
import { useAuth } from '../../lib/auth/useAuth';
import { useT } from '../../lib/i18n';
import { eventHref, groupSectionHref, orgHref } from '../../lib/navigation/routes';
import { useWatch } from '../../lib/hooks/useWatch';
import { CUOTA_STATUS_TONE } from '../../lib/orgs/cuota';
import { useMyCuota } from '../../lib/orgs/useMyCuota';
import { groupSections } from '../../lib/orgs/groupSections';
import { useGroupNotices } from '../../lib/orgs/useGroupNotices';
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
      <AppHeader
        centerLabel={selected?.org.name ?? t('groups.title')}
        onLabelPress={groups.length > 1 ? () => setSwitching(true) : undefined}
        labelAccessibilityLabel={t('groups.switcherLabel')}
        labelTestID="group-switcher-open"
      />
      {!uid ? null : status === 'loading' || remembered === undefined ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : selected ? (
        <GroupHome key={selected.org.id} group={selected} uid={uid} />
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

function GroupHome({ group, uid }: { group: MyGroup; uid: string }) {
  const { t } = useT();
  const { org, role } = group;
  const isAdmin = role === 'admin';
  const roster = hasSocioRoster(org.type);
  const includePrivate = org.joinPolicy === 'approval';
  const { member, admin } = groupSections(group);
  const notices = useGroupNotices(org.id, roster ? uid : null);
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
    `${org.id}|${includePrivate}`,
    (next, error) => watchEventsByOrganization(org.id, { includePrivate }, next, error),
  );
  const eventRows = useMemo(() => firstOfEachSeries(upcomingThenPast(events.data ?? [], new Date())), [events.data]);
  const myTasks = useMemo(() => [...tasks.mine, ...tasks.shifts], [tasks.mine, tasks.shifts]);
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
          <ScreenTitle numberOfLines={2}>{org.name}</ScreenTitle>
          <Text tone="muted" variant="bodySm">
            {t(`organization.${org.type}`)}
          </Text>
          <Pressable testID="group-open-page" accessibilityRole="link" onPress={() => router.push(orgHref(org))} className="self-start pt-1">
            <Text variant="bodySm" className="text-accent">
              {t('groups.openGroupPage')}
            </Text>
          </Pressable>
        </VStack>
      </HStack>

      <View className="px-4 py-4">
        <StatsRow
          stats={[
            ...(canReadRoster
              ? [
                  {
                    label: t('groups.stats.socios'),
                    value: socios.status === 'ready' ? (socios.data ?? []).filter(isActiveSocio).length : null,
                    onPress: () => open('socios'),
                  },
                ]
              : []),
            { label: t('groups.stats.members'), value: org.memberCount, onPress: isAdmin ? () => open('miembros') : undefined },
            { label: t('groups.stats.events'), value: events.status === 'ready' ? eventRows.length : null, onPress: () => open('eventos') },
          ]}
        />
      </View>

      <VStack gap={3} className="px-4">
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

      {roster ? (
        <Section
          title={t('groups.sections.avisos')}
          isEmpty={notices.notices.length === 0}
          status={notices.status}
          actionLabel={t('village.home.seeAll')}
          onManage={() => open('avisos')}
        >
          {notices.notices.slice(0, 5).map((m) => (
            <NoticeCard
              key={m.id}
              message={m}
              unread={notices.readsStatus === 'ready' && !notices.readIds.has(m.id) && m.sentBy !== uid}
              onPress={() => open('avisos')}
            />
          ))}
        </Section>
      ) : null}

      <Section
        title={t('groups.sections.eventos')}
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
        title={t('groups.home.myTasks')}
        isEmpty={myTasks.length === 0}
        status={tasks.status}
        actionLabel={t('village.home.seeAll')}
        onManage={() => open('tareas')}
      >
        {myTasks.map((task) => (
          <TaskCard key={task.id} task={task} onPress={() => open('tareas')} />
        ))}
      </Section>

      <VStack gap={2} className="px-4 pt-6">
        <Text variant="caption" tone="muted" className="font-bold uppercase">
          {t('groups.home.more')}
        </Text>
        <GroupSectionGrid sections={member} badges={badges} onOpen={open} />
      </VStack>

      {isAdmin ? (
        <VStack gap={2} className="px-4 pt-4" testID="group-manage">
          <Text variant="caption" tone="muted" className="font-bold uppercase">
            {t('groups.manage')}
          </Text>
          <GroupSectionGrid sections={admin} onOpen={open} admin />
        </VStack>
      ) : null}
    </ScrollView>
  );
}

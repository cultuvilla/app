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
import { Escudo, HStack, Pressable, Screen, ScreenTitle, Text, VStack } from '../../components/primitives';
import { StatsRow } from '../../components/feature/StatsRow';
import { EntityCard, Section, SectionHeader } from '../../components/feature/VillageSections';
import { NoticeCard, TaskCard } from '../../components/feature/groups/GroupHomeCards';
import { taskHolders } from '@cultuvilla/shared/models/organization';
import { startOfMadridYear } from '../../lib/orgs/taskBoard';
import { useMemberFaces } from '../../lib/orgs/useOrgMembers';
import { watchGroupTasksDoneSince, watchOpenGroupTasks, type GroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { madridDayKey } from '@cultuvilla/shared/models/event';
import { AppHeader } from '../../components/layout/AppHeader';
import { GroupSwitcherSheet } from '../../components/feature/groups/GroupSwitcher';
import { CuotaBanner } from '../../components/feature/groups/CuotaBanner';
import { GroupSectionGrid } from '../../components/feature/groups/GroupSectionGrid';
import { GroupContactGate } from '../../components/feature/groups/GroupContactGate';
import { SocioConsentCard } from '../../components/feature/groups/SocioConsentCard';
import { useCosatecaRequests } from '../../components/feature/groups/cosateca/useCosatecaRequests';
import { useAuth } from '../../lib/auth/useAuth';
import { useT } from '../../lib/i18n';
import { groupAvisoHref, groupEventHref, groupSectionHref, groupTaskHref } from '../../lib/navigation/routes';
import { useWatch } from '../../lib/hooks/useWatch';
import { useMyCuota } from '../../lib/orgs/useMyCuota';
import { groupSections, homeButtons } from '../../lib/orgs/groupSections';
import { useEventTaskBadges } from '../../lib/orgs/useEventTaskBadges';
import { useGroupChatUnread } from '../../lib/orgs/useGroupChatUnread';
import { useGroupNotices } from '../../lib/orgs/useGroupNotices';
import { useMyMessageValues } from '../../lib/orgs/useMyMessageValues';
import { useMyGroups, type MyGroup } from '../../lib/orgs/useMyGroups';
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
  // With `&aviso=<id>`, the aviso's own link: the group, then the aviso on top of it.
  const { grupo, aviso } = useLocalSearchParams<{ grupo?: string; aviso?: string }>();

  useEffect(() => {
    if (grupo) {
      setRemembered(grupo);
      void rememberLastGroupId(grupo);
      return;
    }
    void readLastGroupId().then(setRemembered);
  }, [grupo]);

  useEffect(() => {
    if (!uid || !grupo || !aviso) return;
    router.setParams({ aviso: undefined });
    router.push(groupAvisoHref(grupo, aviso));
  }, [uid, grupo, aviso]);

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
        <GroupContactGate group={selected} uid={uid} onSwitch={groups.length > 1 ? () => setSwitching(true) : null}>
          <GroupHome
            key={selected.org.id}
            group={selected}
            uid={uid}
            onSwitch={groups.length > 1 ? () => setSwitching(true) : null}
          />
        </GroupContactGate>
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
  const noticeIds = useMemo(() => notices.notices.map((m) => m.id), [notices.notices]);
  const chat = useGroupChatUnread(org.id, uid, noticeIds);
  const myValues = useMyMessageValues(org.id, roster ? uid : null);
  const cuota = useMyCuota(org.id, roster && org.cuotaEnabled ? uid : null);
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
  // Every task the group finished this year: the third stat, for any group.
  const year = madridDayKey(new Date()).slice(0, 4);
  const doneTasks = useWatch<GroupTask[]>('groups:watchGroupTasksDoneSince', `${org.id}|${year}`, (next, error) =>
    watchGroupTasksDoneSince(org.id, startOfMadridYear(year), next, error),
  );
  // Only what is still ahead: the row is "Próximos eventos".
  const eventRows = useMemo(() => {
    const now = new Date();
    return firstOfEachSeries(upcomingThenPast(events.data ?? [], now)).filter((e) => eventEndBoundary(e) >= now);
  }, [events.data]);
  const eventRowIds = useMemo(() => eventRows.map((e) => e.id), [eventRows]);
  const taskBadge = useEventTaskBadges(org.id, eventRowIds);
  // Every task of the group still to be done, not only mine.
  const openTasks = useWatch<GroupTask[]>('groups:watchOpenGroupTasks', org.id, (next, error) =>
    watchOpenGroupTasks(org.id, next, error),
  );
  const upcomingTasks = useMemo(() => [...(openTasks.data ?? [])].sort(compareTasksByDue), [openTasks.data]);
  const eventTitles = useMemo(() => new Map((events.data ?? []).map((e) => [e.id, e.title])), [events.data]);
  const faces = useMemberFaces(upcomingTasks.flatMap(taskHolders));
  const ownStatus = cuota.statuses.find((s) => cuota.rows.find((r) => r.id === s.socioId)?.kind === 'member') ?? cuota.statuses[0];
  const cuotaBanner = roster && org.cuotaEnabled && ownStatus && cuota.periodKey ? { period: cuota.periodKey, status: ownStatus.status } : null;

  // Only what waits on the viewer counts: "En curso" never puts a number on the button.
  const cosateca = useCosatecaRequests(org.id, uid, isAdmin, org.cosateca.enabled);
  const badges: Partial<Record<GroupSection, number>> = {
    charla: chat.generalUnread ? 1 : 0,
    cosateca: cosateca.toca.length,
  };
  const newAvisos = notices.unreadCount + chat.unreadAvisoIds.size;
  // A row shows only with something in it; the buttons below are the way in otherwise (2026-11-28, Álvaro).
  const showAvisos = roster && notices.notices.length > 0;
  // Held back while the avisos load, so their button does not flash before the row arrives.
  const avisosRowShown: GroupSection[] = showAvisos || (roster && notices.status === 'loading') ? ['avisos'] : [];
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
            { label: t('groups.stats.events'), value: events.status === 'ready' ? eventRows.length : null, onPress: () => open('eventos') },
            {
              label: t('groups.stats.tasksDone'),
              value: doneTasks.status === 'ready' ? (doneTasks.data ?? []).length : null,
              onPress: () => open('tareas'),
            },
          ]}
        />
      </View>

      {/* Avisos are what the junta needs everyone to read: the first row. */}
      {showAvisos ? (
        <Section
          title={newAvisos > 0 ? t('groups.home.avisosWithNew', { count: newAvisos }) : t('groups.sections.avisos')}
          testID="group-home-avisos"
          isEmpty={false}
          status="ready"
          actionLabel={t('village.home.seeAll')}
          onManage={() => open('avisos')}
        >
          {/* A card opens the avisos screen, not the aviso's chat: there the poll is answered and the chat is one tap away (decided 2026-11-21). */}
          {notices.notices.slice(0, 5).map((m) => (
            <NoticeCard
              key={m.id}
              message={personalizeGroupMessage(m, myValues)}
              unread={(notices.readsStatus === 'ready' && !notices.readIds.has(m.id) && m.sentBy !== uid) || chat.unreadAvisoIds.has(m.id)}
              onPress={() => open('avisos')}
            />
          ))}
        </Section>
      ) : null}

      <VStack gap={3} className="px-4 pt-4">
        {roster ? <SocioConsentCard orgId={org.id} requirement={org} /> : null}
      </VStack>

      {eventRows.length > 0 ? (
        <Section
          title={t('groups.sections.eventos')}
          testID="group-home-events"
          isEmpty={false}
          status="ready"
          actionLabel={t('village.home.seeAll')}
          onManage={() => open('eventos')}
          data={eventRows}
          keyExtractor={(e) => e.id}
          renderItem={({ item: e }) => (
            <EntityCard
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
      ) : null}

      {upcomingTasks.length > 0 ? (
        <Section
          title={t('groups.sections.tareas')}
          testID="group-home-tasks"
          isEmpty={false}
          status="ready"
          actionLabel={t('village.home.seeAll')}
          onManage={() => open('tareas')}
        >
          {upcomingTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              eventTitle={task.eventId ? (eventTitles.get(task.eventId) ?? null) : null}
              faces={faces}
              onPress={() => router.push(groupTaskHref(org.id, task.id))}
            />
          ))}
        </Section>
      ) : null}

      {/* One list for everyone; an admin's extra buttons follow, in their own colour. */}
      <VStack gap={3} className="pt-4" testID="group-actions">
        <SectionHeader title={t('groups.home.actions')} />
        <View className="px-4">
          {/* The banner below is the way into the cuota, so it needs no button of its own. */}
          <GroupSectionGrid
            sections={homeButtons(cuotaBanner ? member.filter((s) => s !== 'cuota') : member, avisosRowShown)}
            adminSections={admin}
            badges={badges}
            onOpen={open}
          />
        </View>
      </VStack>

      {/* ── The member's cuota, closing the page as the fiestas button closes the village's ── */}
      {cuotaBanner ? (
        <CuotaBanner
          label={t('groups.summary.cuota', { period: periodLabel(cuotaBanner.period) })}
          status={cuotaBanner.status}
          onPress={() => open('cuota')}
        />
      ) : null}
    </ScrollView>
  );
}

import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { iconSizes, palette } from '@cultuvilla/shared/design-system';
import type { GroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { Avatar, HStack, Pressable, Text, VStack } from '../../primitives';
import { FormModal } from '../../layout/FormModal';
import { useT } from '../../../lib/i18n';
import {
  leaderboardEvents,
  taskLeaderboard,
  type LeaderboardPeriod,
  type LeaderboardRow,
  type TaskGroupEvent,
} from '../../../lib/orgs/taskBoard';
import type { MemberFace } from '../../../lib/orgs/useOrgMembers';

function initialOf(name: string | undefined): string {
  return name && name !== '…' ? name.slice(0, 1).toUpperCase() : '';
}

/**
 * The top of the leaderboard on the Tareas screen: the three who did the most
 * this year and the viewer's own place. Tapping it opens the full board. Hidden
 * until someone has done a task.
 */
export function LeaderboardStrip({
  rows,
  uid,
  faces,
  nameOf,
  onOpen,
}: {
  rows: readonly LeaderboardRow[];
  uid: string;
  faces: Record<string, MemberFace>;
  nameOf: (uid: string) => string;
  onOpen: () => void;
}) {
  const { t } = useT();
  const mine = rows.find((r) => r.uid === uid);
  // Tied for first, the viewer is the one named: "Admin lleva 2 · Tú vas 1.º con 2" reads as if they trailed.
  const top = mine?.rank === 1 ? mine : rows[0];
  if (!top) return null;
  return (
    <Pressable
      testID="task-leaderboard-strip"
      accessibilityRole="button"
      onPress={onOpen}
      className="bg-surface-elevated rounded-xl px-3 py-2.5"
    >
      <HStack gap={3} className="items-center">
        <HStack>
          {rows.slice(0, 3).map((r, i) => (
            <View key={r.uid} style={{ marginLeft: i === 0 ? 0 : -8 }} className="rounded-full border-2 border-surface">
              <Avatar uri={faces[r.uid]?.photoURL ?? null} size={30} initials={initialOf(faces[r.uid]?.name ?? nameOf(r.uid))} />
            </View>
          ))}
        </HStack>
        <VStack gap={0} className="flex-1">
          <Text variant="bodySm" className="font-bold" numberOfLines={1}>
            {top.uid === uid
              ? t('groups.tasks.leaderboard.youLead', { count: top.count })
              : t('groups.tasks.leaderboard.leads', { name: nameOf(top.uid), count: top.count })}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {mine && mine.uid !== top.uid
              ? t('groups.tasks.leaderboard.yourPlace', { rank: mine.rank, count: mine.count })
              : t('groups.tasks.leaderboard.seeAll')}
          </Text>
        </VStack>
        <Ionicons name="chevron-forward" size={iconSizes.sm} color={palette.sage} />
      </HStack>
    </Pressable>
  );
}

/**
 * The full leaderboard: who has done the group's tasks, most first, with a bar
 * each, for this year, this month or one event. The viewer's row stands out,
 * and only they see how far they are from the next place, with a way to the
 * tasks nobody has taken yet.
 */
export function LeaderboardSheet({
  visible,
  onClose,
  doneTasks,
  memberUids,
  events,
  uid,
  faces,
  nameOf,
  unassignedCount,
  onShowUnassigned,
}: {
  visible: boolean;
  onClose: () => void;
  doneTasks: readonly GroupTask[];
  memberUids: readonly string[];
  events: readonly TaskGroupEvent[];
  uid: string;
  faces: Record<string, MemberFace>;
  nameOf: (uid: string) => string;
  unassignedCount: number;
  onShowUnassigned: () => void;
}) {
  const { t } = useT();
  const [period, setPeriod] = useState<LeaderboardPeriod>({ kind: 'year' });
  const recent = useMemo(() => leaderboardEvents(doneTasks, events), [doneTasks, events]);
  const rows = useMemo(() => taskLeaderboard(doneTasks, memberUids, period), [doneTasks, memberUids, period]);
  const max = rows[0]?.count ?? 1;
  const mineAt = rows.findIndex((r) => r.uid === uid);
  const ahead = mineAt > 0 ? rows.slice(0, mineAt).reverse().find((r) => r.count > (rows[mineAt]?.count ?? 0)) : undefined;

  const periods: { key: string; label: string; value: LeaderboardPeriod }[] = [
    { key: 'year', label: t('groups.tasks.leaderboard.year'), value: { kind: 'year' } },
    { key: 'month', label: t('groups.tasks.leaderboard.month'), value: { kind: 'month' } },
    ...recent.map((e) => ({ key: e.id, label: e.title, value: { kind: 'event' as const, eventId: e.id } })),
  ];
  const periodKey = period.kind === 'event' ? period.eventId : period.kind;

  return (
    <FormModal visible={visible} onClose={onClose} title={t('groups.tasks.leaderboard.title')} testID="task-leaderboard">
      <ScrollView contentContainerClassName="px-4 pt-3 pb-10 gap-3">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" testID="task-leaderboard-periods">
          {periods.map((p) => {
            const chosen = p.key === periodKey;
            return (
              <Pressable
                key={p.key}
                testID={`task-leaderboard-period-${p.key}`}
                accessibilityRole="button"
                accessibilityState={{ selected: chosen }}
                onPress={() => setPeriod(p.value)}
                className={`px-3 py-1.5 rounded-full border ${chosen ? 'bg-secondary border-secondary' : 'bg-surface-elevated border-subtle'}`}
              >
                <Text variant="bodySm" tone={chosen ? 'onSecondary' : 'primary'} className="font-semibold" numberOfLines={1}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {rows.length === 0 ? (
          <Text tone="muted" className="py-6 text-center" testID="task-leaderboard-empty">
            {t('groups.tasks.leaderboard.empty')}
          </Text>
        ) : (
          <VStack gap={1} className="bg-surface-elevated rounded-xl p-2">
            {rows.map((r) => {
              const me = r.uid === uid;
              return (
                <HStack
                  key={r.uid}
                  gap={3}
                  className={`items-center rounded-lg px-2 py-2 ${me ? 'bg-accent-subtle/25 border border-subtle' : ''}`}
                  testID={`task-leaderboard-row-${r.uid}`}
                >
                  <Text className="font-bold text-center" tone="muted" style={{ width: 22 }}>
                    {r.rank}
                  </Text>
                  <Avatar uri={faces[r.uid]?.photoURL ?? null} size={32} initials={initialOf(faces[r.uid]?.name ?? nameOf(r.uid))} />
                  <VStack gap={1} className="flex-1">
                    <Text className="font-semibold" numberOfLines={1}>
                      {me ? t('groups.tasks.leaderboard.you') : nameOf(r.uid)}
                    </Text>
                    <View className="h-1.5 rounded-full bg-skeleton overflow-hidden">
                      <View className="h-full rounded-full bg-accent-subtle" style={{ width: `${Math.round((r.count / max) * 100)}%` }} />
                    </View>
                  </VStack>
                  <Text className="font-bold">{r.count}</Text>
                </HStack>
              );
            })}
          </VStack>
        )}

        <VStack gap={1} testID="task-leaderboard-nudge">
          <Text variant="bodySm" tone="muted">
            {mineAt === 0
              ? t('groups.tasks.leaderboard.nudgeFirst')
              : ahead
                ? t('groups.tasks.leaderboard.nudgeBehind', { count: ahead.count - (rows[mineAt]?.count ?? 0) + 1, name: nameOf(ahead.uid) })
                : mineAt < 0
                  ? t('groups.tasks.leaderboard.nudgeNone')
                  : t('groups.tasks.leaderboard.nudgeTied')}
          </Text>
          {unassignedCount > 0 ? (
            <Pressable testID="task-leaderboard-unassigned" accessibilityRole="button" onPress={onShowUnassigned} hitSlop={8}>
              <Text variant="bodySm" className="text-accent font-semibold">
                {t('groups.tasks.leaderboard.unassigned', { count: unassignedCount })}
              </Text>
            </Pressable>
          ) : null}
        </VStack>
      </ScrollView>
    </FormModal>
  );
}

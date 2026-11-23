import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { iconSizes, palette } from '@cultuvilla/shared/design-system';
import type { GroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { Avatar, Card, HStack, Pressable, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import {
  leaderboardEvents,
  taskLeaderboard,
  type LeaderboardPeriod,
  type TaskGroupEvent,
} from '../../../lib/orgs/taskBoard';
import type { MemberFace } from '../../../lib/orgs/useOrgMembers';

function initialOf(name: string | undefined): string {
  return name && name !== '…' ? name.slice(0, 1).toUpperCase() : '';
}

/**
 * The leaderboard, a card closing the Tareas screen: who has done the group's
 * tasks, most first, with a bar each, for this year, this month or one event.
 * The viewer's row stands out, and only they see how far they are from the next
 * place, with a way to the tasks nobody has taken yet. Hidden until someone has
 * done a task.
 */
export function LeaderboardCard({
  doneTasks,
  memberUids,
  events,
  uid,
  faces,
  nameOf,
  unassignedCount,
  onShowUnassigned,
}: {
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
  const anyThisYear = useMemo(() => taskLeaderboard(doneTasks, memberUids, { kind: 'year' }).length > 0, [doneTasks, memberUids]);
  const max = rows[0]?.count ?? 1;
  const mineAt = rows.findIndex((r) => r.uid === uid);
  const ahead = mineAt > 0 ? rows.slice(0, mineAt).reverse().find((r) => r.count > (rows[mineAt]?.count ?? 0)) : undefined;

  const periods: { key: string; label: string; value: LeaderboardPeriod }[] = [
    { key: 'year', label: t('groups.tasks.leaderboard.year'), value: { kind: 'year' } },
    { key: 'month', label: t('groups.tasks.leaderboard.month'), value: { kind: 'month' } },
    ...recent.map((e) => ({ key: e.id, label: e.title, value: { kind: 'event' as const, eventId: e.id } })),
  ];
  const periodKey = period.kind === 'event' ? period.eventId : period.kind;
  if (!anyThisYear) return null;

  return (
    <Card variant="elevated" testID="task-leaderboard">
      <VStack gap={3}>
        <HStack gap={2} className="items-center">
          <Ionicons name="trophy-outline" size={iconSizes.md} color={palette.sage} />
          <Text className="font-bold flex-1">{t('groups.tasks.leaderboard.title')}</Text>
        </HStack>
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
          <VStack gap={1}>
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
      </VStack>
    </Card>
  );
}

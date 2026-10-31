import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { eventEndBoundary, isStartDayOver, type EventData } from '@cultuvilla/shared/models/event/EventDataModel';
import { periodLabel } from '@cultuvilla/shared/models/organization';
import { watchEventsByOrganization } from '@cultuvilla/shared/services/eventService';
import { formatDate, formatDayKey, type GroupSection } from '@cultuvilla/shared/utils';
import { Card, HStack, Pressable, Text, VStack } from '../../primitives';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { CUOTA_STATUS_TONE } from '../../../lib/orgs/cuota';
import { useMyCuota } from '../../../lib/orgs/useMyCuota';
import { useMyOpenTasks } from '../../../lib/orgs/useMyOpenTasks';

type Event = EventData & { id: string };

type Tone = 'primary' | 'muted' | 'success' | 'danger';

interface Line {
  key: string;
  label: string;
  value?: string;
  tone?: Tone;
  section: GroupSection;
}

/**
 * "Lo próximo" on the group home: the next event, the member's next task and
 * their cuota for this period, each a tap away from its screen.
 */
export function GroupSummary({
  orgId,
  uid,
  roster,
  includePrivate,
  onOpen,
}: {
  orgId: string;
  uid: string;
  roster: boolean;
  includePrivate: boolean;
  onOpen: (section: GroupSection) => void;
}) {
  const { t } = useT();
  const events = useWatch<Event[]>(
    'orgDetail:watchEventsByOrganization',
    `${orgId}|${includePrivate}`,
    (next, error) => watchEventsByOrganization(orgId, { includePrivate }, next, error),
  );
  const tasks = useMyOpenTasks(orgId, uid);
  const cuota = useMyCuota(orgId, roster ? uid : null);

  const nextEvent = useMemo(() => {
    const now = new Date();
    return [...(events.data ?? [])]
      .filter((e) => !isStartDayOver(eventEndBoundary(e), now))
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];
  }, [events.data]);
  const nextTask = tasks.mine[0] ?? tasks.shifts[0];
  const ownStatus = cuota.statuses.find((s) => cuota.rows.find((r) => r.id === s.socioId)?.kind === 'member') ?? cuota.statuses[0];

  const lines: Line[] = [];
  if (nextEvent) {
    lines.push({ key: 'event', label: nextEvent.title, value: formatDate(nextEvent.startDate, 'short'), section: 'eventos' });
  }
  if (nextTask) {
    lines.push({
      key: 'task',
      label: nextTask.title,
      value: nextTask.dueOn ? formatDayKey(nextTask.dueOn) : undefined,
      section: 'tareas',
    });
  }
  if (roster && ownStatus && cuota.periodKey) {
    lines.push({
      key: 'cuota',
      label: t('groups.summary.cuota', { period: periodLabel(cuota.periodKey) }),
      value: t(`groups.cuota.status.${ownStatus.status}`),
      tone: CUOTA_STATUS_TONE[ownStatus.status],
      section: 'cuota',
    });
  }

  const settled = events.status !== 'loading' && tasks.status !== 'loading' && (!roster || cuota.settled);

  return (
    <Card testID="group-summary">
      <VStack gap={1}>
        <Text variant="caption" tone="muted" className="font-bold uppercase">
          {t('groups.summary.title')}
        </Text>
        {lines.map((line) => (
          <Pressable
            key={line.key}
            testID={`group-summary-${line.key}`}
            accessibilityRole="button"
            onPress={() => onOpen(line.section)}
            className="py-2"
          >
            <HStack gap={2} align="center">
              <Text className="flex-1" numberOfLines={1}>
                {line.label}
              </Text>
              {line.value ? (
                <Text variant="bodySm" tone={line.tone ?? 'muted'} className={line.tone ? 'font-bold' : ''}>
                  {line.value}
                </Text>
              ) : null}
              <Ionicons name="chevron-forward" size={iconSizes.sm} color={colors.light.fg.muted} />
            </HStack>
          </Pressable>
        ))}
        {lines.length === 0 && settled ? (
          <Text tone="muted" variant="bodySm" className="py-2" testID="group-summary-empty">
            {t('groups.summary.nothing')}
          </Text>
        ) : null}
      </VStack>
    </Card>
  );
}

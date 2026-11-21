import { router } from 'expo-router';
import { fiestaEditionPhase, fiestaProgrammeDays, daysUntilFiestaEdition, type EventData, type DayKey, type FiestaBlock } from '@cultuvilla/shared/models';
import { formatDate, formatDayKey } from '@cultuvilla/shared/utils';
import { Button, HStack, Pressable, Text, VStack } from '../../primitives';
import { eventHref } from '../../../lib/navigation/routes';
import { formatDayRange } from '../../../lib/date/dayRange';
import { useT } from '../../../lib/i18n';
import type { NamedEdition } from '../../../lib/fiestas/villageFiestas';
import { FiestaEditionEditor } from './FiestaEditionEditor';

type ProgrammeEvent = EventData & { id: string };

interface Props {
  municipalityId: string;
  villageSlug: string;
  year: number;
  today: DayKey;
  /** The year's editions, oldest first. */
  editions: NamedEdition[];
  /** Every public event tagged to one of them. */
  events: ProgrammeEvent[];
  /** Blocks with no edition this year, offered to a member to date. */
  undated: FiestaBlock[];
  uid: string | null;
  canPropose: boolean;
  canEdit: (edition: NamedEdition) => boolean;
  /** The block whose editor is open, if any. */
  editing: string | null;
  onEdit: (blockId: string | null) => void;
}

/**
 * The programa de fiestas: each of the year's editions with its days, and on
 * each day its events by start time. While an edition is on, today leads and
 * reads «Hoy». The block being dated opens its editor in place.
 */
export function FiestaProgramme({
  municipalityId,
  villageSlug,
  year,
  today,
  editions,
  events,
  undated,
  uid,
  canPropose,
  canEdit,
  editing,
  onEdit,
}: Props) {
  const { t } = useT();
  return (
    <VStack gap={6}>
      {editions.map((edition) => {
        const phase = fiestaEditionPhase(edition, today);
        const days = fiestaProgrammeDays(
          events.filter((e) => e.fiestaEditionId === edition.id),
          phase === 'running' ? today : undefined,
        );
        const phaseLabel =
          phase === 'upcoming'
            ? t('village.fiestas.programme.phaseUpcoming', { days: daysUntilFiestaEdition(edition, today) })
            : phase === 'running'
              ? t('village.fiestas.programme.phaseRunning')
              : t('village.fiestas.programme.phaseOver');
        return (
          <VStack key={edition.id} gap={3} testID={`fiesta-edition-${edition.blockId}`}>
            <VStack gap={1}>
              <Text variant="h2">{edition.block.name}</Text>
              <Text tone="muted" variant="bodySm">
                {`${formatDayRange(edition)} · ${phaseLabel}`}
              </Text>
            </VStack>
            {editing === edition.blockId && uid ? (
              <FiestaEditionEditor
                municipalityId={municipalityId}
                block={edition.block}
                year={year}
                edition={edition}
                uid={uid}
                canDelete={canEdit(edition)}
                onDone={() => onEdit(null)}
              />
            ) : canEdit(edition) ? (
              <Button variant="ghost" onPress={() => onEdit(edition.blockId)} testID={`fiesta-edition-edit-${edition.blockId}`}>
                {t('village.fiestas.programme.editDates')}
              </Button>
            ) : null}
            {days.length === 0 ? (
              <Text tone="muted" testID={`fiesta-programme-empty-${edition.blockId}`}>
                {t('village.fiestas.programme.empty')}
              </Text>
            ) : (
              days.map((day) => (
                <VStack key={day.day} gap={2} testID={`fiesta-programme-day-${day.day}`}>
                  <Text variant="h3">
                    {day.day === today ? t('village.fiestas.programme.today') : formatDayKey(day.day, 'weekdayDayMonth')}
                  </Text>
                  {day.events.map((e) => (
                    <Pressable
                      key={e.id}
                      onPress={() => router.push(eventHref({ ...e, villageSlug }))}
                      accessibilityRole="button"
                      className="rounded-md border border-subtle bg-surface p-3"
                      testID={`fiesta-programme-event-${e.id}`}
                    >
                      <HStack gap={3} className="items-start">
                        <Text className="w-14 font-semibold">{formatDate(e.startDate, 'time')}</Text>
                        <VStack gap={0} className="flex-1">
                          <Text className="font-semibold">{e.title}</Text>
                          {e.location.displayName ? (
                            <Text tone="muted" variant="bodySm">
                              {e.location.displayName}
                            </Text>
                          ) : null}
                        </VStack>
                      </HStack>
                    </Pressable>
                  ))}
                </VStack>
              ))
            )}
          </VStack>
        );
      })}

      {canPropose && uid
        ? undated.map((block) =>
            editing === block.id ? (
              <FiestaEditionEditor
                key={block.id}
                municipalityId={municipalityId}
                block={block}
                year={year}
                edition={null}
                uid={uid}
                canDelete={false}
                onDone={() => onEdit(null)}
              />
            ) : (
              <Button key={block.id} variant="secondary" onPress={() => onEdit(block.id)} fullWidth testID={`fiesta-edition-add-${block.id}`}>
                {t('village.fiestas.programme.addDates', { name: block.name })}
              </Button>
            ),
          )
        : null}
    </VStack>
  );
}

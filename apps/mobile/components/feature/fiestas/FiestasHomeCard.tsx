import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { madridDayKey } from '@cultuvilla/shared/models';
import { Button, HStack, Text, VStack } from '../../primitives';
import { wrappedHref } from '../../../lib/navigation/routes';
import { formatDayRange } from '../../../lib/date/dayRange';
import { useVillageFiestas } from '../../../lib/fiestas/useVillageFiestas';
import { fiestasHomeCard } from '../../../lib/fiestas/villageFiestas';
import { useT } from '../../../lib/i18n';

interface Props {
  municipalityId: string;
  villageSlug: string;
  isMember: boolean;
}

/**
 * The fiestas near the top of the village home: the programme of an edition
 * that is on or coming up, or — for a member, in the month a block is due —
 * an invitation to add its days so a programme can exist. Says nothing the
 * rest of the year (`fiestasHomeCard`).
 */
export function FiestasHomeCard({ municipalityId, villageSlug, isMember }: Props) {
  const { t } = useT();
  const { fiestas, editions, status } = useVillageFiestas(municipalityId);
  if (status !== 'ready') return null;
  const card = fiestasHomeCard(fiestas, editions, madridDayKey(new Date()), isMember);
  if (!card) return null;

  if (card.kind === 'programme') {
    const { edition } = card;
    const dates = formatDayRange(edition);
    return (
      <VStack gap={2} className="mx-4 mt-4 rounded-md border border-subtle bg-surface-elevated p-4" testID="fiestas-home-programme">
        <HStack gap={2} className="items-center">
          <Ionicons name="calendar-outline" size={iconSizes.md} color={colors.light.fg.muted} />
          <Text className="flex-1 font-semibold">
            {t('village.fiestas.programme.homeTitle', { name: edition.block.name, year: String(edition.year) })}
          </Text>
        </HStack>
        <Text variant="bodySm" tone="muted">
          {card.phase === 'running'
            ? t('village.fiestas.programme.homeRunning', { dates })
            : t('village.fiestas.programme.homeUpcoming', { days: card.daysToGo, dates })}
        </Text>
        <Button onPress={() => router.push(wrappedHref(villageSlug, edition.year))} fullWidth testID="fiestas-home-programme-open">
          {t('village.fiestas.programme.homeOpen')}
        </Button>
      </VStack>
    );
  }

  return (
    <VStack gap={2} className="mx-4 mt-4 rounded-md border border-subtle bg-surface-elevated p-4" testID="fiestas-home-propose">
      <HStack gap={2} className="items-center">
        <Ionicons name="calendar-outline" size={iconSizes.md} color={colors.light.fg.muted} />
        <Text className="flex-1 font-semibold">
          {t('village.fiestas.programme.proposeTitle', { name: card.block.name, year: String(card.year) })}
        </Text>
      </HStack>
      <Text variant="bodySm" tone="muted">
        {t('village.fiestas.programme.proposeBody')}
      </Text>
      <Button
        variant="secondary"
        onPress={() => router.push(wrappedHref(villageSlug, card.year, `fechas=${encodeURIComponent(card.block.id)}`))}
        fullWidth
        testID="fiestas-home-propose-open"
      >
        {t('village.fiestas.programme.proposeAction')}
      </Button>
    </VStack>
  );
}

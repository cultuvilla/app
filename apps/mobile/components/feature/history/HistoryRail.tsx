import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { iconSizes, palette, spacing } from '@cultuvilla/shared/design-system';
import { formatHistoryEntryYears } from '@cultuvilla/shared/utils';
import type { HistoryEntryWithId } from '@cultuvilla/shared/services/historyService';
import { Pressable, Text, VStack } from '../../primitives';
import { RemoteImage } from '../../primitives/RemoteImage';
import { SectionHeader } from '../VillageSections';
import { historyEntryHref, villageSectionHref } from '../../../lib/navigation/routes';
import { useT } from '../../../lib/i18n';

const CARD_W = 200;
const MEDIA_H = 120;
const DOT = 12;
/** Year label line height + the gap above the dot, so the rail runs through the dots' centres. */
const RAIL_TOP = 21 + 5 + DOT / 2 - 1;

/**
 * The village home's history section: the timeline laid on its side, oldest
 * first, with a year on the rail above each card. A card shows the entry's
 * cover photo when it has one and the start of its story when it doesn't, so a
 * village without old photos still gets a full-looking timeline.
 */
export function HistoryRail({
  entries,
  villageSlug,
}: {
  entries: readonly HistoryEntryWithId[];
  villageSlug: string;
}) {
  const { t } = useT();
  if (entries.length === 0) return null;

  return (
    <VStack gap={3} className="pt-4">
      <SectionHeader
        title={t('village.history.title')}
        actionLabel={t('village.home.seeAll')}
        onAction={() => router.push(villageSectionHref(villageSlug, 'historia'))}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing[4], gap: spacing[4] }}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: RAIL_TOP,
            height: 2,
            backgroundColor: palette.peach,
          }}
        />
        {entries.map((entry) => {
          const cover = entry.images[0]?.url ?? null;
          return (
            <Pressable
              key={entry.id}
              onPress={() =>
                router.push(historyEntryHref({ id: entry.id, title: entry.title, villageSlug }))
              }
              accessibilityRole="button"
              accessibilityLabel={entry.title}
              testID={`home-history-${entry.id}`}
              style={{ width: CARD_W }}
            >
              <Text variant="bodySm" className="font-bold text-accent">
                {formatHistoryEntryYears(entry)}
              </Text>
              <View
                style={{
                  width: DOT,
                  height: DOT,
                  borderRadius: DOT / 2,
                  marginTop: 5,
                  marginBottom: spacing[3],
                  backgroundColor: palette.terracotta,
                  borderWidth: 2,
                  borderColor: palette.cream,
                }}
              />
              {cover ? (
                <View className="rounded-xl overflow-hidden" style={{ height: MEDIA_H }}>
                  <RemoteImage uri={cover} variant="card" style={{ width: CARD_W, height: MEDIA_H }} />
                </View>
              ) : entry.body.text ? (
                <View
                  className="rounded-xl bg-surface-elevated border border-subtle overflow-hidden"
                  style={{ height: MEDIA_H, padding: spacing[3] }}
                >
                  <Text variant="bodySm" className="text-on-subtle" numberOfLines={4}>
                    {entry.body.text}
                  </Text>
                </View>
              ) : (
                <View
                  className="rounded-xl bg-subtle items-center justify-center"
                  style={{ height: MEDIA_H }}
                >
                  <Ionicons name="time-outline" size={iconSizes.lg} color={palette.cream} />
                </View>
              )}
              <Text className="font-bold" numberOfLines={2} style={{ marginTop: spacing[2] }}>
                {entry.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </VStack>
  );
}

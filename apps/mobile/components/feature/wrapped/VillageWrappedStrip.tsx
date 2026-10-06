import { useEffect, useState } from 'react';
import { Image, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { WRAPPED_CARDS } from '@cultuvilla/shared/models';
import { getPublishedVillageWrapped, type VillageWrapped } from '@cultuvilla/shared/services/villageWrappedService';
import { Pressable, Text } from '../../primitives';
import { wrappedHref } from '../../../lib/navigation/routes';
import { withFirestoreErrorLog } from '../../../lib/firestoreErrorLog';
import { useT } from '../../../lib/i18n';

/** Same slot shape as the village map (`LocationMap`), so the two read as one family. */
const STRIP_ASPECT = 2.5;
const CARD_ASPECT = 1080 / 1920;
const INSET = 8;
const GAP = 6;
/** The village home's horizontal padding (`px-4`) on each side. */
const PAGE_GUTTER = 16 * 2;

/**
 * The village's latest published fiestas Wrapped on its home: a map-sized
 * rectangle showing the cards side by side, opening the story. Visible to
 * everyone, the anonymous web reader included — the Wrapped is public. Stays
 * until a newer year replaces it; renders nothing when there is none.
 */
export function VillageWrappedStrip({ municipalityId, villageSlug }: { municipalityId: string; villageSlug: string }) {
  const { t } = useT();
  const { width } = useWindowDimensions();
  const [wrapped, setWrapped] = useState<VillageWrapped | null>(null);

  useEffect(() => {
    let cancelled = false;
    withFirestoreErrorLog('villageHome:getPublishedVillageWrapped', () => getPublishedVillageWrapped(municipalityId))
      .then((published) => {
        if (!cancelled) setWrapped(published[0] ?? null);
      })
      .catch(() => {
        // Decoration on the village home: a failed read hides the strip
        // (a denial is already reported by withFirestoreErrorLog).
      });
    return () => {
      cancelled = true;
    };
  }, [municipalityId]);

  if (!wrapped) return null;

  const stripWidth = width - PAGE_GUTTER;
  const cardHeight = stripWidth / STRIP_ASPECT - INSET * 2;
  const cardWidth = cardHeight * CARD_ASPECT;
  // Only the cards that show: the rest would be downloaded to be clipped.
  const visible = Math.ceil((stripWidth - INSET) / (cardWidth + GAP));
  const cards = WRAPPED_CARDS.flatMap((card) => {
    const url = wrapped.images[card];
    return url ? [{ card, url }] : [];
  }).slice(0, visible);
  const year = String(wrapped.year);

  return (
    <View className="px-4 pt-4">
      <Pressable
        testID="village-wrapped-strip"
        onPress={() => router.push(wrappedHref(villageSlug, wrapped.year))}
        accessibilityLabel={t('village.wrapped.strip.label', { year })}
      >
        <View
          className="flex-row overflow-hidden bg-surface-elevated"
          style={{ width: '100%', aspectRatio: STRIP_ASPECT, borderRadius: 16, padding: INSET, gap: GAP }}
        >
          {cards.map(({ card, url }) => (
            <Image
              key={card}
              source={{ uri: url }}
              style={{ width: cardWidth, height: cardHeight, borderRadius: 8 }}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ))}
        </View>
        <Text variant="bodySm" tone="muted" className="mt-1 text-right">
          {t('village.wrapped.strip.label', { year })}
        </Text>
      </Pressable>
    </View>
  );
}

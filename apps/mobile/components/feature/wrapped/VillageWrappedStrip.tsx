import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { getPublishedVillageWrapped, type VillageWrapped } from '@cultuvilla/shared/services/villageWrappedService';
import { Pressable, Text } from '../../primitives';
import { wrappedHref } from '../../../lib/navigation/routes';
import { withFirestoreErrorLog } from '../../../lib/firestoreErrorLog';
import { useT } from '../../../lib/i18n';

/** Same slot shape as the village map (`LocationMap`), so the two read as one family. */
const BUTTON_ASPECT = 2.5;

// Drawn once and bundled: a festive illustration, not a preview of the cards,
// so the button costs no download and looks the same for every village.
const ILLUSTRATION = require('../../../assets/wrapped/fiestas-button.svg') as number;

/**
 * The village's latest published fiestas Wrapped on its home: a map-sized
 * button that opens the story. Visible to everyone, the anonymous web reader
 * included — the Wrapped is public. Stays until a newer year replaces it;
 * renders nothing when there is none.
 */
export function VillageWrappedStrip({ municipalityId, villageSlug }: { municipalityId: string; villageSlug: string }) {
  const { t } = useT();
  const [wrapped, setWrapped] = useState<VillageWrapped | null>(null);

  useEffect(() => {
    let cancelled = false;
    withFirestoreErrorLog('villageHome:getPublishedVillageWrapped', () => getPublishedVillageWrapped(municipalityId))
      .then((published) => {
        if (!cancelled) setWrapped(published[0] ?? null);
      })
      .catch(() => {
        // Decoration on the village home: a failed read hides the button
        // (a denial is already reported by withFirestoreErrorLog).
      });
    return () => {
      cancelled = true;
    };
  }, [municipalityId]);

  if (!wrapped) return null;
  const label = t('village.wrapped.strip.label', { year: String(wrapped.year) });

  return (
    <View className="px-4 pt-4">
      <Pressable
        testID="village-wrapped-strip"
        onPress={() => router.push(wrappedHref(villageSlug, wrapped.year))}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View
          className="overflow-hidden bg-accent"
          style={{ width: '100%', aspectRatio: BUTTON_ASPECT, borderRadius: 16 }}
        >
          <Image
            source={ILLUSTRATION}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
            contentFit="cover"
            accessible={false}
          />
          <View className="flex-1 flex-row items-end justify-between p-4">
            <Text variant="h2" className="flex-1 font-bold" style={{ color: colors.light.fg['on-accent'] }}>
              {label}
            </Text>
            <Ionicons name="chevron-forward" size={iconSizes.md} color={colors.light.fg['on-accent']} />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

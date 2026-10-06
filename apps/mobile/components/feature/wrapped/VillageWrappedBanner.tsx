import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { getPublishedVillageWrapped, type VillageWrapped } from '@cultuvilla/shared/services/villageWrappedService';
import { freshWrapped } from '@cultuvilla/shared/wrapped';
import { HStack, Pressable, Text, VStack } from '../../primitives';
import { wrappedHref } from '../../../lib/navigation/routes';
import { useT } from '../../../lib/i18n';

const THUMB_WIDTH = 54;

/**
 * The village home's way into its latest fiestas Wrapped, for the weeks after
 * it is published. Visible to everyone, the anonymous web reader included —
 * the Wrapped is public. Renders nothing when there is no recent one.
 */
export function VillageWrappedBanner({ municipalityId, villageSlug }: { municipalityId: string; villageSlug: string }) {
  const { t } = useT();
  const [wrapped, setWrapped] = useState<VillageWrapped | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublishedVillageWrapped(municipalityId)
      .then((published) => {
        if (!cancelled) setWrapped(freshWrapped(published, new Date()));
      })
      .catch(() => {
        // Decoration on the village home: a failed read hides the banner.
      });
    return () => {
      cancelled = true;
    };
  }, [municipalityId]);

  if (!wrapped) return null;
  const cover = wrapped.images.cover;

  return (
    <Pressable
      testID="village-wrapped-banner"
      onPress={() => router.push(wrappedHref(villageSlug, wrapped.year))}
      className="mx-4 mt-4 rounded-md border border-subtle bg-surface-elevated p-3"
    >
      <HStack gap={3} className="items-center">
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={{ width: THUMB_WIDTH, height: (THUMB_WIDTH * 1920) / 1080, borderRadius: 6 }}
            accessibilityIgnoresInvertColors
          />
        ) : null}
        <VStack gap={1} className="flex-1">
          <Text className="font-semibold">{t('village.wrapped.banner.title', { year: String(wrapped.year) })}</Text>
          <Text variant="bodySm" tone="muted">
            {t('village.wrapped.banner.body')}
          </Text>
        </VStack>
        <Ionicons name="chevron-forward" size={iconSizes.md} color={colors.light.fg.muted} />
      </HStack>
    </Pressable>
  );
}

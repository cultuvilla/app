import { useState } from 'react';
import { Image, Modal, Pressable as RNPressable, View, useWindowDimensions } from 'react-native';
import { WRAPPED_CARDS, type WrappedData } from '@cultuvilla/shared/models';
import { Button, HStack, Text, VStack } from '../../primitives';
import { WrappedStoryViewer } from './WrappedStoryViewer';
import { useWrappedShare } from '../../../lib/wrapped/useWrappedShare';
import { useT } from '../../../lib/i18n';

const CARD_ASPECT = 1920 / 1080;
const COLUMNS = 3;
const GAP = 8;

interface Props {
  wrapped: Pick<WrappedData, 'status' | 'images' | 'autoPublishAt' | 'villageName' | 'year'>;
  villageSlug: string;
  onPublish: () => void;
  onDiscard: () => void;
  deciding: boolean;
}

/**
 * The rendered cards with the admin's decision on a draft. Each thumbnail
 * opens the same story the village will see, so what the admin approves is
 * exactly what gets published. Sharing appears only once it is published: a
 * draft is not the admin's to forward yet.
 */
export function WrappedReview({ wrapped, villageSlug, onPublish, onDiscard, deciding }: Props) {
  const { t } = useT();
  const { width } = useWindowDimensions();
  const [openAt, setOpenAt] = useState<number | null>(null);
  const share = useWrappedShare({ villageSlug, villageName: wrapped.villageName, year: wrapped.year });
  const published = wrapped.status === 'published';
  const thumbWidth = (Math.min(width, 480) - 32 - GAP * (COLUMNS - 1)) / COLUMNS;
  const cards = WRAPPED_CARDS.flatMap((card) => {
    const url = wrapped.images[card];
    return url ? [{ card, url }] : [];
  });

  return (
    <VStack gap={4}>
      <View className="rounded-md bg-surface-elevated p-3" testID="wrapped-status">
        <Text variant="h3">{t(`village.wrapped.status.${wrapped.status}`)}</Text>
        <Text variant="caption" tone="muted">
          {wrapped.status === 'draft'
            ? wrapped.autoPublishAt
              ? t('village.wrapped.draftAutoPublish')
              : t('village.wrapped.draftHeldBack')
            : t(`village.wrapped.statusHelp.${wrapped.status}`)}
        </Text>
      </View>

      {wrapped.status === 'draft' ? (
        <HStack gap={2}>
          <View className="flex-1">
            <Button variant="secondary" onPress={onDiscard} disabled={deciding} fullWidth testID="wrapped-discard">
              {t('village.wrapped.discard')}
            </Button>
          </View>
          <View className="flex-1">
            <Button onPress={onPublish} loading={deciding} disabled={deciding} fullWidth testID="wrapped-publish">
              {t('village.wrapped.publish')}
            </Button>
          </View>
        </HStack>
      ) : null}

      <Button variant="secondary" onPress={() => setOpenAt(0)} fullWidth testID="wrapped-preview">
        {t('village.wrapped.preview')}
      </Button>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
        {cards.map(({ card, url }, i) => (
          <RNPressable key={card} onPress={() => setOpenAt(i)} accessibilityRole="button">
            <Image
              source={{ uri: url }}
              accessibilityLabel={t(`village.wrapped.card.${card}`)}
              testID={`wrapped-card-${card}`}
              style={{ width: thumbWidth, height: thumbWidth * CARD_ASPECT, borderRadius: 8 }}
              resizeMode="cover"
            />
          </RNPressable>
        ))}
      </View>

      <Modal visible={openAt !== null} animationType="fade" onRequestClose={() => setOpenAt(null)}>
        {openAt !== null ? (
          <WrappedStoryViewer
            cards={cards}
            initialIndex={openAt}
            title={t('village.wrapped.viewer.title', { name: wrapped.villageName, year: String(wrapped.year) })}
            onClose={() => setOpenAt(null)}
            onShareLink={published ? share.shareLink : undefined}
            onShareCard={published ? share.shareCard : undefined}
          />
        ) : null}
      </Modal>
    </VStack>
  );
}

import { FlatList, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { iconSizes, palette } from '@cultuvilla/shared/design-system';
import { formatDayKey } from '@cultuvilla/shared/utils';
import type { Cosa, CosaRequest } from '@cultuvilla/shared/services/cosatecaService';
import { HStack, Pressable, Text, VStack } from '../../../primitives';
import { RemoteImage } from '../../../primitives/RemoteImage';
import { FormModal } from '../../../layout/FormModal';
import { CosaRequestRow } from './CosaRows';
import { COSA_CATEGORY_TILES, cosaCardSubtitle, cosaStatusChip, holdingUntil, type EnMarchaItem } from './escaparate';
import { useT } from '../../../../lib/i18n';
import { cosaRequestDatesLabel } from '../../../../lib/orgs/cosateca';

/** A cosa in the shop window: its photo (or its category's tile) with one status chip, its name, and who offers it and how. */
export function CosaCard({ cosa, onPress }: { cosa: Cosa; onPress: () => void }) {
  const { t } = useT();
  const chip = cosaStatusChip(t, cosa);
  const tile = COSA_CATEGORY_TILES[cosa.category];
  return (
    <Pressable
      testID={`cosa-card-${cosa.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${cosa.title}, ${chip.label}`}
      onPress={onPress}
      className="flex-1 bg-surface-elevated border border-subtle rounded-xl overflow-hidden"
    >
      <View className={`items-center justify-center ${cosa.imageURL ? '' : tile.className}`} style={{ aspectRatio: 4 / 3 }}>
        {cosa.imageURL ? (
          <RemoteImage uri={cosa.imageURL} variant="thumb" style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <View testID={`cosa-card-tile-${cosa.id}`}>
            <Ionicons name={tile.icon} size={iconSizes.lg * 2} color={palette.terracotta} />
          </View>
        )}
        <View className="absolute top-2 left-2 rounded-full px-2 py-0.5 bg-surface-elevated">
          <Text variant="caption" tone={chip.free ? 'success' : 'primary'} className="font-semibold" testID={`cosa-card-state-${cosa.id}`}>
            {chip.label}
          </Text>
        </View>
      </View>
      <VStack gap={1} className="px-2 pt-1.5 pb-2">
        <Text className="font-semibold" numberOfLines={1}>
          {cosa.title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1} testID={`cosa-card-subtitle-${cosa.id}`}>
          {cosaCardSubtitle(t, cosa)}
        </Text>
      </VStack>
    </Pressable>
  );
}

/** One card of the strip: a request to answer, or something the viewer holds and when it goes back. */
function EnMarchaCard({ item, onPress }: { item: EnMarchaItem; onPress: () => void }) {
  const { t } = useT();
  const r = item.request;
  const asked = item.type === 'asked';
  const until = asked ? null : holdingUntil(r);
  return (
    <Pressable
      testID={`cosateca-active-${r.id}`}
      accessibilityRole="button"
      onPress={onPress}
      className={`bg-surface-elevated border border-subtle rounded-xl p-3 ${asked ? 'border-l-4 border-l-accent' : ''}`}
      style={{ width: 180 }}
    >
      <VStack gap={1}>
        <Text className="font-semibold" numberOfLines={1}>
          {t(asked ? 'groups.cosateca.active.asked' : 'groups.cosateca.active.holding', { title: r.cosaTitle })}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {asked
            ? `${r.requesterName} · ${cosaRequestDatesLabel(t, r)}`
            : until
              ? t('groups.cosateca.active.backOn', { date: formatDayKey(until, 'dayMonthShort') })
              : t('groups.cosateca.active.passOn')}
        </Text>
        {asked && r.status === 'pending' ? (
          <Text variant="caption" className="text-accent font-bold pt-1">
            {t('groups.cosateca.active.answer')}
          </Text>
        ) : null}
      </VStack>
    </Pressable>
  );
}

/**
 * "En marcha": what others ask of the viewer and what they hold, above the
 * catalogue, with the way into every request. The strip shows only when there
 * is something; "Todo" whenever there is any request at all.
 */
export function EnMarchaStrip({
  items,
  total,
  onOpen,
  onAll,
}: {
  items: readonly EnMarchaItem[];
  total: number;
  onOpen: (requestId: string) => void;
  onAll: () => void;
}) {
  const { t } = useT();
  if (items.length === 0 && total === 0) return null;
  return (
    <VStack gap={2} testID="cosateca-active">
      <HStack className="items-center justify-between">
        {items.length > 0 ? (
          <Text variant="caption" className="font-bold uppercase tracking-wide">
            {t('groups.cosateca.active.title')}
          </Text>
        ) : (
          <View />
        )}
        {total > 0 ? (
          <Pressable testID="cosateca-inbox-open" accessibilityRole="button" onPress={onAll} hitSlop={8}>
            <Text variant="bodySm" className="text-accent font-semibold">
              {t('groups.cosateca.active.all', { count: total })}
            </Text>
          </Pressable>
        ) : null}
      </HStack>
      {items.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" testID="cosateca-active-strip">
          {items.map((item) => (
            <EnMarchaCard key={item.request.id} item={item} onPress={() => onOpen(item.request.id)} />
          ))}
        </ScrollView>
      ) : null}
    </VStack>
  );
}

/** Every request in the group, asked by the viewer or of them, in one list. */
export function CosaInboxSheet({
  visible,
  requests,
  uid,
  onOpen,
  onClose,
}: {
  visible: boolean;
  requests: readonly CosaRequest[];
  uid: string;
  onOpen: (requestId: string) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  return (
    <FormModal visible={visible} onClose={onClose} title={t('groups.cosateca.inbox.all')} testID="cosateca-inbox">
      <FlatList
        data={requests}
        keyExtractor={(r) => r.id}
        contentContainerClassName="px-4 pt-3 pb-8 gap-2"
        ListEmptyComponent={
          <Text tone="muted" className="py-6 text-center">
            {t('groups.cosateca.inbox.empty')}
          </Text>
        }
        renderItem={({ item }) => (
          <CosaRequestRow request={item} showRequester={item.requesterUid !== uid} onPress={() => onOpen(item.id)} />
        )}
      />
    </FormModal>
  );
}

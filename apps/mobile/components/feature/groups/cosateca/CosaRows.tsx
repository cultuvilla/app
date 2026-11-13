import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { iconSizes, palette } from '@cultuvilla/shared/design-system';
import { cosaAvailability, type CosaCategory } from '@cultuvilla/shared/models/organization';
import type { Cosa, CosaRequest } from '@cultuvilla/shared/services/cosatecaService';
import { HStack, Pressable, Text, VStack } from '../../../primitives';
import { RemoteImage } from '../../../primitives/RemoteImage';
import { useT } from '../../../../lib/i18n';
import { cosaAvailabilityLabel, cosaOwnerLabel, cosaRequestDatesLabel } from '../../../../lib/orgs/cosateca';

const THUMB = 56;

/** A small rounded label: the kind of a cosa, or the state of a request. */
export function Badge({ label, strong = false, testID }: { label: string; strong?: boolean; testID?: string }) {
  return (
    <View className={`rounded-full px-2 py-0.5 ${strong ? 'bg-accent' : 'bg-accent-subtle/30'}`} testID={testID}>
      <Text variant="caption" tone={strong ? 'onAccent' : 'primary'} className="font-medium">
        {label}
      </Text>
    </View>
  );
}

/** One cosa in a catalogue: its photo, what it is, who offers it, where it is kept, and whether it can be asked for. */
export function CosaRow({ cosa, subtitle, onPress }: { cosa: Cosa; subtitle?: string; onPress: () => void }) {
  const { t } = useT();
  const free = cosaAvailability(cosa) === 'available';
  return (
    <Pressable
      testID={`cosa-row-${cosa.id}`}
      accessibilityRole="button"
      accessibilityLabel={cosa.title}
      onPress={onPress}
      className="bg-surface border border-subtle rounded-xl p-3"
    >
      <HStack gap={3} className="items-center">
        <View className="overflow-hidden rounded-md bg-accent-subtle/30 items-center justify-center" style={{ width: THUMB, height: THUMB }}>
          {cosa.imageURL ? (
            <RemoteImage uri={cosa.imageURL} variant="thumb" style={{ width: THUMB, height: THUMB }} contentFit="cover" />
          ) : (
            <Ionicons name="cube-outline" size={iconSizes.lg} color={palette.terracotta} />
          )}
        </View>
        <VStack gap={1} className="flex-1">
          <Text className="font-semibold" numberOfLines={1}>
            {cosa.title}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {subtitle ?? cosaOwnerLabel(t, cosa)}
          </Text>
          {cosa.locationNote ? (
            <HStack gap={1} className="items-center">
              <Ionicons name="location-outline" size={iconSizes.sm} color={palette.terracotta} />
              <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1" testID={`cosa-row-where-${cosa.id}`}>
                {cosa.locationNote}
              </Text>
            </HStack>
          ) : null}
          <HStack gap={2} className="items-center flex-wrap">
            <Badge label={t(`groups.cosateca.kinds.${cosa.kind}`)} />
            <Text variant="caption" tone={free ? 'success' : 'muted'} testID={`cosa-row-state-${cosa.id}`}>
              {cosaAvailabilityLabel(t, cosa)}
            </Text>
          </HStack>
        </VStack>
      </HStack>
    </Pressable>
  );
}

/** One request in a list: the cosa, who asked (when it is to you), the dates, and its state. */
export function CosaRequestRow({
  request,
  showRequester,
  onPress,
}: {
  request: CosaRequest;
  showRequester: boolean;
  onPress: () => void;
}) {
  const { t } = useT();
  return (
    <Pressable
      testID={`cosa-request-row-${request.id}`}
      accessibilityRole="button"
      accessibilityLabel={request.cosaTitle}
      onPress={onPress}
      className="bg-surface border border-subtle rounded-xl p-3"
    >
      <HStack gap={2} className="items-center justify-between">
        <VStack gap={1} className="flex-1">
          <Text className="font-semibold" numberOfLines={1}>
            {showRequester ? t('groups.cosateca.inbox.row', { name: request.requesterName, title: request.cosaTitle }) : request.cosaTitle}
          </Text>
          <Text variant="caption" tone="muted">
            {cosaRequestDatesLabel(t, request)}
          </Text>
        </VStack>
        <Badge label={t(`groups.cosateca.status.${request.status}`)} strong={request.status === 'pending'} />
      </HStack>
    </Pressable>
  );
}

/** The categories as chips, one chosen; with `withAll`, a "Todo" chip first that chooses none. */
export function CategoryChips({
  categories,
  value,
  onChange,
  withAll = true,
  testID = 'cosa-categories',
}: {
  categories: readonly CosaCategory[];
  value: CosaCategory | null;
  onChange: (next: CosaCategory | null) => void;
  withAll?: boolean;
  testID?: string;
}) {
  const { t } = useT();
  const options: { key: CosaCategory | null; label: string }[] = [
    ...(withAll ? [{ key: null, label: t('groups.cosateca.allCategories') }] : []),
    ...categories.map((c) => ({ key: c, label: t(`groups.cosateca.categories.${c}`) })),
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" testID={testID}>
      {options.map((o) => {
        const chosen = o.key === value;
        return (
          <Pressable
            key={o.key ?? 'all'}
            testID={`${testID}-${o.key ?? 'all'}`}
            accessibilityRole="button"
            accessibilityState={{ selected: chosen }}
            onPress={() => onChange(o.key)}
            className={`px-3 py-1.5 rounded-full border ${chosen ? 'bg-accent border-accent' : 'bg-surface border-subtle'}`}
          >
            <Text variant="bodySm" tone={chosen ? 'onAccent' : 'primary'} className={chosen ? 'font-bold' : ''}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

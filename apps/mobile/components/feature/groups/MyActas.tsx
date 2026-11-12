import { useMemo, useState, type ReactNode } from 'react';
import { Text as RNText, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { watchSocioVisibleActas, type Acta } from '@cultuvilla/shared/services/recordsService';
import { formatDayKey } from '@cultuvilla/shared/utils';
import { HStack, Input, Pressable, Text, VStack } from '../../primitives';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { ActaDetailSheet } from './ActaDetailSheet';
import { agreementTimeline, type AgreementItem } from './agreementTimeline';

const ICON = colors.light.fg.muted;

function AgreementRow({ item, last, onOpen }: { item: AgreementItem; last: boolean; onOpen: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onOpen} testID={`agreement-${item.key}`}>
      <HStack gap={3} align="stretch">
        <View className="items-center" style={{ width: 12 }}>
          <View className={`mt-1 h-2.5 w-2.5 rounded-full ${item.isAsamblea ? 'bg-accent' : 'bg-secondary-subtle'}`} />
          {last ? null : <View className="flex-1 w-0.5 bg-subtle mt-1" />}
        </View>
        <VStack gap={0} className="flex-1 pb-4">
          <Text className="font-bold">{item.text}</Text>
          <Text variant="bodySm" tone="muted">
            {[item.source, formatDayKey(item.heldOn, 'dayMonthShort')].filter(Boolean).join(' · ')}
          </Text>
        </VStack>
      </HStack>
    </Pressable>
  );
}

/** A socio's view of what the junta's shared actas decided: their agreements by year, searchable, each opening its acta. */
export function MyActas({ orgId, orgName, empty }: { orgId: string; orgName: string; empty?: ReactNode }) {
  const { t } = useT();
  const actas = useWatch<Acta[]>('groups:watchSocioVisibleActas', orgId, (next, error) => watchSocioVisibleActas(orgId, next, error));
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const all = actas.data ?? [];
  const years = useMemo(() => agreementTimeline(actas.data ?? [], query), [actas.data, query]);

  if (all.length === 0) return actas.status === 'ready' && empty ? <>{empty}</> : null;

  return (
    <VStack gap={3} testID="my-actas">
      <Input
        value={query}
        onChangeText={setQuery}
        placeholder={t('groups.myActas.search')}
        accessibilityLabel={t('groups.myActas.search')}
        testID="my-actas-search"
        autoCorrect={false}
        dense
        rightAdornment={
          query ? (
            <Pressable onPress={() => setQuery('')} accessibilityLabel={t('groups.myActas.clear')} testID="my-actas-search-clear" hitSlop={8}>
              <Ionicons name="close-circle" size={iconSizes.md} color={ICON} />
            </Pressable>
          ) : (
            <Ionicons name="search" size={iconSizes.md} color={ICON} />
          )
        }
      />
      {years.length === 0 ? (
        <Text tone="muted" testID="my-actas-no-results">
          {t('groups.myActas.noResults')}
        </Text>
      ) : (
        years.map(({ year, items }) => (
          <VStack key={year} gap={2} testID={`my-actas-year-${year}`}>
            <RNText className="text-caption font-bold text-accent tracking-widest">{year}</RNText>
            <VStack gap={0}>
              {items.map((item, i) => (
                <AgreementRow key={item.key} item={item} last={i === items.length - 1} onOpen={() => setOpenId(item.actaId)} />
              ))}
            </VStack>
          </VStack>
        ))
      )}
      <ActaDetailSheet acta={all.find((a) => a.id === openId) ?? null} orgName={orgName} onClose={() => setOpenId(null)} />
    </VStack>
  );
}

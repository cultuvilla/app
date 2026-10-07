import { newWordHref, wordHref } from '../../lib/navigation/routes';
import {
  presentVocabularyKinds,
  termSlugFromId,
  vocabularyCreditsByTerm,
  type VocabularyCredit,
  type VocabularyTermKind,
} from '@cultuvilla/shared/models';
import { useVillageRoute, withVillageRoute } from '../../lib/navigation/VillageRouteGate';
import { useMemo, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../../components/primitives/Screen';
import { Text } from '../../components/primitives/Text';
import { HStack } from '../../components/primitives/HStack';
import { VStack } from '../../components/primitives/VStack';
import { Input } from '../../components/primitives/Input';
import { Pressable } from '../../components/primitives/Pressable';
import { Fab } from '../../components/primitives/Fab';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { SegmentedToggle } from '../../components/feature/SegmentedToggle';
import { ContributorAvatars } from '../../components/feature/ContributorAvatars';
import { useT } from '../../lib/i18n';
import { useEntityCapabilities } from '../../lib/auth/useEntityCapabilities';
import { useWatch } from '../../lib/hooks/useWatch';
import {
  watchVillageVocabularyDefinitions,
  watchVocabularyTerms,
  type VocabularyDefinitionWithId,
  type VocabularyTermWithId,
} from '@cultuvilla/shared/services/vocabularyService';
import { slugifyTerm } from '@cultuvilla/shared/models/vocabulary';

/**
 * The pueblo's shared vocabulary, A–Z, one tab per kind it has recorded.
 *
 * The whole glossary is fetched once and the search box filters it in memory:
 * a village glossary is tens to a few hundred headwords, so a server-side
 * prefix query would cost an index and a round trip per keystroke to search a
 * list that already fits in one. Matching runs on the accent-folded form, so
 * "napa" finds "ñapa" and "esbardo" finds "Esbardo". A search spans every
 * kind, so a saying is found from the Palabras tab too — someone looking a
 * phrase up rarely knows which kind it was filed under.
 */
const SEARCH_FADE_DISTANCE = 48;

function VocabularyScreen() {
  const {
    municipalityId: villageId,
    slug: villageSlug,
    name: villageName,
  } = useVillageRoute();
  const { t } = useT();
  const { isMember } = useEntityCapabilities(villageId);
  const [search, setSearch] = useState('');
  const [selectedKind, setSelectedKind] = useState<VocabularyTermKind | null>(null);

  const termsWatch = useWatch<VocabularyTermWithId[]>(
    'vocabulary:watchVocabularyTerms',
    villageId,
    villageId ? (next, error) => watchVocabularyTerms(villageId, next, error) : null,
  );
  // Credits are a nicety on each row: until the meanings answer (or if they
  // fail), a row falls back to the contributors denormalized on its term.
  const definitionsWatch = useWatch<VocabularyDefinitionWithId[]>(
    'vocabulary:watchVillageVocabularyDefinitions',
    villageId,
    villageId ? (next, error) => watchVillageVocabularyDefinitions(villageId, next, error) : null,
  );
  const terms = useMemo(() => termsWatch.data ?? [], [termsWatch.data]);
  const loading = termsWatch.status === 'loading';
  const credits = useMemo<Map<string, VocabularyCredit>>(
    () =>
      definitionsWatch.data ? vocabularyCreditsByTerm(terms, definitionsWatch.data) : new Map(),
    [terms, definitionsWatch.data],
  );

  const kinds = useMemo(() => presentVocabularyKinds(terms), [terms]);
  const activeKind = selectedKind && kinds.includes(selectedKind) ? selectedKind : kinds[0];

  const visible = useMemo(() => {
    const needle = slugifyTerm(search);
    if (!needle) return terms.filter((term) => term.kind === activeKind);
    return terms.filter(
      (term) => term.normalized.includes(needle) || slugifyTerm(term.term).includes(needle),
    );
  }, [terms, search, activeKind]);

  // The search field is the list's first row, so it scrolls away with the
  // words; it also fades over its own height so it doesn't slide under the
  // tabs with a hard edge. Styled via `style` only — NativeWind drops
  // `className` on Animated views on web.
  const scrollY = useRef(new Animated.Value(0)).current;
  const searchOpacity = scrollY.interpolate({
    inputRange: [0, SEARCH_FADE_DISTANCE],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <Screen padded={false} bottomInset={false}>
      <ScreenHeader title={t('village.vocabulary.title', { village: villageName })} />
      {kinds.length > 1 && activeKind ? (
        <View className="px-4 pt-2 pb-1">
          <SegmentedToggle<VocabularyTermKind>
            options={kinds.map((kind) => ({
              value: kind,
              label: t(`village.vocabulary.kindPlural.${kind}`),
            }))}
            value={activeKind}
            onChange={setSelectedKind}
          />
        </View>
      ) : null}
      <Animated.FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 96 }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: false,
        })}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <Animated.View style={{ opacity: searchOpacity, paddingTop: 8, paddingBottom: 4 }}>
            <Input
              value={search}
              onChangeText={setSearch}
              placeholder={t('village.vocabulary.search')}
              autoCapitalize="none"
              autoCorrect={false}
              dense
              testID="vocabulary-search"
            />
          </Animated.View>
        }
        ListEmptyComponent={
          loading ? null : (
            <VStack gap={2} className="pt-8 items-center">
              <Text tone="muted" className="text-center">
                {search ? t('village.vocabulary.noMatches') : t('village.vocabulary.empty')}
              </Text>
            </VStack>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            className="py-3 border-b border-subtle"
            onPress={() => router.push(wordHref(villageSlug, termSlugFromId(item.id)))}
            testID={`vocabulary-term-${item.id}`}
          >
            <HStack gap={3} className="items-center">
              <Text className="font-bold flex-1">{item.term}</Text>
              <ContributorAvatars
                userIds={credits.get(item.id)?.userIds ?? item.contributorUserIds}
                orgIds={credits.get(item.id)?.orgIds ?? item.contributorOrgIds}
              />
            </HStack>
          </Pressable>
        )}
      />
      {isMember ? (
        <Fab
          label={t('village.vocabulary.add')}
          onPress={() => router.push(newWordHref(villageSlug))}
          testID="vocabulary-add-fab"
        />
      ) : null}
    </Screen>
  );
}

export default withVillageRoute(VocabularyScreen);

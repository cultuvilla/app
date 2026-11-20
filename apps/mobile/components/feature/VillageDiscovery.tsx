import { routes, villageHref } from '../../lib/navigation/routes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, ActivityIndicator, View, TextInput } from 'react-native';
import { router, type Href } from 'expo-router';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, Text, Escudo, Pressable } from '../primitives';
import { JoinVillageModal } from './JoinVillageModal';
import { useT } from '../../lib/i18n';
import { usePush } from '../../lib/push/PushProvider';
import {
  getActiveCommunities,
  listMunicipalitiesPage,
} from '@cultuvilla/shared/services/municipalityService';
import {
  escudoThumbDisplayUrl,
  matchedLocality,
  municipalitySearchKey,
} from '@cultuvilla/shared/models/municipality';
import type { MunicipalityData } from '@cultuvilla/shared/models/municipality';
import { useAuth } from '../../lib/auth/useAuth';
import {
  getUserMemberships,
  joinVillage,
} from '@cultuvilla/shared/services/villageMemberService';
import { observability, OBSERVABILITY_EVENTS } from '@cultuvilla/shared';

type Muni = MunicipalityData & { id: string };
const PAGE_SIZE = 20;
const ACCENT = '#bb5d3a';

// One FlatList renders two labelled sections: a fixed "Municipios activos" group
// (client-filtered) followed by the cursor-paginated "Todos" group. The groups
// intentionally overlap — "activos" is a shortcut, "Todos" is exhaustive.
type Row =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'muni'; key: string; muni: Muni };

export function VillageDiscovery() {
  const { t } = useT();
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<Muni[] | null>(null);
  const [all, setAll] = useState<Muni[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // `all` starts empty, so without this the "no results" hint renders for the
  // ~200ms between mount and the first page landing — every user would see
  // "no encontramos tu pueblo" before the list they asked for appeared.
  const [pageLoaded, setPageLoaded] = useState(false);
  // Bumped on every new search so a slow in-flight page can't clobber a newer one.
  const reqId = useRef(0);

  const { user, refreshProfile } = useAuth();
  const { offerPush } = usePush();
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [pendingJoin, setPendingJoin] = useState<Muni | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!user) {
      setJoinedIds(new Set());
      return;
    }
    let cancelled = false;
    void getUserMemberships(user.uid)
      .then((ms) => {
        if (!cancelled) setJoinedIds(new Set(ms.map((m) => m.municipalityId)));
      })
      .catch((e) =>
        console.log('[VillageDiscovery] getUserMemberships ERR', e?.code, e?.message),
      );
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    void getActiveCommunities()
      .then(setActive)
      .catch((e) =>
        console.log('[VillageDiscovery] getActiveCommunities ERR', e?.code, e?.message),
      );
  }, []);

  // (Re)seed the "Todos" list whenever the search term changes (debounced).
  useEffect(() => {
    const myReq = ++reqId.current;
    const handle = setTimeout(() => {
      void (async () => {
        const page = await listMunicipalitiesPage({ search, limit: PAGE_SIZE });
        if (reqId.current !== myReq) return; // a newer search superseded this one
        setAll(page.items);
        setCursor(page.nextCursor);
        setExhausted(page.nextCursor === null);
        setPageLoaded(true);
        if (search.trim().length >= 2) {
          observability.trackEvent(OBSERVABILITY_EVENTS.SEARCH_QUERY_SUBMITTED, {
            surface: 'village_discovery',
            resultCount: page.items.length,
          });
        }
      })();
    }, 200);
    return () => clearTimeout(handle);
  }, [search]);

  const loadMore = useCallback(async () => {
    if (loadingMore || exhausted || !cursor) return;
    setLoadingMore(true);
    const myReq = reqId.current;
    try {
      const page = await listMunicipalitiesPage({ search, cursor, limit: PAGE_SIZE });
      if (reqId.current !== myReq) return;
      setAll((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
      setExhausted(page.nextCursor === null);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, exhausted, cursor, search]);

  // The two groups have to agree on what "matches". They used to disagree: this
  // filter was a case-sensitive-accent `includes`, while "Todos" ran an
  // accent-stripped prefix query in Firestore — so a village could appear in one
  // group and not the other for the same search. Testing the doc's own
  // `searchPrefixes` array is exactly the predicate Firestore evaluates for the
  // "Todos" query, so the two cannot drift apart again.
  const activeFiltered = useMemo(() => {
    if (!active) return [];
    const key = municipalitySearchKey(search.trim());
    if (key.length === 0) return active;
    return active.filter((m) => m.searchPrefixes.includes(key));
  }, [active, search]);


  const noResults = pageLoaded && activeFiltered.length === 0 && all.length === 0;

  const searchKey = municipalitySearchKey(search.trim());
  const localityFor = (m: Muni): string | null =>
    searchKey.length === 0 ? null : matchedLocality(m.localityNames, searchKey);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    if (activeFiltered.length > 0) {
      out.push({ kind: 'header', key: 'h-active', label: t('discover.activeGroup') });
      activeFiltered.forEach((m) => out.push({ kind: 'muni', key: `active-${m.id}`, muni: m }));
    }
    if (all.length > 0) {
      out.push({ kind: 'header', key: 'h-all', label: t('discover.allGroup') });
      all.forEach((m) => out.push({ kind: 'muni', key: `all-${m.id}`, muni: m }));
    }
    return out;
  }, [activeFiltered, all, t]);

  if (active === null) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  const viewMuni = (m: Muni) => {
    if (search.trim().length >= 2) {
      observability.trackEvent(OBSERVABILITY_EVENTS.SEARCH_RESULT_SELECTED, { surface: 'village_discovery' });
    }
    // Dormant municipalities open the same village home, which offers to join.
    router.push(villageHref(m.slug));
  };

  const onPressJoin = (m: Muni) => {
    if (!user) {
      router.push(routes.login);
      return;
    }
    setPendingJoin(m);
  };

  const confirmJoin = async (barrioId: string | null) => {
    if (!user || !pendingJoin) return;
    const id = pendingJoin.id;
    setJoining(true);
    let succeeded = false;
    try {
      await joinVillage(id, user.uid, barrioId);
      succeeded = true;
      observability.trackEvent(OBSERVABILITY_EVENTS.VILLAGE_JOIN_SUCCESS, { villageId: id });
      setJoinedIds((prev) => new Set(prev).add(id));
      setPendingJoin(null);
      offerPush('village_join', { villageName: pendingJoin.name });
      // joinVillage set this village as active; refresh the auth profile so the
      // Pueblo tab reflects it now, not only after an app restart.
      await refreshProfile();
      router.push(villageHref(pendingJoin.slug));
    } catch (e) {
      if (!succeeded) observability.trackEvent(OBSERVABILITY_EVENTS.VILLAGE_JOIN_ERROR, { villageId: id });
      throw e;
    } finally {
      setJoining(false);
    }
  };

  return (
    <View className="flex-1">
      <View className="px-4 py-2">
        <TextInput
          placeholder={t('discover.search')}
          accessibilityLabel={t('discover.search')}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          className="border border-subtle rounded-md px-3 py-1 bg-surface text-primary text-body"
        />
        <Text tone="muted" variant="bodySm" className="pt-1">
          {t('discover.searchHint')}
        </Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerClassName="px-4 pt-3 pb-8 gap-3"
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          noResults ? (
            <VStack gap={2} className="py-6">
              <Text tone="muted">{t('discover.empty')}</Text>
              {/* Cultuvilla lists the 8,167 INE municipios and nothing below
                  them, so a resident of a pedanía searches for a name that does
                  not exist as a row. Say that here rather than leaving them to
                  conclude their pueblo is missing. */}
              <Text tone="muted" variant="bodySm">
                {t('discover.emptyHint')}
              </Text>
              <Text tone="muted" variant="bodySm">
                {t('discover.emptyHintExample')}
              </Text>
            </VStack>
          ) : null
        }
        ListFooterComponent={
          loadingMore ? (
            <View className="py-3">
              <ActivityIndicator />
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return (
              <Text variant="h3" className="pt-2" style={{ color: ACCENT }}>
                {item.label}
              </Text>
            );
          }
          const m = item.muni;
          const joined = joinedIds.has(m.id);
          const via = localityFor(m);
          return (
            <Pressable
              onPress={() => viewMuni(m)}
              className={`w-full rounded-md border bg-surface px-4 py-3 ${
                m.communityActive ? 'border-accent' : 'border-subtle'
              }`}
            >
              <HStack gap={3} className="items-center">
                <Escudo url={escudoThumbDisplayUrl(m)} size={40} fallbackInitial={m.name} />
                <VStack gap={1} className="flex-1">
                  <Text>{m.name}</Text>
                  <Text tone="muted" variant="bodySm">
                    {m.province}
                  </Text>
                  {/* A search for "Villarino de Manzanas" that returns a row
                      reading only "Figueruela de Arriba" looks like the wrong
                      answer. Naming the pedanía makes it the right one. */}
                  {via ? (
                    <Text tone="muted" variant="bodySm">
                      {t('discover.viaLocality', { locality: via })}
                    </Text>
                  ) : null}
                </VStack>
                {m.communityActive ? (
                  <HStack gap={1} className="items-center">
                    <Pressable
                      onPress={() => viewMuni(m)}
                      accessibilityLabel={t('discover.viewVillage')}
                      hitSlop={8}
                      className="p-2"
                    >
                      <Ionicons name="eye-outline" size={22} color={ACCENT} />
                    </Pressable>
                    {joined ? (
                      <View accessibilityLabel={t('discover.alreadyMember')} className="p-2">
                        <Ionicons name="checkmark-circle" size={22} color="#16a34a" />
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => onPressJoin(m)}
                        accessibilityLabel={t('discover.joinVillage')}
                        hitSlop={8}
                        className="p-2"
                      >
                        <Ionicons name="person-add-outline" size={22} color={ACCENT} />
                      </Pressable>
                    )}
                  </HStack>
                ) : null}
              </HStack>
            </Pressable>
          );
        }}
      />
      <JoinVillageModal
        municipality={
          pendingJoin
            ? { id: pendingJoin.id, name: pendingJoin.name, escudoUrl: escudoThumbDisplayUrl(pendingJoin) }
            : null
        }
        busy={joining}
        onCancel={() => setPendingJoin(null)}
        onConfirm={(barrioId) => void confirmJoin(barrioId)}
      />
    </View>
  );
}

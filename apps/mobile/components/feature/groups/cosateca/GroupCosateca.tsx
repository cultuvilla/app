import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { iconSizes, palette, spacing } from '@cultuvilla/shared/design-system';
import { cosatecaCatalogue, usedCosaCategories, type CosaCategory } from '@cultuvilla/shared/models/organization';
import {
  watchCosaRequestsToMe,
  watchGroupCosaRequests,
  watchGroupCosas,
  watchMyCosaRequests,
  type Cosa,
  type CosaRequest,
} from '@cultuvilla/shared/services/cosatecaService';
import { Input, Text, VStack } from '../../../primitives';
import { Fab } from '../../../primitives/Fab';
import { CategoryChips } from './CosaRows';
import { CosaSheet } from './CosaSheet';
import { CosaCard, CosaInboxSheet, EnMarchaStrip } from './Escaparate';
import { cosatecaInbox, enMarcha, searchCosas } from './escaparate';
import { useAuth } from '../../../../lib/auth/useAuth';
import { useWatch } from '../../../../lib/hooks/useWatch';
import { useT } from '../../../../lib/i18n';
import { groupCosaHref, groupCosaRequestHref } from '../../../../lib/navigation/routes';
import type { MyGroup } from '../../../../lib/orgs/useMyGroups';

/**
 * Requests to answer in this group: those for the viewer's own cosas, and, for
 * an admin, those for the group's own cosas too. Newest first, each once.
 */
export function requestsToMe(
  orgId: string,
  toMe: readonly CosaRequest[],
  ofGroup: readonly CosaRequest[] | null,
): CosaRequest[] {
  const rows = new Map<string, CosaRequest>();
  for (const r of toMe) if (r.orgId === orgId) rows.set(r.id, r);
  for (const r of ofGroup ?? []) if (r.ownerUid === null) rows.set(r.id, r);
  return [...rows.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * A group's cosateca as a shop window: a search box, "En marcha" (what others
 * ask of the viewer and what they hold) when there is something, and the
 * catalogue as a grid of photos. Every request sits behind "Todo". Any
 * integrante offers something from the button.
 */
export function GroupCosateca({ group, uid }: { group: MyGroup; uid: string }) {
  const { t } = useT();
  const { profile } = useAuth();
  const { org, role } = group;
  const isAdmin = role === 'admin';
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CosaCategory | null>(null);
  const [offering, setOffering] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);

  const cosas = useWatch<Cosa[]>('cosateca:watchGroupCosas', org.id, (next, error) => watchGroupCosas(org.id, next, error));
  const mine = useWatch<CosaRequest[]>('cosateca:watchMyCosaRequests', uid, (next, error) => watchMyCosaRequests(uid, next, error));
  const toMe = useWatch<CosaRequest[]>('cosateca:watchCosaRequestsToMe', uid, (next, error) => watchCosaRequestsToMe(uid, next, error));
  const ofGroup = useWatch<CosaRequest[]>(
    'cosateca:watchGroupCosaRequests',
    isAdmin ? org.id : null,
    isAdmin ? (next, error) => watchGroupCosaRequests(org.id, next, error) : null,
  );

  const all = cosas.data ?? [];
  const categories = useMemo(() => usedCosaCategories(all), [all]);
  const catalogue = useMemo(() => searchCosas(cosatecaCatalogue(all, category), query), [all, category, query]);
  const asked = useMemo(() => (mine.data ?? []).filter((r) => r.orgId === org.id), [mine.data, org.id]);
  const incoming = useMemo(
    () => requestsToMe(org.id, toMe.data ?? [], isAdmin ? (ofGroup.data ?? []) : null),
    [org.id, toMe.data, ofGroup.data, isAdmin],
  );
  const active = useMemo(() => enMarcha(incoming, asked), [incoming, asked]);
  const inbox = useMemo(() => cosatecaInbox(incoming, asked), [incoming, asked]);

  const openRequest = (requestId: string) => {
    setInboxOpen(false);
    router.push(groupCosaRequestHref(org.id, requestId));
  };

  const emptyText = all.length === 0 ? 'groups.cosateca.empty' : query.trim() ? 'groups.cosateca.noMatches' : 'groups.cosateca.emptyCategory';

  return (
    <View className="flex-1" testID="group-cosateca">
      <FlatList
        testID="cosateca-catalogue"
        data={catalogue}
        keyExtractor={(c) => c.id}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing[2] }}
        contentContainerClassName="px-4 pt-3 pb-24 gap-2"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <VStack gap={3} className="pb-1">
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder={t('groups.cosateca.search')}
              pill
              dense
              autoCorrect={false}
              returnKeyType="search"
              rightAdornment={<Ionicons name="search" size={iconSizes.md} color={palette.sage} />}
              testID="cosateca-search"
            />
            <EnMarchaStrip items={active} total={inbox.length} onOpen={openRequest} onAll={() => setInboxOpen(true)} />
            {categories.length > 1 ? <CategoryChips categories={categories} value={category} onChange={setCategory} /> : null}
          </VStack>
        }
        ListEmptyComponent={
          cosas.status === 'loading' ? null : (
            <Text tone="muted" className="py-6 text-center" testID="cosateca-empty">
              {t(emptyText)}
            </Text>
          )
        }
        renderItem={({ item, index }) => (
          <>
            <CosaCard cosa={item} onPress={() => router.push(groupCosaHref(org.id, item.id))} />
            {/* An odd last card keeps half the row, not all of it. */}
            {index === catalogue.length - 1 && catalogue.length % 2 === 1 ? <View className="flex-1" /> : null}
          </>
        )}
      />
      <Fab testID="cosateca-offer" label={t('groups.cosateca.offer')} onPress={() => setOffering(true)} />
      <CosaInboxSheet visible={inboxOpen} requests={inbox} uid={uid} onOpen={openRequest} onClose={() => setInboxOpen(false)} />
      <CosaSheet
        visible={offering}
        org={org}
        uid={uid}
        myName={profile?.displayName ?? ''}
        isAdmin={isAdmin}
        cosa={null}
        onClose={() => setOffering(false)}
      />
    </View>
  );
}

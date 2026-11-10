import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { cosatecaCatalogue, usedCosaCategories, type CosaCategory } from '@cultuvilla/shared/models/organization';
import {
  watchCosaRequestsToMe,
  watchGroupCosaRequests,
  watchGroupCosas,
  watchMyCosaRequests,
  type Cosa,
  type CosaRequest,
} from '@cultuvilla/shared/services/cosatecaService';
import { Text } from '../../../primitives';
import { Fab } from '../../../primitives/Fab';
import { SegmentedToggle } from '../../SegmentedToggle';
import { CategoryChips, CosaRequestRow, CosaRow } from './CosaRows';
import { CosaSheet } from './CosaSheet';
import { useAuth } from '../../../../lib/auth/useAuth';
import { useWatch } from '../../../../lib/hooks/useWatch';
import { useT } from '../../../../lib/i18n';
import { groupCosaHref, groupCosaRequestHref } from '../../../../lib/navigation/routes';
import type { MyGroup } from '../../../../lib/orgs/useMyGroups';

type Tab = 'catalogo' | 'pedi' | 'mepiden';

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
 * A group's cosateca, for its integrantes: the catalogue by category, what the
 * viewer asked for here, and what others ask of them (and, for an admin, of the
 * group). Any integrante offers something from the button.
 */
export function GroupCosateca({ group, uid }: { group: MyGroup; uid: string }) {
  const { t } = useT();
  const { profile } = useAuth();
  const { org, role } = group;
  const isAdmin = role === 'admin';
  const [tab, setTab] = useState<Tab>('catalogo');
  const [category, setCategory] = useState<CosaCategory | null>(null);
  const [offering, setOffering] = useState(false);

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
  const catalogue = useMemo(() => cosatecaCatalogue(all, category), [all, category]);
  const asked = useMemo(() => (mine.data ?? []).filter((r) => r.orgId === org.id), [mine.data, org.id]);
  const incoming = useMemo(
    () => requestsToMe(org.id, toMe.data ?? [], isAdmin ? (ofGroup.data ?? []) : null),
    [org.id, toMe.data, ofGroup.data, isAdmin],
  );

  const empty = (text: string) => (
    <Text tone="muted" className="py-6 text-center">
      {text}
    </Text>
  );

  return (
    <View className="flex-1" testID="group-cosateca">
      <View className="px-4 pt-3 gap-3">
        <SegmentedToggle
          testID="cosateca-tab"
          value={tab}
          options={[
            { value: 'catalogo', label: t('groups.cosateca.tabs.catalogo') },
            { value: 'pedi', label: t('groups.cosateca.tabs.pedi') },
            { value: 'mepiden', label: t('groups.cosateca.tabs.mepiden') },
          ]}
          onChange={setTab}
        />
        {tab === 'catalogo' && categories.length > 1 ? (
          <CategoryChips categories={categories} value={category} onChange={setCategory} />
        ) : null}
      </View>
      {tab === 'catalogo' ? (
        <FlatList
          testID="cosateca-catalogue"
          data={catalogue}
          keyExtractor={(c) => c.id}
          contentContainerClassName="px-4 pt-3 pb-24 gap-2"
          ListEmptyComponent={
            cosas.status === 'loading' ? null : empty(t(all.length === 0 ? 'groups.cosateca.empty' : 'groups.cosateca.emptyCategory'))
          }
          renderItem={({ item }) => <CosaRow cosa={item} onPress={() => router.push(groupCosaHref(org.id, item.id))} />}
        />
      ) : (
        <FlatList
          testID={`cosateca-requests-${tab}`}
          data={tab === 'pedi' ? asked : incoming}
          keyExtractor={(r) => r.id}
          contentContainerClassName="px-4 pt-3 pb-24 gap-2"
          ListEmptyComponent={
            (tab === 'pedi' ? mine.status : toMe.status) === 'loading'
              ? null
              : empty(t(tab === 'pedi' ? 'groups.cosateca.noRequestsMine' : 'groups.cosateca.noRequestsToMe'))
          }
          renderItem={({ item }) => (
            <CosaRequestRow
              request={item}
              showRequester={tab === 'mepiden'}
              onPress={() => router.push(groupCosaRequestHref(org.id, item.id))}
            />
          )}
        />
      )}
      <Fab testID="cosateca-offer" label={t('groups.cosateca.offer')} onPress={() => setOffering(true)} />
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

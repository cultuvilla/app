import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { hasSocioRoster, type OrgMemberData } from '@cultuvilla/shared/models/organization';
import { watchOrgMembers } from '@cultuvilla/shared/services/orgMemberService';
import { Pressable, Screen, Text, VStack } from '../../components/primitives';
import { AppHeader } from '../../components/layout/AppHeader';
import { GroupSwitcher } from '../../components/feature/groups/GroupSwitcher';
import { SocioConsentCard } from '../../components/feature/groups/SocioConsentCard';
import { MyPersonasSocios } from '../../components/feature/groups/MyPersonasSocios';
import { SociosRoster } from '../../components/feature/groups/SociosRoster';
import { GroupSettings } from '../../components/feature/groups/GroupSettings';
import { OrgEventsSection } from '../../components/feature/OrgEventsSection';
import { OrgJoinRequests } from '../../components/feature/OrgJoinRequests';
import { OrgMembersList } from '../../components/feature/OrgMembersList';
import { useAuth } from '../../lib/auth/useAuth';
import { useWatch } from '../../lib/hooks/useWatch';
import { useT } from '../../lib/i18n';
import { orgHref } from '../../lib/navigation/routes';
import { useMyGroups, type MyGroup } from '../../lib/orgs/useMyGroups';
import { pickGroupId, readLastGroupId, rememberLastGroupId } from '../../lib/orgs/lastGroup';

/**
 * Mis grupos: the private side of the groups the user belongs to — what's on,
 * their socio data, and for admins the "Gestionar" section. The public org page
 * stays the org's face; nothing here is public.
 */
export default function GroupsTabScreen() {
  const { t } = useT();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { groups, status } = useMyGroups(uid);
  const [remembered, setRemembered] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    void readLastGroupId().then(setRemembered);
  }, []);

  const groupIds = useMemo(() => groups.map((g) => g.org.id), [groups]);
  const selectedId = remembered === undefined ? null : pickGroupId(groupIds, remembered);
  const selected = groups.find((g) => g.org.id === selectedId) ?? null;

  const select = (orgId: string) => {
    setRemembered(orgId);
    void rememberLastGroupId(orgId);
  };

  return (
    <Screen padded={false} topInset={false} bottomInset={false}>
      <AppHeader centerLabel={t('groups.title')} />
      <GroupSwitcher groups={groups} selectedId={selectedId} onSelect={select} />
      {!uid ? null : status === 'loading' || remembered === undefined ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : selected ? (
        <GroupHome key={selected.org.id} group={selected} uid={uid} />
      ) : null}
    </Screen>
  );
}

function GroupHome({ group, uid }: { group: MyGroup; uid: string }) {
  const { t } = useT();
  const { org, role } = group;
  const isAdmin = role === 'admin';
  const roster = hasSocioRoster(org.type);
  const members = useWatch<(OrgMemberData & { id: string })[]>(
    'groups:watchOrgMembers',
    isAdmin && roster ? org.id : null,
    isAdmin && roster ? (next, error) => watchOrgMembers(org.id, next, error) : null,
  );
  const adminUids = useMemo(
    () => (members.data ?? []).filter((m) => m.role === 'admin').map((m) => m.userId),
    [members.data],
  );

  return (
    <ScrollView contentContainerClassName="px-4 pt-2 pb-16" testID="group-home">
      <VStack gap={4}>
        <VStack gap={1}>
          <Text variant="h2">{org.name}</Text>
          <Pressable testID="group-open-page" accessibilityRole="link" onPress={() => router.push(orgHref(org))}>
            <Text variant="bodySm" className="text-accent">
              {t('groups.openGroupPage')}
            </Text>
          </Pressable>
        </VStack>

        {roster ? <SocioConsentCard orgId={org.id} /> : null}

        {/* Rules let only an approval org's members read its private events. */}
        <OrgEventsSection orgId={org.id} includePrivate={org.joinPolicy === 'approval'} />

        {roster ? <MyPersonasSocios orgId={org.id} uid={uid} /> : null}

        {roster && !isAdmin && org.sociosListVisible ? (
          <SociosRoster orgId={org.id} canManage={false} adminUids={[]} currentUid={uid} />
        ) : null}

        {isAdmin ? (
          <VStack gap={4} testID="group-manage">
            <Text variant="h3" className="mt-4">
              {t('groups.manage')}
            </Text>
            {roster ? <SociosRoster orgId={org.id} canManage adminUids={adminUids} currentUid={uid} /> : null}
            {org.joinPolicy === 'approval' ? <OrgJoinRequests orgId={org.id} /> : null}
            <OrgMembersList orgId={org.id} canManage currentUserId={uid} />
            {roster ? <GroupSettings orgId={org.id} sociosListVisible={org.sociosListVisible} /> : null}
          </VStack>
        ) : null}
      </VStack>
    </ScrollView>
  );
}

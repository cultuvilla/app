import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { hasSocioRoster } from '@cultuvilla/shared/models/organization';
import type { GroupSection } from '@cultuvilla/shared/utils';
import { Pressable, Screen, Text, VStack } from '../../components/primitives';
import { AppHeader } from '../../components/layout/AppHeader';
import { GroupSwitcherSheet } from '../../components/feature/groups/GroupSwitcher';
import { GroupSectionGrid } from '../../components/feature/groups/GroupSectionGrid';
import { GroupSummary } from '../../components/feature/groups/GroupSummary';
import { SocioConsentCard } from '../../components/feature/groups/SocioConsentCard';
import { useAuth } from '../../lib/auth/useAuth';
import { useT } from '../../lib/i18n';
import { groupSectionHref, orgHref } from '../../lib/navigation/routes';
import { groupSections } from '../../lib/orgs/groupSections';
import { useGroupNotices } from '../../lib/orgs/useGroupNotices';
import { useMyGroups, type MyGroup } from '../../lib/orgs/useMyGroups';
import { useMyOpenTasks } from '../../lib/orgs/useMyOpenTasks';
import { pickGroupId, readLastGroupId, rememberLastGroupId } from '../../lib/orgs/lastGroup';

/**
 * Mis grupos: the private side of the groups the user belongs to. The home is
 * a summary and a grid of buttons; each feature opens its own screen
 * (`/grupos/<orgId>/<section>`), and the group's name in the header switches
 * group. The public org page stays the org's face; nothing here is public.
 */
export default function GroupsTabScreen() {
  const { t } = useT();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { groups, status } = useMyGroups(uid);
  const [remembered, setRemembered] = useState<string | null | undefined>(undefined);
  const [switching, setSwitching] = useState(false);
  // `/grupos?grupo=<orgId>` opens the tab on that group (a WhatsApp link, a switch from a group screen).
  const { grupo } = useLocalSearchParams<{ grupo?: string }>();

  useEffect(() => {
    if (grupo) {
      setRemembered(grupo);
      void rememberLastGroupId(grupo);
      return;
    }
    void readLastGroupId().then(setRemembered);
  }, [grupo]);

  const groupIds = useMemo(() => groups.map((g) => g.org.id), [groups]);
  const selectedId = remembered === undefined ? null : pickGroupId(groupIds, remembered);
  const selected = groups.find((g) => g.org.id === selectedId) ?? null;

  const select = (orgId: string) => {
    setSwitching(false);
    setRemembered(orgId);
    void rememberLastGroupId(orgId);
  };

  return (
    <Screen padded={false} topInset={false} bottomInset={false}>
      <AppHeader
        centerLabel={selected?.org.name ?? t('groups.title')}
        onLabelPress={groups.length > 1 ? () => setSwitching(true) : undefined}
        labelAccessibilityLabel={t('groups.switcherLabel')}
        labelTestID="group-switcher-open"
        extraRightSlot={
          selected ? (
            <Pressable
              testID="group-open-page"
              accessibilityRole="link"
              accessibilityLabel={t('groups.openGroupPage')}
              onPress={() => router.push(orgHref(selected.org))}
              className="p-1"
            >
              <Ionicons name="open-outline" size={26} color="#f9f0e8" />
            </Pressable>
          ) : null
        }
      />
      {!uid ? null : status === 'loading' || remembered === undefined ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : selected ? (
        <GroupHome key={selected.org.id} group={selected} uid={uid} />
      ) : (
        // A failed read, or the user just left their last group (the tab hides next).
        <View className="flex-1 items-center justify-center px-4" testID="groups-empty">
          <Text tone="muted">{t(status === 'error' ? 'groups.loadError' : 'groups.empty')}</Text>
        </View>
      )}
      <GroupSwitcherSheet
        visible={switching}
        groups={groups}
        selectedId={selectedId}
        onSelect={select}
        onClose={() => setSwitching(false)}
      />
    </Screen>
  );
}

function GroupHome({ group, uid }: { group: MyGroup; uid: string }) {
  const { t } = useT();
  const { org, role } = group;
  const roster = hasSocioRoster(org.type);
  const { member, admin } = groupSections(group);
  const notices = useGroupNotices(org.id, roster ? uid : null);
  const tasks = useMyOpenTasks(org.id, uid);
  const badges: Partial<Record<GroupSection, number>> = {
    avisos: notices.unreadCount,
    tareas: tasks.mine.length,
  };
  const open = (section: GroupSection) => router.push(groupSectionHref(org.id, section));

  return (
    <ScrollView contentContainerClassName="px-4 pt-3 pb-16" testID="group-home">
      <VStack gap={4}>
        {roster ? <SocioConsentCard orgId={org.id} onlyWhenUnanswered /> : null}

        <GroupSummary orgId={org.id} uid={uid} roster={roster} includePrivate={org.joinPolicy === 'approval'} onOpen={open} />

        <GroupSectionGrid sections={member} badges={badges} onOpen={open} />

        {role === 'admin' ? (
          <VStack gap={2} testID="group-manage">
            <Text variant="caption" tone="muted" className="font-bold uppercase pt-2">
              {t('groups.manage')}
            </Text>
            <GroupSectionGrid sections={admin} onOpen={open} admin />
          </VStack>
        ) : null}
      </VStack>
    </ScrollView>
  );
}

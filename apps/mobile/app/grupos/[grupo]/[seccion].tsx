import { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { isGroupSection } from '@cultuvilla/shared/utils';
import { HStack, Pressable, Screen, Text } from '../../../components/primitives';
import { ScreenHeader } from '../../../components/layout/ScreenHeader';
import { GENERAL_CHAT_THREAD_ID } from '@cultuvilla/shared/models/organization';
import { GroupChat } from '../../../components/feature/groups/GroupChat';
import { GroupSectionBody } from '../../../components/feature/groups/GroupSectionBody';
import { GroupSwitcherSheet } from '../../../components/feature/groups/GroupSwitcher';
import { useAuth } from '../../../lib/auth/useAuth';
import { useT } from '../../../lib/i18n';
import { groupHref, routes } from '../../../lib/navigation/routes';
import { canOpenGroupSection } from '../../../lib/orgs/groupSections';
import { rememberLastGroupId } from '../../../lib/orgs/lastGroup';
import { useMyGroups } from '../../../lib/orgs/useMyGroups';

/**
 * One screen of a group's private side, opened from its button on the group
 * home or from a notification. Switching group here stays on the same screen
 * when the other group has it, and goes to that group's home otherwise.
 */
export default function GroupSectionScreen() {
  const { t } = useT();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { grupo, seccion } = useLocalSearchParams<{ grupo: string; seccion: string }>();
  const { groups, status } = useMyGroups(uid);
  const [switching, setSwitching] = useState(false);

  const section = seccion && isGroupSection(seccion) ? seccion : null;
  const group = groups.find((g) => g.org.id === grupo) ?? null;

  if (!section) return <Redirect href={routes.groups} />;
  if (uid && status !== 'loading' && (!group || !canOpenGroupSection(group, section))) {
    return <Redirect href={grupo ? groupHref(grupo) : routes.groups} />;
  }

  const switchTo = (orgId: string) => {
    setSwitching(false);
    void rememberLastGroupId(orgId);
    const target = groups.find((g) => g.org.id === orgId);
    if (target && canOpenGroupSection(target, section)) router.setParams({ grupo: orgId });
    else router.dismissTo(groupHref(orgId));
  };

  return (
    <Screen padded={false} topInset={false} bottomInset={section === 'charla'}>
      <ScreenHeader accent title={t(`groups.sections.${section}`)} />
      {group && groups.length > 1 ? (
        <Pressable
          testID="group-section-switcher"
          accessibilityRole="button"
          accessibilityLabel={t('groups.switcherLabel')}
          onPress={() => setSwitching(true)}
          className="px-4 py-2 border-b border-subtle"
        >
          <HStack gap={1} align="center">
            <Text variant="bodySm" className="font-bold" numberOfLines={1}>
              {group.org.name}
            </Text>
            <Ionicons name="chevron-down" size={iconSizes.sm} color={colors.light.fg.accent} />
          </HStack>
        </Pressable>
      ) : null}
      {!uid || !group ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
) : section === 'charla' ? (
        // A chat scrolls itself and keeps its composer on screen.
        <GroupChat
          key={group.org.id}
          orgId={group.org.id}
          municipalityId={group.org.municipalityId}
          threadId={GENERAL_CHAT_THREAD_ID}
          uid={uid}
          canModerate={group.role === 'admin'}
          closedHint={group.org.chatAdminsOnly && group.role !== 'admin' ? t('groups.chat.adminsOnly') : undefined}
        />
      ) : (
        <ScrollView contentContainerClassName="px-4 pt-3 pb-16" keyboardShouldPersistTaps="handled" testID={`group-section-screen-${section}`}>
          <GroupSectionBody key={group.org.id} group={group} section={section} uid={uid} />
        </ScrollView>
      )}
      <GroupSwitcherSheet
        visible={switching}
        groups={groups}
        selectedId={group?.org.id ?? null}
        onSelect={switchTo}
        onClose={() => setSwitching(false)}
      />
    </Screen>
  );
}

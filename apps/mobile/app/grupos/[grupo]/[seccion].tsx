import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { isGroupSection } from '@cultuvilla/shared/utils';
import { Screen, Text } from '../../../components/primitives';
import { ScreenHeader } from '../../../components/layout/ScreenHeader';
import { GENERAL_CHAT_THREAD_ID } from '@cultuvilla/shared/models/organization';
import { GroupChat } from '../../../components/feature/groups/GroupChat';
import { GroupEvents } from '../../../components/feature/groups/GroupEvents';
import { GroupTaskBoard } from '../../../components/feature/groups/GroupTaskBoard';
import { GroupSectionBody } from '../../../components/feature/groups/GroupSectionBody';
import { GroupContactGate } from '../../../components/feature/groups/GroupContactGate';
import { useAuth } from '../../../lib/auth/useAuth';
import { useT } from '../../../lib/i18n';
import { groupHref, routes } from '../../../lib/navigation/routes';
import { canOpenGroupSection } from '../../../lib/orgs/groupSections';
import { useMyGroups } from '../../../lib/orgs/useMyGroups';

/**
 * One screen of a group's private side, opened from the group home or from a
 * notification. A list with a floating button keeps it above the home indicator.
 */
export default function GroupSectionScreen() {
  const { t } = useT();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { grupo, seccion } = useLocalSearchParams<{ grupo: string; seccion: string }>();
  const { groups, status } = useMyGroups(uid);

  const section = seccion && isGroupSection(seccion) ? seccion : null;
  const group = groups.find((g) => g.org.id === grupo) ?? null;

  if (!section) return <Redirect href={routes.groups} />;
  if (uid && status !== 'loading' && (!group || !canOpenGroupSection(group, section))) {
    return <Redirect href={grupo ? groupHref(grupo) : routes.groups} />;
  }

  return (
    <Screen padded={false} topInset={false} bottomInset={section === 'charla' || section === 'eventos' || section === 'tareas'}>
      <ScreenHeader accent title={t(`groups.sections.${section}`)} />
      <GroupContactGate group={group} uid={uid}>
      {!uid || !group ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
) : section === 'eventos' ? (
        <GroupEvents key={group.org.id} org={group.org} />
      ) : section === 'tareas' ? (
        <GroupTaskBoard key={group.org.id} group={group} uid={uid} />
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
      </GroupContactGate>
    </Screen>
  );
}

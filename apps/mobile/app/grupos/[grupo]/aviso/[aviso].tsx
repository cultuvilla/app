import { ActivityIndicator, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { personalizeGroupMessage, type GroupMessageData } from '@cultuvilla/shared/models/organization';
import { watchGroupAviso } from '@cultuvilla/shared/services/groupChatService';
import { formatDate } from '@cultuvilla/shared/utils';
import { Card, Screen, Text, VStack } from '../../../../components/primitives';
import { ScreenHeader } from '../../../../components/layout/ScreenHeader';
import { GroupChat } from '../../../../components/feature/groups/GroupChat';
import { useAuth } from '../../../../lib/auth/useAuth';
import { useWatch } from '../../../../lib/hooks/useWatch';
import { useT } from '../../../../lib/i18n';
import { routes } from '../../../../lib/navigation/routes';
import { useMyGroups } from '../../../../lib/orgs/useMyGroups';
import { useMyMessageValues } from '../../../../lib/orgs/useMyMessageValues';

/**
 * One aviso and its chat: the aviso is the thread's first message. Opened from
 * the notices, from a chat notification, and from the aviso's WhatsApp and
 * email links. The rules let only its recipients and the admins read it.
 */
export default function GroupAvisoScreen() {
  const { t } = useT();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { grupo, aviso } = useLocalSearchParams<{ grupo: string; aviso: string }>();
  const { groups, status } = useMyGroups(uid);
  const group = groups.find((g) => g.org.id === grupo) ?? null;
  const watch = useWatch<(GroupMessageData & { id: string }) | null>(
    'groups:watchGroupAviso',
    group && aviso ? `${group.org.id}|${aviso}` : null,
    group && aviso ? (next, error) => watchGroupAviso(group.org.id, aviso, next, error) : null,
  );
  const values = useMyMessageValues(group?.org.id ?? '', group ? uid : null);

  if (uid && status !== 'loading' && !group) return <Redirect href={routes.groups} />;

  const message = watch.data ?? null;
  const text = message ? personalizeGroupMessage({ title: message.title, body: message.body }, values) : null;

  return (
    <Screen padded={false} topInset={false} bottomInset={false}>
      <ScreenHeader accent title={t('groups.chat.avisoTitle')} />
      {!uid || !group || watch.status === 'loading' ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : !message || !text ? (
        <Text tone="muted" className="p-6 text-center" testID="group-aviso-unavailable">
          {t('groups.chat.avisoUnavailable')}
        </Text>
      ) : (
        <GroupChat
          orgId={group.org.id}
          municipalityId={group.org.municipalityId}
          threadId={message.id}
          uid={uid}
          canModerate={group.role === 'admin'}
          head={
            <Card testID="group-aviso-head">
              <VStack gap={1}>
                <Text className="font-bold">{text.title}</Text>
                <Text selectable>{text.body}</Text>
                <Text variant="caption" tone="muted">
                  {t('groups.messages.sentBy', { name: message.signerName, date: formatDate(message.sentAt, 'long') })}
                </Text>
              </VStack>
            </Card>
          }
        />
      )}
    </Screen>
  );
}

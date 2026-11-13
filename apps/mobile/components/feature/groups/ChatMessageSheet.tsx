import { ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { GROUP_CHAT_REACTIONS, type GroupChatReaction } from '@cultuvilla/shared/models/organization';
import type { GroupChatMessage } from '@cultuvilla/shared/services/groupChatService';
import { BottomSheet, HStack, Pressable, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';

export type ChatMessageAction = 'reply' | 'copy' | 'report' | 'delete';

/**
 * What a long-press on a message opens: the five reactions, the message itself
 * (selectable, for copying a part of it), and what the viewer may do with it —
 * reply, copy, report or block, delete — the dangerous one last.
 */
export function ChatMessageSheet({
  message,
  myReaction,
  actions,
  onReact,
  onAction,
  onClose,
}: {
  message: GroupChatMessage | null;
  myReaction: string | undefined;
  actions: ChatMessageAction[];
  onReact: (reaction: GroupChatReaction) => void;
  onAction: (action: ChatMessageAction) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const labels: Record<ChatMessageAction, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
    reply: { label: t('groups.chat.reply'), icon: 'arrow-undo-outline' },
    copy: { label: t('groups.chat.copy'), icon: 'copy-outline' },
    report: { label: t('groups.chat.report'), icon: 'flag-outline' },
    delete: { label: t('groups.chat.delete'), icon: 'trash-outline' },
  };
  return (
    <BottomSheet visible={message !== null} onClose={onClose} closeLabel={t('common.close')} testID="group-chat-sheet">
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
        <VStack gap={3} className="px-5 pb-2">
          <HStack gap={2} justify="between" className="bg-surface rounded-full px-3 py-2">
            {GROUP_CHAT_REACTIONS.map((emoji) => (
              <Pressable
                key={emoji}
                testID={`group-chat-react-${emoji}`}
                accessibilityRole="button"
                accessibilityState={{ selected: myReaction === emoji }}
                onPress={() => onReact(emoji)}
                className={`rounded-full px-2 py-1 ${myReaction === emoji ? 'bg-accent-subtle/40' : ''}`}
              >
                <Text variant="h3">{emoji}</Text>
              </Pressable>
            ))}
          </HStack>
          {message ? (
            <Text
              selectable
              variant="bodySm"
              tone="onSubtle"
              className="bg-surface rounded-lg px-3 py-2"
              testID="group-chat-sheet-text"
            >
              {message.body}
            </Text>
          ) : null}
          <VStack gap={0}>
            {actions.map((action) => (
              <Pressable
                key={action}
                testID={`group-chat-options-${action}`}
                accessibilityRole="button"
                onPress={() => onAction(action)}
                className="py-3"
              >
                <HStack gap={3} align="center">
                  <Ionicons
                    name={labels[action].icon}
                    size={iconSizes.md}
                    color={action === 'delete' ? colors.light.fg.danger : colors.light.fg.primary}
                  />
                  <Text tone={action === 'delete' ? 'danger' : 'primary'}>{labels[action].label}</Text>
                </HStack>
              </Pressable>
            ))}
          </VStack>
        </VStack>
      </ScrollView>
    </BottomSheet>
  );
}

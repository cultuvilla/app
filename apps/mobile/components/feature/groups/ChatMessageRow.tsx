import { View } from 'react-native';
import { calendarDayOffset, formatDate } from '@cultuvilla/shared/utils';
import {
  groupChatAuthorColorIndex,
  groupChatReactionCounts,
  type GroupChatReaction,
  type GroupChatRowLayout,
} from '@cultuvilla/shared/models/organization';
import type { GroupChatMessage } from '@cultuvilla/shared/services/groupChatService';
import { HStack, Pressable, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';

/** One colour per person, from the app's own tokens: the initial's circle, and their name over it. */
const AUTHOR_COLORS = [
  { bg: 'bg-accent', fg: 'text-accent' },
  { bg: 'bg-secondary', fg: 'text-secondary' },
  { bg: 'bg-accent-pressed', fg: 'text-accent' },
  { bg: 'bg-secondary-subtle', fg: 'text-on-subtle' },
  { bg: 'bg-accent-subtle', fg: 'text-on-subtle' },
] as const;

export function authorColor(uid: string) {
  return AUTHOR_COLORS[groupChatAuthorColorIndex(uid, AUTHOR_COLORS.length)] ?? AUTHOR_COLORS[0];
}

const AVATAR = 28;

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '·';
}

function DaySeparator({ date }: { date: Date }) {
  const { t } = useT();
  const offset = calendarDayOffset(date);
  const label =
    offset === 0
      ? t('groups.chat.today')
      : offset === -1
        ? t('groups.chat.yesterday')
        : formatDate(date, date.getFullYear() === new Date().getFullYear() ? 'dayMonth' : 'long');
  return (
    <View className="items-center py-2">
      <Text variant="caption" className="bg-surface-elevated rounded-full px-3 py-1 overflow-hidden">
        {label}
      </Text>
    </View>
  );
}

/** The quoted message over a reply: whose it is and how it began. */
export function ChatQuote({
  authorUid,
  authorName,
  body,
  uid,
}: {
  authorUid: string;
  authorName: string;
  body: string;
  uid: string;
}) {
  const { t } = useT();
  return (
    <View className="border-l-4 border-accent rounded-sm bg-surface px-2 py-1 mb-1">
      <Text variant="caption" className={`font-bold ${authorColor(authorUid).fg}`} numberOfLines={1}>
        {authorUid === uid ? t('groups.chat.you') : authorName}
      </Text>
      <Text variant="bodySm" tone="onSubtle" numberOfLines={2}>
        {body}
      </Text>
    </View>
  );
}

/**
 * A message as WhatsApp draws it: others on the left with a coloured initial
 * and their name on the first of a run, the viewer's own on the right with
 * neither. Long-press opens the reactions and options; a tap on a reaction
 * under it leaves or takes back the viewer's.
 */
export function ChatMessageRow({
  message,
  layout,
  uid,
  onLongPress,
  onReact,
}: {
  message: GroupChatMessage;
  layout: GroupChatRowLayout;
  uid: string;
  onLongPress: (message: GroupChatMessage) => void;
  onReact: (message: GroupChatMessage, reaction: GroupChatReaction) => void;
}) {
  const { t } = useT();
  const mine = message.authorUid === uid;
  const color = authorColor(message.authorUid);
  const reactions = groupChatReactionCounts(message.reactions, uid);
  return (
    <VStack gap={0} className={layout.firstOfRun ? 'pt-2' : 'pt-0.5'}>
      {layout.newDay ? <DaySeparator date={message.createdAt} /> : null}
      <HStack gap={2} align="end" className={mine ? 'justify-end' : 'justify-start'}>
        {mine ? null : layout.firstOfRun ? (
          <View
            className={`${color.bg} rounded-full items-center justify-center`}
            style={{ width: AVATAR, height: AVATAR }}
            testID={`group-chat-initial-${message.id}`}
          >
            <Text variant="caption" tone="onAccent" className="font-bold">
              {initial(message.authorName)}
            </Text>
          </View>
        ) : (
          <View style={{ width: AVATAR }} />
        )}
        <Pressable
          testID={`group-chat-message-${message.id}`}
          accessibilityLabel={mine ? message.body : `${message.authorName}: ${message.body}`}
          accessibilityActions={[{ name: 'longpress', label: t('groups.chat.options') }]}
          onAccessibilityAction={() => onLongPress(message)}
          onPress={() => undefined}
          onLongPress={() => onLongPress(message)}
          delayLongPress={300}
          className={`rounded-lg px-3 py-1.5 ${mine ? 'bg-accent-subtle/30' : 'bg-surface-elevated'}`}
          style={{ maxWidth: '80%' }}
        >
          {!mine && layout.firstOfRun ? (
            <Text variant="caption" className={`font-bold ${color.fg}`} numberOfLines={1}>
              {message.authorName}
            </Text>
          ) : null}
          {message.replyTo ? (
            <ChatQuote
              authorUid={message.replyTo.authorUid}
              authorName={message.replyTo.authorName}
              body={message.replyTo.body}
              uid={uid}
            />
          ) : null}
          <Text>{message.body}</Text>
          <Text variant="caption" tone="muted" className="self-end">
            {formatDate(message.createdAt, 'time')}
          </Text>
        </Pressable>
      </HStack>
      {reactions.length > 0 ? (
        <View style={mine ? undefined : { paddingLeft: AVATAR + 8 }}>
          <HStack gap={1} className={`flex-wrap -mt-1 ${mine ? 'justify-end' : ''}`}>
            {reactions.map((r) => (
              <Pressable
                key={r.emoji}
                testID={`group-chat-reaction-${message.id}-${r.emoji}`}
                accessibilityRole="button"
                accessibilityState={{ selected: r.mine }}
                onPress={() => onReact(message, r.emoji)}
                className={`rounded-full border px-2 ${r.mine ? 'border-accent bg-surface' : 'border-subtle bg-surface-elevated'}`}
              >
                <Text variant="caption">{r.count > 1 ? `${r.emoji} ${String(r.count)}` : r.emoji}</Text>
              </Pressable>
            ))}
          </HStack>
        </View>
      ) : null}
    </VStack>
  );
}

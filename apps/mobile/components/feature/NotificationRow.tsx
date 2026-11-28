import { View } from 'react-native';
import { Pressable } from '../primitives/Pressable';
import { formatRelativeTime } from '@cultuvilla/shared/utils/format';
import { HStack } from '../primitives/HStack';
import { VStack } from '../primitives/VStack';
import { Text } from '../primitives/Text';
import { useT } from '../../lib/i18n';

export interface NotificationRowProps {
  title: string;
  body: string;
  read: boolean;
  createdAt: Date;
  /** Where a tap opens; omitted for notifications about nothing openable. */
  onPress?: () => void;
  testID?: string;
}

/**
 * Row for the Buzón activity feed. Pure presentation — no Firestore; the caller
 * resolves where a tap goes (via the shared `notificationRoute`, the same
 * function a tapped push uses). Title/body arrive already resolved (Spanish)
 * on the notification doc, so this component does not route them through i18n.
 */
export function NotificationRow({ title, body, read, createdAt, onPress, testID }: NotificationRowProps) {
  const { t } = useT();
  const row = (
    <HStack
      gap={3}
      align="start"
      className="bg-surface border-b border-subtle px-4 py-3"
      testID={testID}
    >
      {!read && (
        <View
          testID="notification-unread-dot"
          className="mt-2 h-2 w-2 rounded-full bg-accent"
          accessibilityLabel={t('notifications.unread')}
        />
      )}
      <VStack gap={1} className="flex-1">
        <Text variant="bodySm" tone={read ? 'muted' : 'primary'} className="font-semibold">
          {title}
        </Text>
        <Text variant="bodySm" tone="muted">
          {body}
        </Text>
        <Text variant="caption" tone="muted">
          {formatRelativeTime(createdAt)}
        </Text>
      </VStack>
    </HStack>
  );
  if (!onPress) return row;
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {row}
    </Pressable>
  );
}

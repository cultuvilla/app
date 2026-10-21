import { useState } from 'react';
import { watchCuotaSettings, type CuotaSettings } from '@cultuvilla/shared/services/cuotaService';
import { watchGroupMessages, type GroupMessage } from '@cultuvilla/shared/services/groupMessageService';
import { formatDate } from '@cultuvilla/shared/utils';
import { Button, Pressable, Text, VStack } from '../../primitives';
import { DetailSectionHeading } from '../DetailSectionHeading';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { ComposeMessageSheet } from './ComposeMessageSheet';
import { MessageDetailSheet } from './MessageDetailSheet';

/**
 * Messaging in Gestionar: write a message to the socios (or a part of them)
 * and the group's history of what was sent, each opening its detail — reads,
 * poll results, the WhatsApp list.
 */
export function GroupMessagesAdmin({
  orgId,
  orgName,
  uid,
  includePrivateEvents,
}: {
  orgId: string;
  orgName: string;
  uid: string;
  includePrivateEvents: boolean;
}) {
  const { t } = useT();
  const messages = useWatch<GroupMessage[]>('groups:watchGroupMessages', orgId, (next, error) =>
    watchGroupMessages(orgId, next, error),
  );
  const cuota = useWatch<CuotaSettings | null>('groups:watchCuotaSettings', orgId, (next, error) =>
    watchCuotaSettings(orgId, next, error),
  );
  const [composing, setComposing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = messages.data ?? [];
  // Follow the live doc, so a pin or a nudge shows at once in the open sheet.
  const open = rows.find((m) => m.id === openId) ?? null;

  return (
    <VStack gap={2} testID="group-msg-admin">
      <DetailSectionHeading>{t('groups.messages.title')}</DetailSectionHeading>
      <Button onPress={() => setComposing(true)} testID="group-msg-compose-open">
        {t('groups.messages.compose')}
      </Button>
      {messages.status === 'ready' && rows.length === 0 ? (
        <Text tone="muted" variant="bodySm">
          {t('groups.messages.empty')}
        </Text>
      ) : null}
      {rows.map((m) => (
        <Pressable
          key={m.id}
          testID={`group-msg-row-${m.id}`}
          accessibilityRole="button"
          onPress={() => setOpenId(m.id)}
          className="py-2 border-b border-subtle"
        >
          <Text className="font-bold">{m.title}</Text>
          {m.pinned ? (
            <Text variant="caption" className="text-accent">
              {t('groups.messages.pinnedBadge')}
            </Text>
          ) : null}
          <Text variant="caption" tone="muted">
            {t('groups.messages.summary', {
              date: formatDate(m.sentAt),
              audience: m.audience.kind === 'event' && m.audience.eventTitle ? m.audience.eventTitle : t(`groups.messages.audience.${m.audience.kind}`),
            })}
          </Text>
          <Text variant="caption" tone="muted">
            {t('groups.messages.counts', { recipients: m.recipientCount, push: m.pushCount, email: m.emailCount })}
          </Text>
        </Pressable>
      ))}

      <ComposeMessageSheet
        visible={composing}
        orgId={orgId}
        includePrivateEvents={includePrivateEvents}
        hasCuota={cuota.data != null}
        onSent={(result) =>
          showAlert(
            [t('groups.messages.sent', { count: result.recipientCount }), result.whatsappCount > 0 ? t('groups.messages.sentWhatsapp') : null]
              .filter(Boolean)
              .join('\n'),
          )
        }
        onClose={() => setComposing(false)}
      />
      <MessageDetailSheet message={open} orgId={orgId} orgName={orgName} uid={uid} onClose={() => setOpenId(null)} />
    </VStack>
  );
}

import { useState } from 'react';
import { watchCuotaSettings, type CuotaSettings } from '@cultuvilla/shared/services/cuotaService';
import { watchGroupMessages, type GroupMessage } from '@cultuvilla/shared/services/groupMessageService';
import { Button, Text, VStack } from '../../primitives';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { ComposeMessageSheet } from './ComposeMessageSheet';
import { MessageDetailSheet } from './MessageDetailSheet';
import { SentAvisoCard } from './SentAvisoCard';

/**
 * The junta's avisos: write one to the socios (or a part of them), and the
 * ones sent, each showing its reads, poll result and nudge at a glance and
 * opening its detail — who read, the voters, the WhatsApp list.
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
    <VStack gap={3} testID="group-msg-admin">
      <Button onPress={() => setComposing(true)} testID="group-msg-compose-open">
        {t('groups.messages.compose')}
      </Button>
      {messages.status === 'ready' && rows.length === 0 ? (
        <Text tone="muted" variant="bodySm">
          {t('groups.messages.empty')}
        </Text>
      ) : null}
      {rows.map((m) => (
        <SentAvisoCard key={m.id} message={m} orgId={orgId} onOpen={() => setOpenId(m.id)} />
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

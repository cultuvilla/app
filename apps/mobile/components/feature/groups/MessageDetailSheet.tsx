import { useMemo, useState } from 'react';
import { Linking, ScrollView } from 'react-native';
import {
  canNudgeGroupMessage,
  GROUP_MESSAGE_NUDGE_INTERVAL_MS,
  groupMessageWhatsappText,
  NEUTRAL_PERSONAL_VALUES,
  personalizeGroupMessage,
  tallyGroupPoll,
  unreadRecipientUids,
  type GroupMessagePersonalValues,
  whatsappLink,
  whatsappShareLink,
} from '@cultuvilla/shared/models/organization';
import { normalizeLeadPhone } from '@cultuvilla/shared/models/ambassadorLead';
import {
  nudgeGroupMessage,
  setWhatsappSent,
  watchGroupMessageDeliveries,
  watchGroupMessageReads,
  watchGroupPollVotes,
  type GroupMessage,
  type GroupMessageDelivery,
  type GroupMessageRead,
  type GroupPollVote,
} from '@cultuvilla/shared/services/groupMessageService';
import { watchOrgSocioPrivates, type SocioPrivate } from '@cultuvilla/shared/services/socioService';
import { getDeepLinkHost } from '@cultuvilla/shared/services/deepLinkService';
import { formatDate, groupPath } from '@cultuvilla/shared/utils';
import { BottomSheet, Button, Card, Checkbox, HStack, Text, VStack } from '../../primitives';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';

/**
 * One sent message, for the admins: who read it (and a nudge for who did not),
 * the poll's results with the voters, the WhatsApp links to send by hand, and
 * every recipient with their channels.
 */
export function MessageDetailSheet({
  message,
  orgId,
  orgName,
  uid,
  onClose,
}: {
  message: GroupMessage | null;
  orgId: string;
  orgName: string;
  uid: string;
  onClose: () => void;
}) {
  const { t } = useT();
  const id = message?.id ?? null;
  const deliveries = useWatch<GroupMessageDelivery[]>(
    'groups:watchGroupMessageDeliveries',
    id ? `${orgId}|${id}` : null,
    id ? (next, error) => watchGroupMessageDeliveries(orgId, id, next, error) : null,
  );
  const reads = useWatch<GroupMessageRead[]>(
    'groups:watchGroupMessageReads',
    id ? `${orgId}|${id}` : null,
    id ? (next, error) => watchGroupMessageReads(orgId, id, next, error) : null,
  );
  const votes = useWatch<GroupPollVote[]>(
    'groups:watchGroupPollVotes',
    id && message?.poll ? `${orgId}|${id}` : null,
    id && message?.poll ? (next, error) => watchGroupPollVotes(orgId, id, next, error) : null,
  );
  const needsPhones = (message?.whatsappCount ?? 0) > 0;
  const privates = useWatch<SocioPrivate[]>(
    'groups:watchOrgSocioPrivates',
    id && needsPhones ? orgId : null,
    id && needsPhones ? (next, error) => watchOrgSocioPrivates(orgId, next, error) : null,
  );
  const [nudging, setNudging] = useState(false);

  const rows = useMemo(() => deliveries.data ?? [], [deliveries.data]);
  const nameOfUid = useMemo(() => new Map(rows.flatMap((d) => (d.uid ? [[d.uid, d.names.join(', ')] as const] : []))), [rows]);
  const readIds = useMemo(() => (reads.data ?? []).map((r) => r.id), [reads.data]);
  const phoneOf = useMemo(() => new Map((privates.data ?? []).map((p) => [p.id, p.phone])), [privates.data]);

  if (!message) return null;
  const fail = () => showAlert(t('groups.messages.actionError'));
  const unread = unreadRecipientUids(message, readIds);
  const inApp = message.recipientUids.filter((u) => u !== message.sentBy);
  const now = new Date();
  const appUrl = `https://${getDeepLinkHost()}${groupPath(orgId)}`;
  const textFor = (values: GroupMessagePersonalValues) =>
    groupMessageWhatsappText({ ...personalizeGroupMessage(message, values), orgName }, appUrl);
  const whatsapp = rows.filter((d) => d.whatsappSocioId !== null);
  const tally = message.poll ? tallyGroupPoll(message.poll, votes.data ?? []) : [];

  const nudge = () => {
    setNudging(true);
    nudgeGroupMessage(orgId, message.id)
      .then((r) => showAlert(t('groups.messages.nudged', { count: r.nudged })))
      .catch(fail)
      .finally(() => setNudging(false));
  };

  const openWhatsapp = (d: GroupMessageDelivery) => {
    const raw = d.whatsappSocioId ? phoneOf.get(d.whatsappSocioId) : null;
    const phone = raw ? normalizeLeadPhone(raw) : null;
    if (!phone) return;
    void Linking.openURL(whatsappLink(phone, textFor(d.personal ?? NEUTRAL_PERSONAL_VALUES)))
      .then(() => (d.whatsappSentAt ? undefined : setWhatsappSent(orgId, message.id, d.id, uid, true)))
      .catch(fail);
  };

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={message.title}
      closeLabel={t('common.close')}
      testID="group-msg-detail"
      maxHeightRatio={0.92}
    >
      <ScrollView style={{ flexShrink: 1 }} testID="group-msg-detail-scroll">
        <VStack gap={3} className="px-5 pb-6">
          <Text variant="bodySm" tone="muted">
            {t('groups.messages.sentBy', { name: message.signerName, date: formatDate(message.sentAt, 'long') })}
          </Text>
          <Text selectable>{message.body}</Text>
          <Button
            variant="secondary"
            onPress={() => void Linking.openURL(whatsappShareLink(textFor(NEUTRAL_PERSONAL_VALUES))).catch(fail)}
            testID="group-msg-detail-share"
          >
            {t('groups.messages.whatsappShare')}
          </Button>

          {inApp.length > 0 ? (
            <Card testID="group-msg-detail-reads">
              <VStack gap={1}>
                <Text className="font-bold">
                  {t('groups.messages.readBy', { read: inApp.length - unread.length, total: inApp.length })}
                </Text>
                {unread.length === 0 ? (
                  <Text variant="bodySm" tone="muted">
                    {t('groups.messages.allRead')}
                  </Text>
                ) : (
                  <>
                    <Text variant="bodySm" tone="muted">
                      {t('groups.messages.unread')}: {unread.map((u) => nameOfUid.get(u) ?? '—').join(' · ')}
                    </Text>
                    {canNudgeGroupMessage(message, now) ? (
                      <Button onPress={nudge} loading={nudging} testID="group-msg-detail-nudge">
                        {t('groups.messages.nudge')}
                      </Button>
                    ) : (
                      <Text variant="caption" tone="muted" testID="group-msg-detail-nudge-wait">
                        {t('groups.messages.nudgeWait', {
                          date: formatDate(new Date((message.lastNudgedAt ?? now).getTime() + GROUP_MESSAGE_NUDGE_INTERVAL_MS), 'long'),
                        })}
                      </Text>
                    )}
                  </>
                )}
              </VStack>
            </Card>
          ) : null}

          {message.poll ? (
            <Card testID="group-msg-detail-poll">
              <VStack gap={1}>
                <Text className="font-bold">
                  {t('groups.messages.pollResults')}: {message.poll.question}
                </Text>
                {(votes.data ?? []).length === 0 ? (
                  <Text variant="bodySm" tone="muted">
                    {t('groups.messages.noVotes')}
                  </Text>
                ) : null}
                {message.poll.options.map((option, i) => {
                  const voters = (votes.data ?? []).filter((v) => v.option === i).map((v) => nameOfUid.get(v.id) ?? '—');
                  return (
                    <VStack key={i} gap={0} testID={`group-msg-detail-option-${i}`}>
                      <HStack justify="between">
                        <Text>{option}</Text>
                        <Text className="font-bold">{t('groups.messages.votes', { count: tally[i] ?? 0 })}</Text>
                      </HStack>
                      {voters.length > 0 ? (
                        <Text variant="caption" tone="muted">
                          {voters.join(' · ')}
                        </Text>
                      ) : null}
                    </VStack>
                  );
                })}
              </VStack>
            </Card>
          ) : null}

          {whatsapp.length > 0 ? (
            <VStack gap={2} testID="group-msg-detail-whatsapp">
              <Text className="font-bold">{t('groups.messages.whatsappTitle')}</Text>
              <Text variant="caption" tone="muted">
                {t('groups.messages.whatsappHint')}
              </Text>
              {whatsapp.map((d) => {
                const raw = d.whatsappSocioId ? phoneOf.get(d.whatsappSocioId) : null;
                const phone = raw ? normalizeLeadPhone(raw) : null;
                return (
                  <HStack key={d.id} gap={2} align="center" justify="between" testID={`group-msg-wa-${d.id}`}>
                    <VStack gap={0} className="flex-1">
                      <Text>{d.names.join(', ')}</Text>
                      {!phone && privates.status === 'ready' ? (
                        <Text variant="caption" tone="muted">
                          {t('groups.messages.whatsappNoPhone')}
                        </Text>
                      ) : null}
                    </VStack>
                    {phone ? (
                      <Button variant="secondary" onPress={() => openWhatsapp(d)} testID={`group-msg-wa-open-${d.id}`}>
                        {t('groups.messages.whatsappOpen')}
                      </Button>
                    ) : null}
                    <Checkbox
                      value={d.whatsappSentAt !== null}
                      onValueChange={(sent) => void setWhatsappSent(orgId, message.id, d.id, uid, sent).catch(fail)}
                      label={t('groups.messages.whatsappSent')}
                      testID={`group-msg-wa-sent-${d.id}`}
                    />
                  </HStack>
                );
              })}
            </VStack>
          ) : null}

          <VStack gap={1} testID="group-msg-detail-recipients">
            <Text className="font-bold">{t('groups.messages.recipients')}</Text>
            {rows.map((d) => (
              <HStack key={d.id} gap={2} justify="between">
                <Text variant="bodySm" className="flex-1">
                  {d.names.join(', ')}
                </Text>
                <Text variant="caption" tone={d.email === 'failed' ? 'danger' : 'muted'}>
                  {[
                    d.push ? t('groups.messages.channelInApp') : null,
                    d.email === 'failed' ? t('groups.messages.emailFailed') : d.email ? t('groups.messages.channelEmailShort') : null,
                    d.whatsappSocioId ? 'WhatsApp' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </HStack>
            ))}
          </VStack>
        </VStack>
      </ScrollView>
    </BottomSheet>
  );
}

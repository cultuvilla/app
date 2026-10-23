import { useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import {
  GROUP_MESSAGE_AUDIENCE_KINDS,
  GROUP_MESSAGE_BODY_MAX,
  GROUP_MESSAGE_TITLE_MAX,
  GROUP_POLL_MAX_OPTIONS,
  GROUP_WHATSAPP_MODES,
  type GroupMessageAudienceKind,
  type SendGroupMessageResult,
} from '@cultuvilla/shared/models/organization';
import { firstOfEachSeries } from '@cultuvilla/shared/models/event/EventSeriesModel';
import { upcomingThenPast, type EventData } from '@cultuvilla/shared/models/event/EventDataModel';
import { newGroupMessageId, sendGroupMessage } from '@cultuvilla/shared/services/groupMessageService';
import { watchEventsByOrganization } from '@cultuvilla/shared/services/eventService';
import { firebaseErrorCode } from '@cultuvilla/shared/firebase/sdk/errors';
import { formatDate } from '@cultuvilla/shared/utils';
import { BottomSheet, Button, HStack, Input, Pressable, Text, Toggle, VStack } from '../../primitives';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { composerInput, emptyComposerForm, type ComposerError, type ComposerForm, type PollChoice } from '../../../lib/orgs/messaging';
import { ChoiceRow } from './ChoiceRow';

type Event = EventData & { id: string };

const POLL_CHOICES: readonly PollChoice[] = ['none', 'yes_no', 'choice'];

const ERROR_KEY: Record<ComposerError, string> = {
  subject: 'groups.messages.subjectRequired',
  body: 'groups.messages.bodyRequired',
  event: 'groups.messages.eventRequired',
  poll: 'groups.messages.pollInvalid',
};

/**
 * The admin's composer: subject and message, who it goes to, by which
 * channels, pinned or not, and an optional poll. Sending is one callable; the
 * WhatsApp links are sent afterwards from the message's detail.
 */
export function ComposeMessageSheet({
  visible,
  orgId,
  includePrivateEvents,
  hasCuota,
  onSent,
  onClose,
}: {
  visible: boolean;
  orgId: string;
  includePrivateEvents: boolean;
  /** The cuota audience needs a configured cuota. */
  hasCuota: boolean;
  onSent: (result: SendGroupMessageResult) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [form, setForm] = useState<ComposerForm>(emptyComposerForm);
  const [messageId, setMessageId] = useState('');
  const [error, setError] = useState<ComposerError | null>(null);
  const [sending, setSending] = useState(false);
  const events = useWatch<Event[]>(
    'groups:watchEventsByOrganization',
    visible ? `${orgId}|${includePrivateEvents}` : null,
    visible ? (next, err) => watchEventsByOrganization(orgId, { includePrivate: includePrivateEvents }, next, err) : null,
  );
  const eventList = useMemo(() => firstOfEachSeries(upcomingThenPast(events.data ?? [], new Date())), [events.data]);

  useEffect(() => {
    if (visible) {
      setForm(emptyComposerForm());
      // One id per opened composer: a retry of the same send is the same message.
      setMessageId(newGroupMessageId(orgId));
      setError(null);
    }
  }, [visible, orgId]);

  const set = <K extends keyof ComposerForm>(key: K, value: ComposerForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const audiences = GROUP_MESSAGE_AUDIENCE_KINDS.filter((a) => a !== 'cuota' || hasCuota);

  const send = () => {
    const built = composerInput(form, { orgId, messageId }, [t('groups.messages.yes'), t('groups.messages.no')]);
    if ('error' in built) {
      setError(built.error);
      return;
    }
    setError(null);
    setSending(true);
    sendGroupMessage(built.input)
      .then((result) => {
        onSent(result);
        onClose();
      })
      .catch((err: unknown) => {
        // The server's own words when it refused for a reason (nobody to send to, …).
        const reason = firebaseErrorCode(err) === 'failed-precondition' && err instanceof Error ? err.message : null;
        showAlert(reason ?? t('groups.messages.error'));
      })
      .finally(() => setSending(false));
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('groups.messages.compose')}
      closeLabel={t('common.close')}
      testID="group-msg-compose"
      maxHeightRatio={0.92}
      footer={
        <VStack className="px-5 pt-3">
          <Button onPress={send} loading={sending} fullWidth testID="group-msg-send">
            {t('groups.messages.send')}
          </Button>
        </VStack>
      }
    >
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" testID="group-msg-compose-scroll">
        <VStack gap={3} className="px-5 pb-4">
          <Input
            label={t('groups.messages.subject')}
            value={form.title}
            onChangeText={(v) => set('title', v)}
            maxLength={GROUP_MESSAGE_TITLE_MAX}
            error={error === 'subject' ? t(ERROR_KEY.subject) : undefined}
            testID="group-msg-subject"
          />
          <Input
            label={t('groups.messages.body')}
            value={form.body}
            onChangeText={(v) => set('body', v)}
            multiline
            autoGrow
            maxLength={GROUP_MESSAGE_BODY_MAX}
            error={error === 'body' ? t(ERROR_KEY.body) : undefined}
            testID="group-msg-body"
          />

          <Text variant="bodySm" className="font-bold">
            {t('groups.messages.audienceLabel')}
          </Text>
          <ChoiceRow<GroupMessageAudienceKind>
            testID="group-msg-audience"
            value={form.audience}
            options={audiences.map((a) => ({ value: a, label: t(`groups.messages.audience.${a}`) }))}
            onChange={(v) => set('audience', v)}
          />
          {form.audience === 'event' ? (
            <VStack gap={1} testID="group-msg-events">
              <Text variant="bodySm" tone="muted">
                {t('groups.messages.pickEvent')}
              </Text>
              {eventList.length === 0 ? (
                <Text variant="bodySm" tone="muted">
                  {t('groups.messages.noEvents')}
                </Text>
              ) : (
                eventList.map((e) => {
                  const selected = form.eventId === e.id;
                  return (
                    <Pressable
                      key={e.id}
                      testID={`group-msg-event-${e.id}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => set('eventId', e.id)}
                      className={`px-3 py-2 rounded-md border ${selected ? 'border-accent bg-subtle' : 'border-subtle bg-surface'}`}
                    >
                      <Text className={selected ? 'font-bold' : ''}>{e.title}</Text>
                      <Text variant="caption" tone="muted">
                        {formatDate(e.startDate)}
                      </Text>
                    </Pressable>
                  );
                })
              )}
              {error === 'event' ? (
                <Text variant="bodySm" tone="danger">
                  {t(ERROR_KEY.event)}
                </Text>
              ) : null}
            </VStack>
          ) : null}

          <Text variant="bodySm" className="font-bold">
            {t('groups.messages.channelsLabel')}
          </Text>
          <Toggle testID="group-msg-push" value={form.push} label={t('groups.messages.channelPush')} onValueChange={(v) => set('push', v)} />
          <Toggle testID="group-msg-email" value={form.email} label={t('groups.messages.channelEmail')} onValueChange={(v) => set('email', v)} />
          <Text variant="bodySm" tone="muted">
            {t('groups.messages.whatsappLabel')}
          </Text>
          <ChoiceRow
            testID="group-msg-whatsapp"
            value={form.whatsapp}
            options={GROUP_WHATSAPP_MODES.map((m) => ({ value: m, label: t(`groups.messages.whatsapp.${m}`) }))}
            onChange={(v) => set('whatsapp', v)}
          />

          <Toggle testID="group-msg-pinned" value={form.pinned} label={t('groups.messages.pinned')} onValueChange={(v) => set('pinned', v)} />
          <Text variant="caption" tone="muted">
            {t('groups.messages.pinnedHint')}
          </Text>

          <Text variant="bodySm" className="font-bold">
            {t('groups.messages.pollLabel')}
          </Text>
          <ChoiceRow
            testID="group-msg-poll"
            value={form.poll}
            options={POLL_CHOICES.map((p) => ({ value: p, label: t(`groups.messages.poll.${p}`) }))}
            onChange={(v) => set('poll', v)}
          />
          {form.poll !== 'none' ? (
            <VStack gap={2}>
              <Input
                label={t('groups.messages.pollQuestion')}
                value={form.question}
                onChangeText={(v) => set('question', v)}
                testID="group-msg-poll-question"
              />
              {form.poll === 'choice'
                ? form.options.map((option, i) => (
                    <HStack key={i} gap={2} align="center">
                      <Input
                        className="flex-1"
                        label={t('groups.messages.pollOption', { n: i + 1 })}
                        value={option}
                        onChangeText={(v) => set('options', form.options.map((o, j) => (j === i ? v : o)))}
                        testID={`group-msg-poll-option-${i}`}
                      />
                      {form.options.length > 2 ? (
                        <Button
                          variant="ghost"
                          onPress={() => set('options', form.options.filter((_, j) => j !== i))}
                          testID={`group-msg-poll-remove-${i}`}
                        >
                          {t('groups.messages.pollRemoveOption', { n: i + 1 })}
                        </Button>
                      ) : null}
                    </HStack>
                  ))
                : null}
              {form.poll === 'choice' && form.options.length < GROUP_POLL_MAX_OPTIONS ? (
                <Button variant="secondary" onPress={() => set('options', [...form.options, ''])} testID="group-msg-poll-add">
                  {t('groups.messages.pollAddOption')}
                </Button>
              ) : null}
              {error === 'poll' ? (
                <Text variant="bodySm" tone="danger">
                  {t(ERROR_KEY.poll)}
                </Text>
              ) : null}
            </VStack>
          ) : null}
        </VStack>
      </ScrollView>
    </BottomSheet>
  );
}

import { useState } from 'react';
import { ScrollView } from 'react-native';
import { GROUP_MESSAGE_BODY_MAX, GROUP_MESSAGE_TITLE_MAX } from '@cultuvilla/shared/models/organization';
import { newGroupMessageId, sendGroupMessage } from '@cultuvilla/shared/services/groupMessageService';
import { firebaseErrorCode } from '@cultuvilla/shared/firebase/sdk/errors';
import { Button, Input, Text, VStack } from '../../primitives';
import { FormModal } from '../../layout/FormModal';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { socioAvisoInput } from '../../../lib/orgs/messaging';

/**
 * A socio's way to send an aviso, where the junta lets its socios
 * (`sociosSendAvisos`): a subject and a text, to every socio, in the app.
 * Everything else an aviso can carry — a poll, a narrower audience, email,
 * WhatsApp, who has read it — is the junta's (ComposeMessageSheet), and the
 * server refuses it from anyone else.
 */
export function SocioAvisoComposer({ orgId }: { orgId: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [messageId, setMessageId] = useState('');
  const [error, setError] = useState<'subject' | 'body' | null>(null);
  const [sending, setSending] = useState(false);

  const start = () => {
    setTitle('');
    setBody('');
    setError(null);
    // One id per opened composer: a retry of the same send is the same aviso.
    setMessageId(newGroupMessageId(orgId));
    setOpen(true);
  };

  const send = () => {
    const built = socioAvisoInput({ title, body }, { orgId, messageId });
    if ('error' in built) {
      setError(built.error);
      return;
    }
    setError(null);
    setSending(true);
    sendGroupMessage(built.input)
      .then((result) => {
        setOpen(false);
        showAlert(t('groups.messages.sent', { count: result.recipientCount }));
      })
      .catch((err: unknown) => {
        // The junta switched it off while this was being written.
        showAlert(t(firebaseErrorCode(err) === 'permission-denied' ? 'groups.messages.socioNotAllowed' : 'groups.messages.error'));
      })
      .finally(() => setSending(false));
  };

  return (
    <>
      <Button onPress={start} testID="group-socio-aviso-open">
        {t('groups.messages.socioCompose')}
      </Button>
      <FormModal
        visible={open}
        onClose={() => setOpen(false)}
        title={t('groups.messages.socioCompose')}
        testID="group-socio-aviso"
        footer={
          <VStack className="px-5 pt-3">
            <Button onPress={send} loading={sending} fullWidth testID="group-socio-aviso-send">
              {t('groups.messages.send')}
            </Button>
          </VStack>
        }
      >
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          <VStack gap={3} className="px-4 pt-4 pb-6">
            <Text variant="bodySm" tone="muted">
              {t('groups.messages.socioComposeHint')}
            </Text>
            <Input
              label={t('groups.messages.subject')}
              value={title}
              onChangeText={setTitle}
              maxLength={GROUP_MESSAGE_TITLE_MAX}
              error={error === 'subject' ? t('groups.messages.subjectRequired') : undefined}
              testID="group-socio-aviso-subject"
            />
            <Input
              label={t('groups.messages.body')}
              value={body}
              onChangeText={setBody}
              multiline
              autoGrow
              maxLength={GROUP_MESSAGE_BODY_MAX}
              error={error === 'body' ? t('groups.messages.bodyRequired') : undefined}
              testID="group-socio-aviso-body"
            />
          </VStack>
        </ScrollView>
      </FormModal>
    </>
  );
}

import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { madridDayKey } from '@cultuvilla/shared/models/event';
import { MAX_COSA_REQUEST_MESSAGE } from '@cultuvilla/shared/models/organization';
import { requestCosa, type Cosa } from '@cultuvilla/shared/services/cosatecaService';
import { Button, DateRangeField, Input, VStack } from '../../../primitives';
import { FormModal } from '../../../layout/FormModal';
import { useT } from '../../../../lib/i18n';
import { showAlert } from '../../../../lib/dialogs';
import type { DayRange } from '../../../../lib/date/dayRange';
import { cosatecaErrorMessage } from '../../../../lib/orgs/cosateca';

/**
 * Ask for a cosa: optional dates (a regalo has none) and a message for its
 * manager. Answers with the new request's id.
 */
export function AskCosaSheet({
  visible,
  cosa,
  uid,
  myName,
  onClose,
  onSent,
}: {
  visible: boolean;
  cosa: Cosa;
  uid: string;
  /** The viewer's public name, which the request carries. */
  myName: string;
  onClose: () => void;
  onSent: (requestId: string) => void;
}) {
  const { t } = useT();
  const [range, setRange] = useState<DayRange | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setRange(null);
    setMessage('');
  }, [visible]);

  const send = () => {
    setSending(true);
    requestCosa({
      municipalityId: cosa.municipalityId,
      orgId: cosa.orgId,
      cosaId: cosa.id,
      cosaTitle: cosa.title,
      cosaKind: cosa.kind,
      ownerUid: cosa.ownerUid,
      requesterUid: uid,
      requesterName: myName,
      message: message.trim() || null,
      fromOn: range?.startDay ?? null,
      untilOn: range?.endDay ?? null,
    })
      .then((id) => {
        onClose();
        onSent(id);
      })
      .catch((err: unknown) => showAlert(cosatecaErrorMessage(t, err)))
      .finally(() => setSending(false));
  };

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title={t('groups.cosateca.ask.title', { title: cosa.title })}
      testID="ask-cosa-sheet"
      footer={
        <VStack gap={2} className="px-5 pt-3">
          <Button onPress={send} loading={sending} disabled={!myName} fullWidth testID="ask-cosa-send">
            {t('groups.cosateca.ask.send')}
          </Button>
        </VStack>
      }
    >
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        <VStack gap={3} className="px-4 pt-4 pb-6">
          {cosa.kind === 'regalo' ? null : (
            <VStack gap={1}>
              <DateRangeField
                label={t('groups.cosateca.ask.dates')}
                value={range}
                onChange={setRange}
                minDay={madridDayKey(new Date())}
                placeholder={t('groups.cosateca.ask.noDates')}
                testID="ask-cosa-dates"
              />
              {range ? (
                <Button variant="ghost" onPress={() => setRange(null)} testID="ask-cosa-clear-dates">
                  {t('groups.cosateca.ask.noDates')}
                </Button>
              ) : null}
            </VStack>
          )}
          <Input
            label={t('groups.cosateca.ask.message')}
            value={message}
            onChangeText={setMessage}
            maxLength={MAX_COSA_REQUEST_MESSAGE}
            autoGrow
            testID="ask-cosa-message"
          />
        </VStack>
      </ScrollView>
    </FormModal>
  );
}

import { useCallback, useState } from 'react';
import { Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VStack } from '../primitives/VStack';
import { HStack } from '../primitives/HStack';
import { Text } from '../primitives/Text';
import { Pressable } from '../primitives/Pressable';
import { Button } from '../primitives/Button';
import { buildRosterExport, toCsv } from '@cultuvilla/shared/export/rosterExport';
import type { RegistrationData } from '@cultuvilla/shared/models/event/RegistrationDataModel';
import type {
  SignupAnswers,
  SignupFieldSpec,
} from '@cultuvilla/shared/models/event/SignupFieldModel';
import type { PartialDate } from '@cultuvilla/shared/models/person/PersonDataModel';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { useT } from '../../lib/i18n';
import { downloadFile } from '../../lib/export/downloadFile';
import { buildRosterWorkbook, XLSX_MIME } from '../../lib/export/rosterWorkbook';
import { observability } from '@cultuvilla/shared';

type Row = RegistrationData & { id: string };

export interface RosterExportButtonProps {
  eventTitle: string;
  eventDate: Date | null;
  registrations: Row[];
  phones: Record<string, string | null>;
  /** Registration id -> the attendee's birth date; adds a roster column. */
  birthdays?: Record<string, PartialDate | null>;
  telephoneRequired: boolean;
  requiresPayment: boolean;
  /** The event's custom questions; each becomes a trailing column. */
  signupFields?: SignupFieldSpec[];
  /** Registration id -> that attendee's answers. */
  answers?: Record<string, SignupAnswers>;
}

/**
 * Roster download control on the event's attendee section. Available on every
 * platform: the web build triggers a browser download, iOS/Android write the
 * file to cache and open the system share sheet (see lib/export/downloadFile).
 *
 * Excel is the default because that's what organizers hand around; CSV stays
 * one tap away for anything that eats a plain table.
 */
export function RosterExportButton(props: RosterExportButtonProps) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'xlsx' | 'csv' | null>(null);
  const [failed, setFailed] = useState(false);

  const {
    eventTitle,
    eventDate,
    registrations,
    phones,
    birthdays,
    telephoneRequired,
    requiresPayment,
    signupFields,
    answers,
  } = props;

  const run = useCallback(
    async (format: 'xlsx' | 'csv') => {
      setBusy(format);
      setFailed(false);
      try {
        const model = buildRosterExport({
          eventTitle,
          eventDate,
          registrations,
          phones,
          birthdays,
          telephoneRequired,
          requiresPayment,
          signupFields,
          answers,
        });
        if (format === 'csv') {
          await downloadFile(toCsv(model), `${model.fileName}.csv`, 'text/csv;charset=utf-8');
        } else {
          // buildRosterWorkbook itself defers ExcelJS behind a dynamic import,
          // so the heavy dependency still stays out of the initial bundle.
          await downloadFile(await buildRosterWorkbook(model), `${model.fileName}.xlsx`, XLSX_MIME);
        }
        setOpen(false);
      } catch (error) {
        setFailed(true);
        observability.captureError(error, { scope: 'rosterExport', format });
      } finally {
        setBusy(null);
      }
    },
    [
      eventTitle,
      eventDate,
      registrations,
      phones,
      birthdays,
      telephoneRequired,
      requiresPayment,
      signupFields,
      answers,
    ],
  );

  if (registrations.length === 0) return null;

  return (
    <>
      <Pressable
        testID="export-roster"
        accessibilityRole="button"
        accessibilityLabel={t('event.export.action')}
        hitSlop={8}
        onPress={() => setOpen(true)}
      >
        <Ionicons name="download-outline" size={iconSizes.md} color={colors.light.fg.accent} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          accessible={false}
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          className="items-center justify-center px-8"
        >
          {/* Inner press-catcher: taps inside the card must not dismiss. */}
          <Pressable
            accessible={false}
            onPress={() => {}}
            className="w-full max-w-md rounded-lg border border-subtle bg-surface-elevated p-5"
          >
            <VStack gap={3}>
              <Text variant="h3" className="font-bold">
                {t('event.export.title')}
              </Text>
              <Text tone="muted" variant="bodySm">
                {t('event.export.body', { count: registrations.length })}
              </Text>
              <Button
                testID="export-roster-xlsx"
                variant="primary"
                fullWidth
                loading={busy === 'xlsx'}
                disabled={busy !== null}
                onPress={() => void run('xlsx')}
              >
                {t('event.export.excel')}
              </Button>
              <Button
                testID="export-roster-csv"
                variant="secondary"
                fullWidth
                loading={busy === 'csv'}
                disabled={busy !== null}
                onPress={() => void run('csv')}
              >
                {t('event.export.csv')}
              </Button>
              {failed ? (
                <Text tone="danger" variant="bodySm">
                  {t('event.export.error')}
                </Text>
              ) : null}
              <HStack justify="end">
                <Pressable onPress={() => setOpen(false)} accessibilityRole="button">
                  <Text tone="muted">{t('common.cancel')}</Text>
                </Pressable>
              </HStack>
            </VStack>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

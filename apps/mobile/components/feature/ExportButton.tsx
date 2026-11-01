import { useCallback, useState } from 'react';
import { Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VStack } from '../primitives/VStack';
import { HStack } from '../primitives/HStack';
import { Text } from '../primitives/Text';
import { Pressable } from '../primitives/Pressable';
import { Button } from '../primitives/Button';
import { toCsv, type RosterExportModel } from '@cultuvilla/shared/export/rosterExport';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { observability } from '@cultuvilla/shared';
import { useT } from '../../lib/i18n';
import { downloadFile } from '../../lib/export/downloadFile';
import { buildRosterWorkbook, XLSX_MIME } from '../../lib/export/rosterWorkbook';

export interface ExportButtonProps {
  /** Builds the table on press, so an unopened sheet costs nothing. */
  buildModel: () => RosterExportModel;
  title: string;
  body: string;
  accessibilityLabel: string;
  /** Spelled out by the caller so the E2E coverage scan can see each one. */
  testID: string;
  xlsxTestID: string;
  csvTestID: string;
  /** Observability scope of a failed export. */
  scope: string;
}

/**
 * A download control for any export model (an event's attendees, a cuota
 * period). Available on every platform: iOS/Android write the file to cache
 * and open the system share sheet (see lib/export/downloadFile).
 *
 * Excel is the default because that's what organizers hand around; CSV stays
 * one tap away for anything that eats a plain table.
 */
export function ExportButton({ buildModel, title, body, accessibilityLabel, testID, xlsxTestID, csvTestID, scope }: ExportButtonProps) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'xlsx' | 'csv' | null>(null);
  const [failed, setFailed] = useState(false);

  const run = useCallback(
    async (format: 'xlsx' | 'csv') => {
      setBusy(format);
      setFailed(false);
      try {
        const model = buildModel();
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
        observability.captureError(error, { scope, format });
      } finally {
        setBusy(null);
      }
    },
    [buildModel, scope],
  );

  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={8}
        onPress={() => setOpen(true)}
      >
        <Ionicons name="download-outline" size={iconSizes.md} color={colors.light.fg.accent} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          accessible={false}
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          className="items-center justify-center px-8"
        >
          {/* Inner press-catcher: taps inside the card must not dismiss. */}
          <Pressable
            accessible={false}
            // Its backdrop is not an accessibility element, so VoiceOver closes the
            // sheet with the escape gesture instead.
            onAccessibilityEscape={() => setOpen(false)}
            onPress={() => {}}
            className="w-full max-w-md rounded-lg border border-subtle bg-surface-elevated p-5"
          >
            <VStack gap={3}>
              <Text variant="h3" className="font-bold">
                {title}
              </Text>
              <Text tone="muted" variant="bodySm">
                {body}
              </Text>
              <Button
                testID={xlsxTestID}
                variant="primary"
                fullWidth
                loading={busy === 'xlsx'}
                disabled={busy !== null}
                onPress={() => void run('xlsx')}
              >
                {t('event.export.excel')}
              </Button>
              <Button
                testID={csvTestID}
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

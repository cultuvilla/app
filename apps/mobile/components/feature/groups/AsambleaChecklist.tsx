import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { observability } from '@cultuvilla/shared';
import {
  buildActasExport,
  buildLibroSociosExport,
  buildYearSummaryExport,
  recordsBundleFileName,
} from '@cultuvilla/shared/export/recordsExport';
import {
  asambleaAccountsYear,
  asambleaChecklist,
  buildYearSummary,
  libroDeSocios,
  upcomingAsamblea,
  type AsambleaCheck,
} from '@cultuvilla/shared/models/organization';
import { watchCuotaPaymentsForYear, type CuotaPayment } from '@cultuvilla/shared/services/cuotaService';
import { watchOpenGroupTasks, type GroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { watchActas, watchLedgerEntriesForYear, type Acta, type LedgerEntry } from '@cultuvilla/shared/services/recordsService';
import { watchOrgSocios, type Socio } from '@cultuvilla/shared/services/socioService';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { formatDayKey, type RecordsDoor } from '@cultuvilla/shared/utils';
import { Button, Card, HStack, Pressable, Text, VStack } from '../../primitives';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { downloadFile } from '../../../lib/export/downloadFile';
import { buildWorkbook, XLSX_MIME } from '../../../lib/export/rosterWorkbook';
import { groupRecordsHref } from '../../../lib/navigation/routes';
import { todayKey } from '../../../lib/orgs/cuota';

const DOOR_OF: Record<AsambleaCheck['item'], RecordsDoor> = { libro: 'libro', acta: 'actas', cuentas: 'cuentas' };

/**
 * Shown only while the group's asamblea task is close: what the folder still
 * lacks for it, each line opening its door, and one file with all of it.
 */
export function AsambleaChecklist({ orgId, orgName }: { orgId: string; orgName: string }) {
  const { t } = useT();
  const today = todayKey();
  const tasks = useWatch<GroupTask[]>('groups:watchOpenGroupTasks', orgId, (next, error) => watchOpenGroupTasks(orgId, next, error));
  const asamblea = useMemo(() => (tasks.data ? upcomingAsamblea(tasks.data, today) : null), [tasks.data, today]);
  const year = asamblea ? asambleaAccountsYear(asamblea.dueOn) : null;

  const socios = useWatch<Socio[]>('groups:watchOrgSocios', orgId, (next, error) => watchOrgSocios(orgId, next, error));
  const actas = useWatch<Acta[]>('groups:watchActas', orgId, (next, error) => watchActas(orgId, next, error));
  const cuota = useWatch<CuotaPayment[]>(
    'groups:watchCuotaPaymentsForYear',
    year ? `${orgId}|${year}` : null,
    year ? (next, error) => watchCuotaPaymentsForYear(orgId, year, next, error) : null,
  );
  const ledger = useWatch<LedgerEntry[]>(
    'groups:watchLedgerEntriesForYear',
    year ? `${orgId}|${year}` : null,
    year ? (next, error) => watchLedgerEntriesForYear(orgId, year, next, error) : null,
  );
  const [busy, setBusy] = useState(false);

  const ready =
    asamblea && year && socios.status === 'ready' && actas.status === 'ready' && cuota.status === 'ready' && ledger.status === 'ready';
  const summary = useMemo(
    () => (year ? buildYearSummary({ year, cuotaPayments: cuota.data ?? [], ledgerEntries: ledger.data ?? [] }) : null),
    [year, cuota.data, ledger.data],
  );
  if (!ready || !summary) return null;

  const checks = asambleaChecklist({
    asambleaDay: asamblea.dueOn,
    socios: socios.data ?? [],
    actas: actas.data ?? [],
    accountsYear: year,
    accountsEntries:
      summary.cuotaByPeriod.reduce((sum, p) => sum + p.payments, 0) + summary.entries.filter((e) => !e.reversed).length,
  });

  const exportAll = async () => {
    setBusy(true);
    try {
      const models = [
        buildLibroSociosExport({ orgName, socios: libroDeSocios(socios.data ?? []) }),
        buildActasExport({ orgName, actas: actas.data ?? [] }),
        buildYearSummaryExport({ orgName, summary }),
      ];
      await downloadFile(await buildWorkbook(models, t('groups.records.title')), `${recordsBundleFileName(orgName)}.xlsx`, XLSX_MIME);
    } catch (error) {
      observability.captureError(error, { scope: 'recordsBundleExport' });
      showAlert(t('groups.records.asamblea.exportFailed'));
    } finally {
      setBusy(false);
    }
  };

  const label = (check: AsambleaCheck): string => {
    switch (check.item) {
      case 'libro':
        return check.ok ? t('groups.records.asamblea.libroOk') : t('groups.records.asamblea.libroUnnumbered', { count: check.unnumbered });
      case 'acta':
        return check.ok
          ? t('groups.records.asamblea.actaOk')
          : t(check.reason === 'missing' ? 'groups.records.asamblea.actaMissing' : 'groups.records.asamblea.actaHidden');
      case 'cuentas':
        return check.ok
          ? t('groups.records.asamblea.cuentasOk', { year: check.year, count: check.entries })
          : t('groups.records.asamblea.cuentasEmpty', { year: check.year });
    }
  };

  return (
    <Card className="bg-subtle border-0" testID="asamblea-checklist">
      <VStack gap={2}>
        <Text className="font-bold">{t('groups.records.asamblea.title', { date: formatDayKey(asamblea.dueOn) })}</Text>
        {checks.map((check) => (
          <Pressable
            key={check.item}
            testID={`asamblea-check-${check.item}`}
            accessibilityRole="button"
            onPress={() => router.push(groupRecordsHref(orgId, DOOR_OF[check.item]))}
          >
            <HStack gap={2} align="center">
              <Ionicons
                name={check.ok ? 'checkmark-circle' : 'alert-circle'}
                size={iconSizes.md}
                color={check.ok ? colors.light.fg.success : colors.light.fg.accent}
              />
              <Text variant="bodySm" className="flex-1">
                {label(check)}
              </Text>
            </HStack>
          </Pressable>
        ))}
        <Button size="md" onPress={() => void exportAll()} loading={busy} disabled={busy} testID="asamblea-export-all">
          {t('groups.records.asamblea.exportAll')}
        </Button>
      </VStack>
    </Card>
  );
}

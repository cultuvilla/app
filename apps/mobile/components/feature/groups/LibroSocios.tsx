import { useCallback, useMemo } from 'react';
import { buildLibroSociosExport } from '@cultuvilla/shared/export/recordsExport';
import { isActiveSocio, libroDeSocios } from '@cultuvilla/shared/models/organization';
import { watchOrgSocios, type Socio } from '@cultuvilla/shared/services/socioService';
import { formatDate } from '@cultuvilla/shared/utils';
import { HStack, Text, VStack } from '../../primitives';
import { ExportButton } from '../ExportButton';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';

/**
 * The libro de socios: every roster row ever — the roster never deletes one —
 * in alta order with its socio number and its baja. The Registros' Libro door;
 * the export is the libro to print or hand on.
 */
export function LibroSocios({ orgId, orgName }: { orgId: string; orgName: string }) {
  const { t } = useT();
  const socios = useWatch<Socio[]>('groups:watchOrgSocios', orgId, (next, error) => watchOrgSocios(orgId, next, error));
  const rows = useMemo(() => libroDeSocios(socios.data ?? []), [socios.data]);
  const buildModel = useCallback(() => buildLibroSociosExport({ orgName, socios: rows }), [orgName, rows]);

  if (socios.status !== 'ready') return null;
  const active = rows.filter(isActiveSocio).length;

  return (
    <VStack gap={2} testID="libro-socios">
      <HStack justify="between" align="center">
        <Text variant="bodySm" tone="muted" className="flex-1" testID="libro-summary">
          {rows.length === 0 ? t('groups.records.libro.empty') : t('groups.records.libro.summary', { active, bajas: rows.length - active })}
        </Text>
        {rows.length > 0 ? (
          <ExportButton
            buildModel={buildModel}
            title={t('groups.records.libro.exportTitle')}
            body={t('groups.records.libro.exportBody', { count: rows.length })}
            accessibilityLabel={t('groups.records.libro.exportTitle')}
            testID="libro-export"
            xlsxTestID="libro-export-xlsx"
            csvTestID="libro-export-csv"
            scope="libroSociosExport"
          />
        ) : null}
      </HStack>
      {rows.map((s) => (
        <VStack key={s.id} className="py-1 border-b border-subtle" testID={`libro-row-${s.id}`}>
          <Text className={s.bajaAt ? 'text-muted' : ''}>
            {s.socioNumber !== null
              ? t('groups.records.libro.numbered', { number: String(s.socioNumber), name: s.displayName })
              : s.displayName}
          </Text>
          <Text variant="caption" tone="muted">
            {s.bajaAt
              ? t('groups.records.libro.altaBaja', { alta: formatDate(s.altaAt), baja: formatDate(s.bajaAt) })
              : t('groups.records.libro.alta', { alta: formatDate(s.altaAt) })}
          </Text>
        </VStack>
      ))}
    </VStack>
  );
}

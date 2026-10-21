import { useMemo, useState } from 'react';
import { compareActas } from '@cultuvilla/shared/models/organization';
import { watchSocioVisibleActas, type Acta } from '@cultuvilla/shared/services/recordsService';
import { VStack } from '../../primitives';
import { DetailSectionHeading } from '../DetailSectionHeading';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { ActaDetailSheet, ActaRow } from './ActaDetailSheet';

/** A socio's view of the actas the junta shared, newest first. Hidden while there are none. */
export function MyActas({ orgId, orgName }: { orgId: string; orgName: string }) {
  const { t } = useT();
  const actas = useWatch<Acta[]>('groups:watchSocioVisibleActas', orgId, (next, error) => watchSocioVisibleActas(orgId, next, error));
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = useMemo(() => [...(actas.data ?? [])].sort(compareActas), [actas.data]);

  if (rows.length === 0) return null;

  return (
    <VStack gap={1} testID="my-actas">
      <DetailSectionHeading>{t('groups.records.actas.title')}</DetailSectionHeading>
      {rows.map((acta) => (
        <ActaRow key={acta.id} acta={acta} showVisibility={false} onOpen={() => setOpenId(acta.id)} />
      ))}
      <ActaDetailSheet acta={rows.find((a) => a.id === openId) ?? null} orgName={orgName} onClose={() => setOpenId(null)} />
    </VStack>
  );
}

import { useMemo, useState } from 'react';
import { compareActas } from '@cultuvilla/shared/models/organization';
import { createActa, deleteActa, updateActa, watchActas, type Acta } from '@cultuvilla/shared/services/recordsService';
import { watchOrgSocios, type Socio } from '@cultuvilla/shared/services/socioService';
import { formatDayKey } from '@cultuvilla/shared/utils';
import { Button, HStack, Text, VStack } from '../../primitives';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { showAlert, showConfirm } from '../../../lib/dialogs';
import { ActaDetailSheet, ActaRow } from './ActaDetailSheet';
import { ActaSheet } from './ActaSheet';

type Sheet = { kind: 'form'; acta: Acta | null } | { kind: 'detail'; actaId: string } | null;

/** Admins: every acta, newest meeting first; write, correct, share or delete one. */
export function ActasAdmin({ orgId, orgName, uid }: { orgId: string; orgName: string; uid: string }) {
  const { t } = useT();
  const actas = useWatch<Acta[]>('groups:watchActas', orgId, (next, error) => watchActas(orgId, next, error));
  const socios = useWatch<Socio[]>('groups:watchOrgSocios', orgId, (next, error) => watchOrgSocios(orgId, next, error));
  const [sheet, setSheet] = useState<Sheet>(null);
  const rows = useMemo(() => [...(actas.data ?? [])].sort(compareActas), [actas.data]);

  if (actas.status !== 'ready') return null;
  // Looked up live, so the detail shows an edit as soon as it is saved.
  const detail = sheet?.kind === 'detail' ? (rows.find((a) => a.id === sheet.actaId) ?? null) : null;

  const remove = (acta: Acta) =>
    showConfirm(
      t('groups.records.actas.deleteConfirmTitle'),
      t('groups.records.actas.deleteConfirmBody', { date: formatDayKey(acta.heldOn) }),
      () => {
        setSheet(null);
        deleteActa(orgId, acta.id).catch(() => showAlert(t('groups.records.error')));
      },
      { confirmText: t('groups.records.actas.delete'), cancelText: t('common.cancel') },
    );

  return (
    <VStack gap={2} testID="actas-admin">
      <HStack justify="between" align="center">
        <Text className="font-bold">{t('groups.records.actas.title')}</Text>
        <Button size="md" variant="secondary" onPress={() => setSheet({ kind: 'form', acta: null })} testID="acta-new">
          {t('groups.records.actas.new')}
        </Button>
      </HStack>
      {rows.length === 0 ? (
        <Text variant="bodySm" tone="muted">
          {t('groups.records.actas.empty')}
        </Text>
      ) : (
        rows.map((acta) => <ActaRow key={acta.id} acta={acta} showVisibility onOpen={() => setSheet({ kind: 'detail', actaId: acta.id })} />)
      )}

      <ActaDetailSheet
        acta={detail}
        orgName={orgName}
        onClose={() => setSheet(null)}
        onEdit={detail ? () => setSheet({ kind: 'form', acta: detail }) : undefined}
        onDelete={detail ? () => remove(detail) : undefined}
      />
      <ActaSheet
        visible={sheet?.kind === 'form'}
        acta={sheet?.kind === 'form' ? sheet.acta : null}
        socios={socios.data ?? []}
        onSave={async (input) => {
          if (sheet?.kind !== 'form') return;
          if (sheet.acta) await updateActa(orgId, sheet.acta.id, input, uid);
          else await createActa(orgId, input, uid);
        }}
        onClose={() => setSheet(null)}
      />
    </VStack>
  );
}

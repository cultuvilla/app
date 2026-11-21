import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { socioNumberTaken } from '@cultuvilla/shared/models/organization';
import { addTypedSocio, watchOrgSocios, type Socio } from '@cultuvilla/shared/services/socioService';
import { Button } from '../../primitives';
import { AddPersonaSocio, usePersonaSocioPicker } from './MyPersonasSocios';
import { OptionsSheet } from './OptionsSheet';
import { TypedSocioSheet, type TypedSocioSaved } from './TypedSocioSheet';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';

/** iOS will not present a sheet while another is still being dismissed. */
const SHEET_SWAP_MS = 350;

/**
 * The Socios screen's one "Añadir socio" (decided 2026-11-21, user). The junta
 * picks whom: someone without the app, typed in, or one of their own personas a
 * cargo. A socio may add only the latter, so their button goes straight there.
 */
export function AddSocioButton({ orgId, uid, isAdmin }: { orgId: string; uid: string; isAdmin: boolean }) {
  return isAdmin ? <AdminAddSocio orgId={orgId} uid={uid} /> : <AddPersonaSocio orgId={orgId} uid={uid} />;
}

function AdminAddSocio({ orgId, uid }: { orgId: string; uid: string }) {
  const { t } = useT();
  const socios = useWatch<Socio[]>('groups:watchOrgSocios', orgId, (next, error) => watchOrgSocios(orgId, next, error));
  const persona = usePersonaSocioPicker(orgId, uid);
  const [sheet, setSheet] = useState<'menu' | 'typed' | null>(null);
  const swap = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (swap.current) clearTimeout(swap.current);
  }, []);

  const after = (step: () => void) => {
    setSheet(null);
    if (swap.current) clearTimeout(swap.current);
    swap.current = setTimeout(step, SHEET_SWAP_MS);
  };

  const saveTyped = async (values: TypedSocioSaved) => {
    await addTypedSocio(
      orgId,
      { displayName: values.displayName, socioNumber: values.socioNumber, phone: values.phone, email: values.email },
      uid,
    );
  };

  return (
    <View className="items-center">
      <Button variant="secondary" testID="socios-add" onPress={() => setSheet('menu')}>
        {t('groups.socios.add')}
      </Button>
      <OptionsSheet
        visible={sheet === 'menu'}
        testID="socios-add-sheet"
        title={t('groups.socios.addMenu.title')}
        options={[
          { key: 'typed', label: t('groups.socios.addMenu.typed'), description: t('groups.socios.addMenu.typedHint') },
          ...(persona.ready
            ? [{ key: 'persona', label: t('groups.socios.addMenu.persona'), description: t('groups.socios.addMenu.personaHint') }]
            : []),
        ]}
        onPick={(key) => after(key === 'typed' ? () => setSheet('typed') : persona.start)}
        onClose={() => setSheet(null)}
      />
      <TypedSocioSheet
        visible={sheet === 'typed'}
        initial={null}
        isNumberTaken={(socioNumber) => socioNumberTaken(socios.data ?? [], socioNumber, null)}
        onSave={saveTyped}
        onClose={() => setSheet(null)}
      />
      {persona.sheet}
    </View>
  );
}

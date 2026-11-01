import { useMemo, useState } from 'react';
import { isActiveSocio, ORG_ADMIN_TITLES, socioNumberTaken } from '@cultuvilla/shared/models/organization';
import {
  addTypedSocio,
  linkSocioToMember,
  setSocioAdminTitle,
  setSocioBaja,
  setSocioNumber,
  updateTypedSocio,
  watchOrgSocioPrivates,
  watchOrgSocios,
  type Socio,
  type SocioPrivate,
} from '@cultuvilla/shared/services/socioService';
import { formatDate } from '@cultuvilla/shared/utils';
import { Button, HStack, Pressable, Text, VStack } from '../../primitives';
import { OptionsSheet } from './OptionsSheet';
import { SocioNumberSheet } from './SocioNumberSheet';
import { TypedSocioSheet, type TypedSocioSaved } from './TypedSocioSheet';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { showAlert, showConfirm } from '../../../lib/dialogs';
import { linkCandidates, responsibleName, visibleSocios } from '../../../lib/orgs/socioRoster';

type Sheet =
  | { kind: 'typed'; socio: Socio | null }
  | { kind: 'link'; socio: Socio }
  | { kind: 'title'; socio: Socio }
  | { kind: 'number'; socio: Socio }
  | null;

/**
 * The group's socio roster. `canManage` (an org admin) sees every row with its
 * contact data and manages it: types in socios without the app, corrects them,
 * links one to a member who later joined, gives the baja, sets admin titles
 * and socio numbers.
 * Otherwise — a member, while the estatutos setting is on — names only.
 */
export function SociosRoster({
  orgId,
  canManage,
  adminUids,
  currentUid,
}: {
  orgId: string;
  canManage: boolean;
  adminUids: string[];
  currentUid: string;
}) {
  const { t } = useT();
  const socios = useWatch<Socio[]>('groups:watchOrgSocios', orgId, (next, error) => watchOrgSocios(orgId, next, error));
  const privates = useWatch<SocioPrivate[]>(
    'groups:watchOrgSocioPrivates',
    canManage ? orgId : null,
    canManage ? (next, error) => watchOrgSocioPrivates(orgId, next, error) : null,
  );
  const [showBajas, setShowBajas] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);

  const rows = useMemo(() => socios.data ?? [], [socios.data]);
  const shown = useMemo(() => visibleSocios(rows, canManage && showBajas), [rows, canManage, showBajas]);
  const contactById = useMemo(() => new Map((privates.data ?? []).map((p) => [p.id, p])), [privates.data]);
  const activeCount = rows.filter(isActiveSocio).length;
  const admins = useMemo(() => new Set(adminUids), [adminUids]);

  if (socios.status !== 'ready') return null;

  const fail = () => showAlert(t('groups.socios.error'));

  const kindLabel = (s: Socio): string => {
    if (s.kind === 'persona') return t('groups.socios.kindPersona', { name: responsibleName(s, rows) ?? '—' });
    if (s.kind === 'typed') return t('groups.socios.kindTyped');
    return t('groups.socios.kindMember');
  };

  const contactLine = (s: Socio): string | null => {
    if (s.kind === 'persona') return null;
    const c = contactById.get(s.id);
    const parts = [c?.phone, c?.email].filter((x): x is string => !!x);
    if (parts.length > 0) return parts.join(' · ');
    return s.kind === 'member' && !c?.consentAnsweredAt ? t('groups.socios.contactNotShared') : t('groups.socios.noContact');
  };

  const giveBaja = (s: Socio) =>
    showConfirm(
      t('groups.socios.confirmBajaTitle'),
      t('groups.socios.confirmBajaBody', { name: s.displayName }),
      () => {
        setSocioBaja(orgId, s).catch(fail);
      },
      { confirmText: t('groups.socios.giveBaja'), cancelText: t('common.cancel') },
    );

  const isNumberTaken = (exceptId: string | null) => (socioNumber: number) => socioNumberTaken(rows, socioNumber, exceptId);

  const saveTyped = async (values: TypedSocioSaved) => {
    const input = { displayName: values.displayName, socioNumber: values.socioNumber, phone: values.phone, email: values.email };
    if (sheet?.kind === 'typed' && sheet.socio) await updateTypedSocio(orgId, sheet.socio.id, input);
    else await addTypedSocio(orgId, input, currentUid);
  };

  return (
    <VStack gap={2} testID="socios-roster">
      {canManage ? (
        <HStack justify="end">
          <Button variant="secondary" testID="socios-add" onPress={() => setSheet({ kind: 'typed', socio: null })}>
            {t('groups.socios.add')}
          </Button>
        </HStack>
      ) : null}
      <Text tone="muted" variant="bodySm">
        {t('groups.socios.count', { count: activeCount })}
      </Text>

      {shown.map((s) => {
        const active = isActiveSocio(s);
        const name = s.displayName || t('groups.socios.unnamed');
        if (!canManage) {
          return (
            <Text key={s.id} className="py-1">
              {name}
            </Text>
          );
        }
        const contact = contactLine(s);
        const isAdminRow = s.kind === 'member' && s.uid !== null && admins.has(s.uid);
        return (
          <VStack key={s.id} gap={1} className="py-2 border-b border-subtle" testID={`socio-row-${s.id}`}>
            <HStack gap={2} align="center" justify="between">
              <Text className={active ? 'font-bold' : 'font-bold text-muted'}>{name}</Text>
              {isAdminRow && s.adminTitle ? (
                <Text variant="caption" tone="muted">
                  {t(`groups.titles.${s.adminTitle}`)}
                </Text>
              ) : null}
            </HStack>
            <Text variant="bodySm" tone="muted">
              {[
                s.socioNumber !== null ? t('groups.socios.numberShort', { number: String(s.socioNumber) }) : null,
                kindLabel(s),
                t('groups.socios.alta', { date: formatDate(s.altaAt) }),
                s.bajaAt ? t('groups.socios.baja', { date: formatDate(s.bajaAt) }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {contact ? (
              <Text variant="bodySm" selectable>
                {contact}
              </Text>
            ) : null}
            {active ? (
              <HStack gap={4} className="flex-wrap pt-1">
                {s.kind === 'typed' ? (
                  <>
                    <RowAction testID={`socio-edit-${s.id}`} label={t('common.edit')} onPress={() => setSheet({ kind: 'typed', socio: s })} />
                    <RowAction testID={`socio-link-${s.id}`} label={t('groups.socios.link')} onPress={() => setSheet({ kind: 'link', socio: s })} />
                  </>
                ) : null}
                {isAdminRow ? (
                  <RowAction
                    testID={`socio-title-${s.id}`}
                    label={t('groups.socios.setTitle')}
                    onPress={() => setSheet({ kind: 'title', socio: s })}
                  />
                ) : null}
                {s.kind !== 'typed' ? (
                  <RowAction
                    testID={`socio-number-${s.id}`}
                    label={t('groups.socios.setNumber')}
                    onPress={() => setSheet({ kind: 'number', socio: s })}
                  />
                ) : null}
                {s.kind !== 'member' ? (
                  <RowAction testID={`socio-baja-${s.id}`} label={t('groups.socios.giveBaja')} onPress={() => giveBaja(s)} />
                ) : null}
              </HStack>
            ) : null}
          </VStack>
        );
      })}

      {canManage && rows.some((r) => !isActiveSocio(r)) ? (
        <Pressable testID="socios-toggle-bajas" accessibilityRole="button" onPress={() => setShowBajas((v) => !v)}>
          <Text variant="bodySm" className="text-accent">
            {t(showBajas ? 'groups.socios.hideBajas' : 'groups.socios.showBajas')}
          </Text>
        </Pressable>
      ) : null}

      {canManage ? (
        <>
          <TypedSocioSheet
            visible={sheet?.kind === 'typed'}
            initial={
              sheet?.kind === 'typed' && sheet.socio
                ? {
                    displayName: sheet.socio.displayName,
                    socioNumber: sheet.socio.socioNumber === null ? '' : String(sheet.socio.socioNumber),
                    phone: contactById.get(sheet.socio.id)?.phone ?? '',
                    email: contactById.get(sheet.socio.id)?.email ?? '',
                  }
                : null
            }
            isNumberTaken={isNumberTaken(sheet?.kind === 'typed' ? (sheet.socio?.id ?? null) : null)}
            onSave={saveTyped}
            onClose={() => setSheet(null)}
          />
          <SocioNumberSheet
            visible={sheet?.kind === 'number'}
            name={sheet?.kind === 'number' ? sheet.socio.displayName || t('groups.socios.unnamed') : ''}
            initial={sheet?.kind === 'number' ? sheet.socio.socioNumber : null}
            isNumberTaken={isNumberTaken(sheet?.kind === 'number' ? sheet.socio.id : null)}
            onSave={async (socioNumber) => {
              if (sheet?.kind === 'number') await setSocioNumber(orgId, sheet.socio.id, socioNumber);
            }}
            onClose={() => setSheet(null)}
          />
          <OptionsSheet
            visible={sheet?.kind === 'link'}
            testID="socio-link-sheet"
            title={sheet?.kind === 'link' ? t('groups.socios.linkTitle', { name: sheet.socio.displayName }) : ''}
            hint={t('groups.socios.linkHint')}
            emptyLabel={t('groups.socios.linkEmpty')}
            options={linkCandidates(rows).map((m) => ({ key: m.uid ?? m.id, label: m.displayName || t('groups.socios.unnamed') }))}
            onPick={(memberUid) => {
              if (sheet?.kind !== 'link') return;
              const socioId = sheet.socio.id;
              setSheet(null);
              linkSocioToMember(orgId, socioId, memberUid).catch(fail);
            }}
            onClose={() => setSheet(null)}
          />
          <OptionsSheet
            visible={sheet?.kind === 'title'}
            testID="socio-title-sheet"
            title={t('groups.socios.titleLabel')}
            options={[
              ...ORG_ADMIN_TITLES.map((title) => ({
                key: title,
                label: t(`groups.titles.${title}`),
                selected: sheet?.kind === 'title' && sheet.socio.adminTitle === title,
              })),
              { key: 'none', label: t('groups.socios.noTitle'), selected: sheet?.kind === 'title' && sheet.socio.adminTitle === null },
            ]}
            onPick={(key) => {
              if (sheet?.kind !== 'title') return;
              const socioId = sheet.socio.id;
              setSheet(null);
              setSocioAdminTitle(orgId, socioId, ORG_ADMIN_TITLES.find((title) => title === key) ?? null).catch(fail);
            }}
            onClose={() => setSheet(null)}
          />
        </>
      ) : null}
    </VStack>
  );
}

function RowAction({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress}>
      <Text variant="bodySm" className="text-accent font-medium">
        {label}
      </Text>
    </Pressable>
  );
}

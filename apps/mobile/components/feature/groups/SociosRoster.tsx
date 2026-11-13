import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ORG_ADMIN_TITLES, socioNumberTaken, isActiveSocio } from '@cultuvilla/shared/models/organization';
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
import { removeOrgMember, setOrgMemberRole } from '@cultuvilla/shared/services/orgMemberService';
import { Avatar, Button, HStack, Input, Pressable, Text, VStack } from '../../primitives';
import { DetailSectionHeading } from '../DetailSectionHeading';
import { FilterPill } from '../FilterPill';
import { OptionsSheet } from './OptionsSheet';
import { SocioNumberSheet } from './SocioNumberSheet';
import { SocioPill } from './SocioPill';
import { CUOTA_PILL_TONE, SocioSheet, type SocioAction } from './SocioSheet';
import { TypedSocioSheet, type TypedSocioSaved } from './TypedSocioSheet';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { showAlert, showConfirm } from '../../../lib/dialogs';
import { useOrgCuotaStatuses } from '../../../lib/orgs/useOrgCuotaStatuses';
import {
  bookCounts,
  filterBook,
  initialsOf,
  linkCandidates,
  owesCuota,
  responsibleName,
  type BookFilter,
} from '../../../lib/orgs/socioRoster';

type Sheet =
  | { kind: 'socio'; socio: Socio }
  | { kind: 'typed'; socio: Socio | null }
  | { kind: 'link'; socio: Socio }
  | { kind: 'title'; socio: Socio }
  | { kind: 'number'; socio: Socio }
  | null;

/**
 * iOS will not present a modal (nor an alert) while another is still being
 * dismissed, so a step out of the socio's sheet waits for it to go.
 */
const SHEET_SWAP_MS = 350;

/**
 * The libro de socios. Everyone who may see it searches it by name or number.
 * The junta (`canManage`) also filters it — active, cuota pendiente, sin app,
 * bajas — sees each socio's cuota, and taps a row for that socio's sheet, which
 * holds their record, their contact and every action on them.
 * A member, while "Lista de socios visible" is on, sees names only.
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
  const [filter, setFilter] = useState<BookFilter>('activos');
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<Sheet>(null);
  const swap = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (swap.current) clearTimeout(swap.current);
  }, []);

  const rows = useMemo(() => socios.data ?? [], [socios.data]);
  const cuota = useOrgCuotaStatuses(orgId, rows, canManage);
  const counts = useMemo(() => bookCounts(rows, cuota.statuses), [rows, cuota.statuses]);
  const shown = useMemo(
    () => filterBook(rows, canManage ? filter : 'activos', query, cuota.statuses),
    [rows, canManage, filter, query, cuota.statuses],
  );
  const contactById = useMemo(() => new Map((privates.data ?? []).map((p) => [p.id, p])), [privates.data]);
  const admins = useMemo(() => new Set(adminUids), [adminUids]);

  if (socios.status !== 'ready') return null;

  const fail = () => showAlert(t('groups.socios.error'));
  const after = (step: () => void) => {
    setSheet(null);
    if (swap.current) clearTimeout(swap.current);
    swap.current = setTimeout(step, SHEET_SWAP_MS);
  };

  const nameOf = (s: Socio) => s.displayName || t('groups.socios.unnamed');
  const isAdminRow = (s: Socio) => s.kind === 'member' && s.uid !== null && admins.has(s.uid);
  // Your own row is never actionable, which avoids a self-lockout.
  const otherMemberUid = (s: Socio) => (s.kind === 'member' && s.uid !== currentUid ? s.uid : null);

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

  const changeRole = (uid: string, name: string, promoting: boolean) =>
    showConfirm(
      t(promoting ? 'organization.membersList.confirmPromoteTitle' : 'organization.membersList.confirmDemoteTitle'),
      t(promoting ? 'organization.membersList.confirmPromoteBody' : 'organization.membersList.confirmDemoteBody', { name }),
      () => {
        setOrgMemberRole(orgId, uid, promoting ? 'admin' : 'member').catch(() => showAlert(t('organization.membersList.roleChangeError')));
      },
      { confirmText: t(promoting ? 'organization.membersList.promote' : 'organization.membersList.demote'), cancelText: t('common.cancel') },
    );

  const removeMember = (uid: string, name: string) =>
    showConfirm(
      t('organization.membersList.confirmRemoveTitle'),
      t('organization.membersList.confirmRemoveBody', { name }),
      () => {
        removeOrgMember(orgId, uid).catch(() => showAlert(t('organization.membersList.removeError')));
      },
      { confirmText: t('organization.membersList.remove'), cancelText: t('common.cancel') },
    );

  const act = (s: Socio, action: SocioAction) => {
    const memberUid = otherMemberUid(s);
    switch (action) {
      case 'edit':
        return after(() => setSheet({ kind: 'typed', socio: s }));
      case 'link':
        return after(() => setSheet({ kind: 'link', socio: s }));
      case 'number':
        return after(() => setSheet({ kind: 'number', socio: s }));
      case 'title':
        return after(() => setSheet({ kind: 'title', socio: s }));
      case 'baja':
        return after(() => giveBaja(s));
      case 'role':
        return memberUid ? after(() => changeRole(memberUid, nameOf(s), !isAdminRow(s))) : undefined;
      case 'remove':
        return memberUid ? after(() => removeMember(memberUid, nameOf(s))) : undefined;
    }
  };

  const isNumberTaken = (exceptId: string | null) => (socioNumber: number) => socioNumberTaken(rows, socioNumber, exceptId);

  const saveTyped = async (values: TypedSocioSaved) => {
    const input = { displayName: values.displayName, socioNumber: values.socioNumber, phone: values.phone, email: values.email };
    if (sheet?.kind === 'typed' && sheet.socio) await updateTypedSocio(orgId, sheet.socio.id, input);
    else await addTypedSocio(orgId, input, currentUid);
  };

  const chips: { key: BookFilter; label: string }[] = canManage
    ? [
        { key: 'activos' as const, label: t('groups.socios.filters.activos', { count: counts.activos }) },
        ...(cuota.configured ? [{ key: 'pendiente' as const, label: t('groups.socios.filters.pendiente', { count: counts.pendiente }) }] : []),
        ...(counts.sinApp > 0 ? [{ key: 'sinApp' as const, label: t('groups.socios.filters.sinApp', { count: counts.sinApp }) }] : []),
        ...(counts.bajas > 0 ? [{ key: 'bajas' as const, label: t('groups.socios.filters.bajas') }] : []),
      ]
    : [];

  const pillFor = (s: Socio) => {
    if (!canManage) return null;
    if (!isActiveSocio(s)) return <SocioPill tone="plain" label={t('groups.socios.pills.baja')} />;
    const status = cuota.statuses.get(s.id);
    if (owesCuota(status) && status) {
      return <SocioPill tone={CUOTA_PILL_TONE[status.status]} label={t(`groups.socios.pills.${status.status}`)} testID={`socio-cuota-${s.id}`} />;
    }
    if (s.kind === 'typed') return <SocioPill tone="plain" label={t('groups.socios.pills.sinApp')} />;
    return null;
  };

  const open = sheet?.kind === 'socio' ? sheet.socio : null;

  return (
    <VStack gap={3} testID="socios-roster">
      <HStack gap={2} align="center" justify="between">
        <DetailSectionHeading>{t('groups.socios.book')}</DetailSectionHeading>
        {canManage ? (
          <Button variant="secondary" testID="socios-add" onPress={() => setSheet({ kind: 'typed', socio: null })}>
            {t('groups.socios.add')}
          </Button>
        ) : null}
      </HStack>

      <Input
        pill
        value={query}
        onChangeText={setQuery}
        placeholder={t('groups.socios.search')}
        autoCorrect={false}
        testID="socios-search"
      />

      {chips.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="socios-filters">
          {chips.map((c) => (
            <FilterPill
              key={c.key}
              label={c.label}
              active={filter === c.key}
              hideChevron
              onPress={() => setFilter(c.key)}
              testID={`socios-filter-${c.key}`}
            />
          ))}
        </ScrollView>
      ) : null}

      {shown.length === 0 ? (
        <Text tone="muted" className="py-4 text-center" testID="socios-empty">
          {t('groups.socios.empty')}
        </Text>
      ) : (
        <View className="bg-surface-elevated rounded-xl overflow-hidden">
          {shown.map((s) => {
            const name = nameOf(s);
            const title = isAdminRow(s) && s.adminTitle ? t(`groups.titles.${s.adminTitle}`) : null;
            const body = (
              <HStack gap={3} align="center" className="px-3 py-2 border-b border-subtle">
                <Text variant="bodySm" tone="muted" className="w-10 text-right">
                  {s.socioNumber !== null ? String(s.socioNumber) : ''}
                </Text>
                <Avatar size={32} initials={initialsOf(name)} />
                <VStack gap={0} className="flex-1">
                  <Text tone={isActiveSocio(s) ? 'primary' : 'muted'} numberOfLines={1}>
                    {name}
                  </Text>
                  {title ? (
                    <Text variant="caption" tone="muted">
                      {title}
                    </Text>
                  ) : null}
                </VStack>
                {pillFor(s)}
              </HStack>
            );
            if (!canManage) return <View key={s.id}>{body}</View>;
            return (
              <Pressable
                key={s.id}
                testID={`socio-row-${s.id}`}
                accessibilityRole="button"
                // A label replaces what its children read out, so it carries the number too.
                accessibilityLabel={s.socioNumber !== null ? `${s.socioNumber}, ${name}` : name}
                onPress={() => setSheet({ kind: 'socio', socio: s })}
              >
                {body}
              </Pressable>
            );
          })}
        </View>
      )}

      {canManage ? (
        <>
          <SocioSheet
            socio={open}
            kindLabel={open ? kindLabel(open) : ''}
            contact={open ? contactLine(open) : null}
            cuota={open ? cuota.statuses.get(open.id) : undefined}
            isAdminRow={open ? isAdminRow(open) : false}
            canManageMember={open ? otherMemberUid(open) !== null : false}
            onAction={(action) => {
              if (open) act(open, action);
            }}
            onClose={() => setSheet(null)}
          />
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
            name={sheet?.kind === 'number' ? nameOf(sheet.socio) : ''}
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
            emptyLabel={t('groups.socios.linkEmpty')}
            options={linkCandidates(rows).map((m) => ({ key: m.uid ?? m.id, label: nameOf(m) }))}
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

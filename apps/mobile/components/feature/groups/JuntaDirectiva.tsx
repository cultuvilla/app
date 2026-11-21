import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { isActiveSocio, ORG_ADMIN_TITLES, type OrgAdminTitle } from '@cultuvilla/shared/models/organization';
import { watchOrgSocios, type Socio } from '@cultuvilla/shared/services/socioService';
import { Avatar, Button, HStack, Pressable, Text, VStack } from '../../primitives';
import { DetailSectionHeading } from '../DetailSectionHeading';
import { OptionsSheet } from './OptionsSheet';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { useJuntaActions } from '../../../lib/orgs/useJuntaActions';
import { useMemberFaces } from '../../../lib/orgs/useOrgMembers';
import { initialsOf } from '../../../lib/orgs/socioRoster';

const TITLE_ORDER = new Map<OrgAdminTitle, number>(ORG_ADMIN_TITLES.map((title, i) => [title, i]));

/** iOS will not present a sheet (nor an alert) while another is still being dismissed. */
const SHEET_SWAP_MS = 350;

interface JuntaPerson {
  uid: string;
  socioId: string | null;
  title: OrgAdminTitle | null;
  name: string;
  photoURL: string | null;
}

type Sheet =
  | { kind: 'add' }
  | { kind: 'addTitle'; uid: string; socioId: string }
  | { kind: 'face'; person: JuntaPerson }
  | { kind: 'title'; person: JuntaPerson }
  | null;

/**
 * The group's junta — its admins — with their faces and their cargo. Anyone
 * in the group sees it. A cargo lives on the socio row, which a member reads
 * only while the list is visible (`canReadRoster`); otherwise each face reads
 * "Junta".
 *
 * An admin (`canManage`) also adds a socio with the app to the junta, with a
 * cargo, and taps a face to change its cargo or take it out of the junta.
 * Their own face offers only the cargo, as in the libro: nobody locks
 * themselves out.
 */
export function JuntaDirectiva({
  orgId,
  adminUids,
  canReadRoster,
  canManage = false,
  currentUid,
}: {
  orgId: string;
  adminUids: string[];
  canReadRoster: boolean;
  canManage?: boolean;
  currentUid?: string;
}) {
  const { t } = useT();
  const faces = useMemberFaces(adminUids);
  const socios = useWatch<Socio[]>(
    'groups:watchOrgSocios',
    canReadRoster ? orgId : null,
    canReadRoster ? (next, error) => watchOrgSocios(orgId, next, error) : null,
  );
  const { changeRole, setTitle, addToJunta } = useJuntaActions(orgId);
  const [sheet, setSheet] = useState<Sheet>(null);
  const swap = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (swap.current) clearTimeout(swap.current);
  }, []);

  const memberRows = useMemo(
    () => (socios.data ?? []).filter((s) => s.kind === 'member' && s.uid !== null && isActiveSocio(s)),
    [socios.data],
  );

  const people = useMemo(() => {
    const rowOf = new Map(memberRows.map((s) => [s.uid, s] as const));
    return adminUids
      .map(
        (uid): JuntaPerson => ({
          uid,
          socioId: rowOf.get(uid)?.id ?? null,
          title: rowOf.get(uid)?.adminTitle ?? null,
          name: faces[uid]?.name ?? '',
          photoURL: faces[uid]?.photoURL ?? null,
        }),
      )
      .sort((a, b) => {
        const ta = a.title ? (TITLE_ORDER.get(a.title) ?? 99) : 100;
        const tb = b.title ? (TITLE_ORDER.get(b.title) ?? 99) : 100;
        return ta - tb || a.name.localeCompare(b.name, 'es');
      });
  }, [adminUids, faces, memberRows]);

  const candidates = useMemo(() => {
    const admins = new Set(adminUids);
    return memberRows
      .filter((s) => s.uid !== null && !admins.has(s.uid))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
  }, [adminUids, memberRows]);

  if (people.length === 0) return null;

  const after = (step: () => void) => {
    setSheet(null);
    if (swap.current) clearTimeout(swap.current);
    swap.current = setTimeout(step, SHEET_SWAP_MS);
  };
  const titleOptions = (current: OrgAdminTitle | null | undefined) => [
    ...ORG_ADMIN_TITLES.map((title) => ({ key: title, label: t(`groups.titles.${title}`), selected: current === title })),
    { key: 'none', label: t('groups.socios.noTitle'), selected: current === null },
  ];
  const titleOf = (key: string) => ORG_ADMIN_TITLES.find((title) => title === key) ?? null;
  const nameOf = (p: JuntaPerson) => p.name || t('groups.socios.unnamed');

  const face = (p: JuntaPerson) => (
    <VStack gap={1} align="center">
      <Avatar size={48} uri={p.photoURL} initials={initialsOf(p.name)} />
      <Text variant="caption" numberOfLines={1} className="font-bold text-center">
        {p.name.split(/\s+/)[0] ?? ''}
      </Text>
      <Text variant="caption" tone="muted" numberOfLines={1} className="text-center">
        {p.title ? t(`groups.titles.${p.title}`) : t('groups.socios.juntaMember')}
      </Text>
    </VStack>
  );

  const facing = sheet?.kind === 'face' ? sheet.person : null;
  const faceOptions = facing
    ? [
        ...(facing.socioId ? [{ key: 'title', label: t('groups.socios.juntaEdit.title') }] : []),
        ...(facing.uid !== currentUid ? [{ key: 'remove', label: t('groups.socios.juntaEdit.remove') }] : []),
      ]
    : [];

  return (
    <VStack gap={2} testID="junta-directiva">
      <HStack gap={2} align="center" justify="between">
        <DetailSectionHeading>{t('groups.socios.junta')}</DetailSectionHeading>
        {canManage ? (
          <Button variant="secondary" testID="junta-add" onPress={() => setSheet({ kind: 'add' })}>
            {t('groups.socios.juntaEdit.add')}
          </Button>
        ) : null}
      </HStack>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {people.map((p) =>
          canManage && (p.socioId !== null || p.uid !== currentUid) ? (
            <Pressable
              key={p.uid}
              testID={`junta-${p.uid}`}
              accessibilityRole="button"
              accessibilityLabel={p.title ? `${nameOf(p)}, ${t(`groups.titles.${p.title}`)}` : nameOf(p)}
              onPress={() => setSheet({ kind: 'face', person: p })}
              className="w-20 mr-2"
            >
              {face(p)}
            </Pressable>
          ) : (
            <View key={p.uid} className="w-20 mr-2" testID={`junta-${p.uid}`}>
              {face(p)}
            </View>
          ),
        )}
      </ScrollView>

      {canManage ? (
        <>
          <OptionsSheet
            visible={sheet?.kind === 'add'}
            testID="junta-add-sheet"
            title={t('groups.socios.juntaEdit.pickTitle')}
            hint={t('groups.socios.juntaEdit.pickHint')}
            emptyLabel={t('groups.socios.juntaEdit.pickEmpty')}
            options={candidates.map((s) => ({ key: s.id, label: s.displayName || t('groups.socios.unnamed') }))}
            onPick={(socioId) => {
              const row = candidates.find((s) => s.id === socioId);
              if (row?.uid) {
                const uid = row.uid;
                after(() => setSheet({ kind: 'addTitle', uid, socioId }));
              }
            }}
            onClose={() => setSheet(null)}
          />
          <OptionsSheet
            visible={sheet?.kind === 'addTitle'}
            testID="junta-add-title-sheet"
            title={t('groups.socios.titleLabel')}
            options={titleOptions(undefined)}
            onPick={(key) => {
              if (sheet?.kind !== 'addTitle') return;
              const { uid, socioId } = sheet;
              setSheet(null);
              void addToJunta(uid, socioId, titleOf(key));
            }}
            onClose={() => setSheet(null)}
          />
          <OptionsSheet
            visible={facing !== null}
            testID="junta-face-sheet"
            title={facing ? nameOf(facing) : ''}
            options={faceOptions}
            onPick={(key) => {
              if (!facing) return;
              const person = facing;
              if (key === 'title') after(() => setSheet({ kind: 'title', person }));
              else after(() => changeRole(person.uid, nameOf(person), false));
            }}
            onClose={() => setSheet(null)}
          />
          <OptionsSheet
            visible={sheet?.kind === 'title'}
            testID="junta-title-sheet"
            title={t('groups.socios.titleLabel')}
            options={titleOptions(sheet?.kind === 'title' ? sheet.person.title : undefined)}
            onPick={(key) => {
              if (sheet?.kind !== 'title' || !sheet.person.socioId) return;
              const socioId = sheet.person.socioId;
              setSheet(null);
              setTitle(socioId, titleOf(key));
            }}
            onClose={() => setSheet(null)}
          />
        </>
      ) : null}
    </VStack>
  );
}

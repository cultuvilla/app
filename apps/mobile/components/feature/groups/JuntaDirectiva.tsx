import { useMemo } from 'react';
import { ScrollView } from 'react-native';
import { isActiveSocio, ORG_ADMIN_TITLES, type OrgAdminTitle } from '@cultuvilla/shared/models/organization';
import { watchOrgSocios, type Socio } from '@cultuvilla/shared/services/socioService';
import { Avatar, Text, VStack } from '../../primitives';
import { DetailSectionHeading } from '../DetailSectionHeading';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { useMemberFaces } from '../../../lib/orgs/useOrgMembers';
import { initialsOf } from '../../../lib/orgs/socioRoster';

const TITLE_ORDER = new Map<OrgAdminTitle, number>(ORG_ADMIN_TITLES.map((title, i) => [title, i]));

/**
 * The group's junta — its admins — with their faces and their cargo. Anyone
 * in the group sees it. A cargo lives on the socio row, which a member reads
 * only while the list is visible (`canReadRoster`); otherwise each face reads
 * "Junta".
 */
export function JuntaDirectiva({ orgId, adminUids, canReadRoster }: { orgId: string; adminUids: string[]; canReadRoster: boolean }) {
  const { t } = useT();
  const faces = useMemberFaces(adminUids);
  const socios = useWatch<Socio[]>(
    'groups:watchOrgSocios',
    canReadRoster ? orgId : null,
    canReadRoster ? (next, error) => watchOrgSocios(orgId, next, error) : null,
  );

  const people = useMemo(() => {
    const titleOf = new Map(
      (socios.data ?? [])
        .filter((s) => s.kind === 'member' && s.uid !== null && isActiveSocio(s))
        .map((s) => [s.uid, s.adminTitle] as const),
    );
    return adminUids
      .map((uid) => ({ uid, title: titleOf.get(uid) ?? null, name: faces[uid]?.name ?? '', photoURL: faces[uid]?.photoURL ?? null }))
      .sort((a, b) => {
        const ta = a.title ? (TITLE_ORDER.get(a.title) ?? 99) : 100;
        const tb = b.title ? (TITLE_ORDER.get(b.title) ?? 99) : 100;
        return ta - tb || a.name.localeCompare(b.name, 'es');
      });
  }, [adminUids, faces, socios.data]);

  if (people.length === 0) return null;

  return (
    <VStack gap={2} testID="junta-directiva">
      <DetailSectionHeading>{t('groups.socios.junta')}</DetailSectionHeading>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {people.map((p) => (
          <VStack key={p.uid} gap={1} align="center" className="w-20 mr-2" testID={`junta-${p.uid}`}>
            <Avatar size={48} uri={p.photoURL} initials={initialsOf(p.name)} />
            <Text variant="caption" numberOfLines={1} className="font-bold text-center">
              {p.name.split(/\s+/)[0] ?? ''}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1} className="text-center">
              {p.title ? t(`groups.titles.${p.title}`) : t('groups.socios.juntaMember')}
            </Text>
          </VStack>
        ))}
      </ScrollView>
    </VStack>
  );
}

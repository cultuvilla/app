import { useMemo } from 'react';
import { hasSocioRoster, type OrgMemberData } from '@cultuvilla/shared/models/organization';
import { watchOrgMembers } from '@cultuvilla/shared/services/orgMemberService';
import type { GroupSection } from '@cultuvilla/shared/utils';
import { Text, VStack } from '../../primitives';
import { OrgJoinRequests } from '../OrgJoinRequests';
import { OrgMembersList } from '../OrgMembersList';
import { CuotaAdmin } from './CuotaAdmin';
import { GroupAccounts } from './GroupAccounts';
import { GroupMessagesAdmin } from './GroupMessagesAdmin';
import { GroupNotices } from './GroupNotices';
import { GroupSettings } from './GroupSettings';
import { MyActas } from './MyActas';
import { MyCuota } from './MyCuota';
import { AddSocioButton } from './AddSocioButton';
import { JuntaDirectiva } from './JuntaDirectiva';
import { MySocioRecord } from './MySocioRecord';
import { ActasAdmin } from './ActasAdmin';
import { AsambleaChecklist } from './AsambleaChecklist';
import { LibroDoor } from './LibroDoor';
import { YearSummaryAdmin } from './YearSummaryAdmin';
import { SocioConsentCard } from './SocioConsentCard';
import { SociosRoster } from './SociosRoster';
import { TransparentAvisos } from './TransparentAvisos';
import { TransparentCuota } from './TransparentCuota';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import type { MyGroup } from '../../../lib/orgs/useMyGroups';

function Empty({ text }: { text: string }) {
  return (
    <Text tone="muted" className="py-6 text-center">
      {text}
    </Text>
  );
}

/** The admins' uids, which the roster and the cuota sign with. Read only where a screen needs them. */
function useAdminUids(orgId: string, enabled: boolean): string[] {
  const members = useWatch<(OrgMemberData & { id: string })[]>(
    'groups:watchOrgMembers',
    enabled ? orgId : null,
    enabled ? (next, error) => watchOrgMembers(orgId, next, error) : null,
  );
  return useMemo(() => (members.data ?? []).filter((m) => m.role === 'admin').map((m) => m.userId), [members.data]);
}

/** One screen of a group: the section's existing component, full height. */
export function GroupSectionBody({ group, section, uid }: { group: MyGroup; section: GroupSection; uid: string }) {
  const { t } = useT();
  const { org, role } = group;
  const isAdmin = role === 'admin';
  // Everyone sees the junta on Socios; only an admin's Cuota signs with it.
  const adminUids = useAdminUids(org.id, section === 'socios' || (isAdmin && section === 'cobros'));

  switch (section) {
    case 'avisos': {
      const empty = <Empty text={t('groups.sections.empty.avisos')} />;
      return org.transparency.avisos ? (
        <TransparentAvisos orgId={org.id} uid={uid} empty={empty} />
      ) : (
        <GroupNotices orgId={org.id} uid={uid} empty={empty} />
      );
    }
    case 'cuota': {
      const mine = <MyCuota orgId={org.id} uid={uid} empty={<Empty text={t('groups.sections.empty.cuota')} />} />;
      return org.transparency.cuota ? (
        <VStack gap={6}>
          {mine}
          <TransparentCuota orgId={org.id} />
        </VStack>
      ) : (
        mine
      );
    }
    // An admin keeps the books, a socio reads what the junta shares: same button, more inside.
    case 'cuentas':
      return isAdmin ? <YearSummaryAdmin orgId={org.id} orgName={org.name} uid={uid} /> : <GroupAccounts orgId={org.id} />;
    case 'actas':
      return isAdmin ? (
        <VStack gap={4}>
          <AsambleaChecklist orgId={org.id} orgName={org.name} />
          <ActasAdmin orgId={org.id} orgName={org.name} uid={uid} />
        </VStack>
      ) : (
        <MyActas orgId={org.id} orgName={org.name} empty={<Empty text={t('groups.sections.empty.actas')} />} />
      );
    case 'socios': {
      const canReadRoster = isAdmin || org.sociosListVisible;
      return (
        <VStack gap={4}>
          <MySocioRecord orgId={org.id} uid={uid} />
          <SocioConsentCard orgId={org.id} requirement={org} />
          {isAdmin ? <OrgJoinRequests orgId={org.id} banner /> : null}
          {isAdmin ? <LibroDoor orgId={org.id} /> : null}
          <AddSocioButton orgId={org.id} uid={uid} isAdmin={isAdmin} />
          <JuntaDirectiva orgId={org.id} adminUids={adminUids} canReadRoster={canReadRoster} canManage={isAdmin} currentUid={uid} />
          {canReadRoster ? (
            <SociosRoster orgId={org.id} canManage={isAdmin} adminUids={isAdmin ? adminUids : []} currentUid={uid} />
          ) : (
            <Text tone="muted" variant="bodySm" testID="socios-list-hidden">
              {t('groups.socios.listHidden')}
            </Text>
          )}
        </VStack>
      );
    }
    case 'cobros':
      return <CuotaAdmin orgId={org.id} orgName={org.name} uid={uid} adminUids={adminUids} />;
    case 'mensajes':
      return <GroupMessagesAdmin orgId={org.id} orgName={org.name} uid={uid} includePrivateEvents />;
    case 'miembros':
      return (
        <VStack gap={4}>
          <OrgJoinRequests orgId={org.id} />
          <OrgMembersList orgId={org.id} canManage currentUserId={uid} />
        </VStack>
      );
    case 'ajustes':
      return (
        <GroupSettings
          orgId={org.id}
          uid={uid}
          sociosListVisible={org.sociosListVisible}
          socioPhoneRequired={org.socioPhoneRequired}
          socioEmailRequired={org.socioEmailRequired}
          hasRoster={hasSocioRoster(org.type)}
          chatAdminsOnly={org.chatAdminsOnly}
          cosateca={org.cosateca}
          cuotaEnabled={org.cuotaEnabled}
          transparency={org.transparency}
          joinPolicy={org.joinPolicy}
          isAyuntamiento={org.type === 'ayuntamiento'}
        />
      );
    // Their own full-height screens, not this scrolling body: see [seccion].tsx.
    case 'charla':
    case 'cosateca':
    case 'eventos':
    case 'tareas':
      return null;
  }
}

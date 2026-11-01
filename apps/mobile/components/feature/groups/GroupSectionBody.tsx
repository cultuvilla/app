import { useMemo } from 'react';
import { hasSocioRoster, type OrgMemberData } from '@cultuvilla/shared/models/organization';
import { watchOrgMembers } from '@cultuvilla/shared/services/orgMemberService';
import type { GroupSection } from '@cultuvilla/shared/utils';
import { Text, VStack } from '../../primitives';
import { OrgEventsSection } from '../OrgEventsSection';
import { OrgJoinRequests } from '../OrgJoinRequests';
import { OrgMembersList } from '../OrgMembersList';
import { CuotaAdmin } from './CuotaAdmin';
import { GroupMessagesAdmin } from './GroupMessagesAdmin';
import { GroupNotices } from './GroupNotices';
import { GroupSettings } from './GroupSettings';
import { MyActas } from './MyActas';
import { MyCuota } from './MyCuota';
import { MyPersonasSocios } from './MyPersonasSocios';
import { MyTasks } from './MyTasks';
import { RecordsAdmin } from './RecordsAdmin';
import { SocioConsentCard } from './SocioConsentCard';
import { SociosRoster } from './SociosRoster';
import { GroupTasks } from './GroupTasks';
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
  const adminUids = useAdminUids(org.id, isAdmin && (section === 'socios' || section === 'cobros'));

  switch (section) {
    case 'avisos':
      return <GroupNotices orgId={org.id} uid={uid} empty={<Empty text={t('groups.sections.empty.avisos')} />} />;
    case 'eventos':
      return <OrgEventsSection orgId={org.id} includePrivate />;
    case 'tareas':
      return (
        <VStack gap={4}>
          <MyTasks orgId={org.id} uid={uid} isAdmin={isAdmin} shiftsOnly />
          <GroupTasks
            orgId={org.id}
            uid={uid}
            isAdmin={isAdmin}
            includePrivateEvents
            suggestAsamblea={hasSocioRoster(org.type)}
          />
        </VStack>
      );
    case 'cuota':
      return <MyCuota orgId={org.id} uid={uid} empty={<Empty text={t('groups.sections.empty.cuota')} />} />;
    case 'actas':
      return <MyActas orgId={org.id} orgName={org.name} empty={<Empty text={t('groups.sections.empty.actas')} />} />;
    case 'mis-datos':
      return (
        <VStack gap={4}>
          <SocioConsentCard orgId={org.id} />
          <MyPersonasSocios orgId={org.id} uid={uid} />
        </VStack>
      );
    case 'socios':
      return <SociosRoster orgId={org.id} canManage={isAdmin} adminUids={isAdmin ? adminUids : []} currentUid={uid} />;
    case 'cobros':
      return <CuotaAdmin orgId={org.id} orgName={org.name} uid={uid} adminUids={adminUids} />;
    case 'mensajes':
      return <GroupMessagesAdmin orgId={org.id} orgName={org.name} uid={uid} includePrivateEvents />;
    case 'registros':
      return <RecordsAdmin orgId={org.id} orgName={org.name} uid={uid} />;
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
          sociosListVisible={org.sociosListVisible}
          hasRoster={hasSocioRoster(org.type)}
          chatAdminsOnly={org.chatAdminsOnly}
        />
      );
    // Its own full-height screen, not this scrolling body: see [seccion].tsx.
    case 'charla':
      return null;
  }
}

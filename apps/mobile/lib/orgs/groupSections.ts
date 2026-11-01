import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import { hasSocioRoster } from '@cultuvilla/shared/models/organization';
import type { GroupSection } from '@cultuvilla/shared/utils';
import type { MyGroup } from './useMyGroups';

type IconName = ComponentProps<typeof Ionicons>['name'];

export const GROUP_SECTION_ICONS: Record<GroupSection, IconName> = {
  avisos: 'megaphone-outline',
  charla: 'chatbubbles-outline',
  eventos: 'calendar-outline',
  tareas: 'checkbox-outline',
  cuota: 'wallet-outline',
  actas: 'document-text-outline',
  'mis-datos': 'person-circle-outline',
  socios: 'people-outline',
  cobros: 'cash-outline',
  mensajes: 'mail-outline',
  registros: 'library-outline',
  miembros: 'person-add-outline',
  ajustes: 'settings-outline',
};

export interface GroupSectionLists {
  member: GroupSection[];
  admin: GroupSection[];
}

/**
 * Which screens a group offers its viewer, in display order. Cuota, socios,
 * avisos and records exist only for orgs with a socio roster (not the
 * ayuntamiento); the Charla, tasks, members and settings are for every org, and
 * every member manages the tasks, so they have no Gestionar button. An admin reads the actas
 * and the socio list under Gestionar, so the member list leaves them out.
 */
export function groupSections({ org, role }: MyGroup): GroupSectionLists {
  const roster = hasSocioRoster(org.type);
  const isAdmin = role === 'admin';
  const member: GroupSection[] = [
    ...(roster ? (['avisos'] as const) : []),
    'charla',
    'eventos',
    'tareas',
    ...(roster ? (['cuota'] as const) : []),
    ...(roster && !isAdmin ? (['actas'] as const) : []),
    ...(roster && !isAdmin && org.sociosListVisible ? (['socios'] as const) : []),
    ...(roster ? (['mis-datos'] as const) : []),
  ];
  const admin: GroupSection[] = isAdmin
    ? [
        ...(roster ? (['cobros', 'mensajes', 'socios'] as const) : []),
        ...(roster ? (['registros'] as const) : []),
        'miembros',
        'ajustes',
      ]
    : [];
  return { member, admin };
}

export function canOpenGroupSection(group: MyGroup, section: GroupSection): boolean {
  const { member, admin } = groupSections(group);
  return member.includes(section) || admin.includes(section);
}

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
  cosateca: 'cube-outline',
  cuota: 'wallet-outline',
  actas: 'document-text-outline',
  cuentas: 'stats-chart-outline',
  socios: 'people-outline',
  cobros: 'cash-outline',
  mensajes: 'megaphone-outline',
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
 * ayuntamiento); the Charla, tasks and members are for every org, the settings
 * are the group's rules and so an admin's (a member's notifications live in
 * Ajustes → Notificaciones), and
 * every member manages the tasks, so they have no Gestionar button. An admin reads the actas
 * under Gestionar, so the member list leaves them out. Socios is everyone's: it
 * is where a member makes their personas a cargo socios, whether or not the
 * estatutos let them read the list. The cosateca is every integrante's, once an
 * admin switches it on; so are the accounts, once the junta makes them public
 * ("Cuentas públicas") — an admin reads them under Registros instead.
 */
export function groupSections({ org, role }: MyGroup): GroupSectionLists {
  const roster = hasSocioRoster(org.type);
  const isAdmin = role === 'admin';
  const member: GroupSection[] = [
    ...(roster ? (['avisos'] as const) : []),
    'charla',
    'eventos',
    'tareas',
    ...(org.cosateca.enabled ? (['cosateca'] as const) : []),
    ...(roster ? (['cuota'] as const) : []),
    ...(roster && !isAdmin ? (['actas'] as const) : []),
    ...(roster && !isAdmin && org.transparency.cuentas ? (['cuentas'] as const) : []),
    ...(roster ? (['socios'] as const) : []),
  ];
  const admin: GroupSection[] = isAdmin
    ? [
        ...(roster ? (['cobros', 'mensajes'] as const) : []),
        ...(roster ? (['registros'] as const) : []),
        // Where there are socios, every integrante is one: the Socios screen manages both.
        ...(roster ? [] : (['miembros'] as const)),
        'ajustes',
      ]
    : [];
  return { member, admin };
}

/**
 * Opened from its row's "Ver todos" on the group's home, so it needs no button there.
 * Eventos and tareas have rows too, but also a button: Álvaro wanted every
 * section in the button grid (2026-11-20).
 */
const SECTIONS_WITH_A_ROW: readonly GroupSection[] = ['avisos'];

export function homeButtons(sections: GroupSection[]): GroupSection[] {
  return sections.filter((s) => !SECTIONS_WITH_A_ROW.includes(s));
}

export function canOpenGroupSection(group: MyGroup, section: GroupSection): boolean {
  const { member, admin } = groupSections(group);
  return member.includes(section) || admin.includes(section);
}

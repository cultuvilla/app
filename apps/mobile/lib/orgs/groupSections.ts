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
  miembros: 'person-add-outline',
  ajustes: 'settings-outline',
};

export interface GroupSectionLists {
  member: GroupSection[];
  admin: GroupSection[];
}

/**
 * Which screens a group offers its viewer, in display order. Cuota, socios,
 * avisos, actas and cuentas exist only for orgs with a socio roster (not the
 * ayuntamiento), and the cuota only while the group runs one (`cuotaEnabled`);
 * tasks and members are for every org, and the Charla while it is on (`chatEnabled`). Every viewer gets the same
 * buttons under the same names, and an admin gets more inside them (decided
 * 2026-11-20, user): Actas and Cuentas open the editable books for an admin
 * and the shared ones for a socio, who sees Cuentas only once the junta makes
 * them public. An admin's own buttons say what they do — collect the cuota,
 * send avisos — and the settings are the group's rules, so an admin's (a
 * member's notifications live in Ajustes → Notificaciones). Socios is
 * everyone's: it is where a member makes their personas a cargo socios, and
 * an admin reaches the libro de socios from it. The cosateca is every
 * integrante's, once an admin switches it on.
 */
export function groupSections({ org, role }: MyGroup): GroupSectionLists {
  const roster = hasSocioRoster(org.type);
  const cuota = roster && org.cuotaEnabled;
  const isAdmin = role === 'admin';
  const member: GroupSection[] = [
    ...(roster ? (['avisos'] as const) : []),
    ...(org.chatEnabled ? (['charla'] as const) : []),
    'eventos',
    'tareas',
    ...(org.cosateca.enabled ? (['cosateca'] as const) : []),
    ...(cuota ? (['cuota'] as const) : []),
    ...(roster && org.actasEnabled ? (['actas'] as const) : []),
    ...(roster && org.cuentasEnabled && (isAdmin || org.transparency.cuentas) ? (['cuentas'] as const) : []),
    ...(roster ? (['socios'] as const) : []),
  ];
  const admin: GroupSection[] = isAdmin
    ? [
        ...(cuota ? (['cobros'] as const) : []),
        ...(roster ? (['mensajes'] as const) : []),
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

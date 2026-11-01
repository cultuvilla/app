import { buildOrganizationData } from '@cultuvilla/shared/models/organization/OrganizationDataModel';
import { canOpenGroupSection, groupSections, homeButtons, GROUP_SECTION_ICONS } from '../groupSections';
import type { MyGroup } from '../useMyGroups';

function group(overrides: Partial<Parameters<typeof buildOrganizationData>[0]> = {}, role: 'admin' | 'member' = 'member'): MyGroup {
  return {
    org: {
      id: 'o1',
      ...buildOrganizationData({ name: 'Anduela', type: 'asociación', municipalityId: 'm', villageSlug: 'v', requestedBy: 'x', status: 'approved', ...overrides }),
    },
    role,
  };
}

describe('groupSections', () => {
  it('gives a socio of an asociación their own screens and no Gestionar', () => {
    expect(groupSections(group())).toEqual({
      member: ['avisos', 'charla', 'eventos', 'tareas', 'cuota', 'actas', 'socios', 'ajustes'],
      admin: [],
    });
  });

  it('gives every member Socios, whether or not the estatutos show the list', () => {
    expect(groupSections(group({ sociosListVisible: false })).member).toContain('socios');
    expect(groupSections(group({ sociosListVisible: true })).member).toContain('socios');
  });

  it('moves actas under Gestionar for an admin, and keeps Socios with the rest', () => {
    const { member, admin } = groupSections(group({}, 'admin'));
    expect(member).toEqual(['avisos', 'charla', 'eventos', 'tareas', 'cuota', 'socios', 'ajustes']);
    expect(admin).toEqual(['cobros', 'mensajes', 'registros']);
  });

  it('an ayuntamiento keeps its chat, events, tasks, members and settings', () => {
    expect(groupSections(group({ type: 'ayuntamiento' }, 'admin'))).toEqual({
      member: ['charla', 'eventos', 'tareas', 'ajustes'],
      admin: ['miembros'],
    });
  });

  it('leaves the home without buttons for what its rows open, though they still open', () => {
    const { member } = groupSections(group());
    expect(homeButtons(member)).toEqual(['charla', 'cuota', 'actas', 'socios', 'ajustes']);
    expect(canOpenGroupSection(group(), 'tareas')).toBe(true);
  });

  it('shows Avisos with the megaphone, on the row and on the admin button', () => {
    expect(GROUP_SECTION_ICONS.avisos).toBe('megaphone-outline');
    expect(GROUP_SECTION_ICONS.mensajes).toBe('megaphone-outline');
  });

  it('refuses a member a Gestionar screen', () => {
    expect(canOpenGroupSection(group(), 'cobros')).toBe(false);
    expect(canOpenGroupSection(group({}, 'admin'), 'cobros')).toBe(true);
    expect(canOpenGroupSection(group(), 'registros')).toBe(false);
  });
});

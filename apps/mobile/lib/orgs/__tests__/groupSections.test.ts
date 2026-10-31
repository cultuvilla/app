import { buildOrganizationData } from '@cultuvilla/shared/models/organization/OrganizationDataModel';
import { canOpenGroupSection, groupSections } from '../groupSections';
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
      member: ['avisos', 'eventos', 'tareas', 'cuota', 'actas', 'mis-datos'],
      admin: [],
    });
  });

  it('lists the socios for members only when the estatutos allow it', () => {
    expect(groupSections(group({ sociosListVisible: true })).member).toContain('socios');
  });

  it('moves actas and socios under Gestionar for an admin', () => {
    const { member, admin } = groupSections(group({}, 'admin'));
    expect(member).toEqual(['avisos', 'eventos', 'tareas', 'cuota', 'mis-datos']);
    expect(admin).toEqual(['cobros', 'mensajes', 'socios', 'gestion-tareas', 'registros', 'miembros', 'ajustes']);
  });

  it('an ayuntamiento keeps only events, tasks and members', () => {
    expect(groupSections(group({ type: 'ayuntamiento' }, 'admin'))).toEqual({
      member: ['eventos', 'tareas'],
      admin: ['gestion-tareas', 'miembros'],
    });
  });

  it('refuses a member a Gestionar screen', () => {
    expect(canOpenGroupSection(group(), 'cobros')).toBe(false);
    expect(canOpenGroupSection(group({}, 'admin'), 'cobros')).toBe(true);
    expect(canOpenGroupSection(group(), 'socios')).toBe(false);
  });
});

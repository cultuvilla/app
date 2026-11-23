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
      member: ['avisos', 'charla', 'eventos', 'tareas', 'cuota', 'actas', 'socios'],
      admin: [],
    });
  });

  it('gives every member Socios, whether or not the estatutos show the list', () => {
    expect(groupSections(group({ sociosListVisible: false })).member).toContain('socios');
    expect(groupSections(group({ sociosListVisible: true })).member).toContain('socios');
  });

  it('gives an admin the same buttons as a socio, Cuentas included, and their own after', () => {
    const { member, admin } = groupSections(group({}, 'admin'));
    expect(member).toEqual(['avisos', 'charla', 'eventos', 'tareas', 'cuota', 'actas', 'cuentas', 'socios']);
    expect(admin).toEqual(['cobros', 'mensajes', 'ajustes']);
  });

  it('drops every cuota button while the group runs no cuota', () => {
    const { member, admin } = groupSections(group({ cuotaEnabled: false }, 'admin'));
    expect(member).not.toContain('cuota');
    expect(admin).not.toContain('cobros');
    expect(canOpenGroupSection(group({ cuotaEnabled: false }), 'cuota')).toBe(false);
  });

  it('drops the actas and the cuentas a group switched off', () => {
    expect(groupSections(group({ actasEnabled: false }, 'admin')).member).not.toContain('actas');
    expect(groupSections(group({ cuentasEnabled: false }, 'admin')).member).not.toContain('cuentas');
    expect(canOpenGroupSection(group({ actasEnabled: false }), 'actas')).toBe(false);
    expect(canOpenGroupSection(group({ cuentasEnabled: false }, 'admin'), 'cuentas')).toBe(false);
  });

  it('drops the Charla a group switched off', () => {
    expect(groupSections(group({ chatEnabled: false }, 'admin')).member).not.toContain('charla');
    expect(canOpenGroupSection(group({ chatEnabled: false }), 'charla')).toBe(false);
  });

  it('an ayuntamiento keeps its chat, events, tasks, members and settings', () => {
    expect(groupSections(group({ type: 'ayuntamiento' }, 'admin'))).toEqual({
      member: ['charla', 'eventos', 'tareas'],
      admin: ['miembros', 'ajustes'],
    });
  });

  it('leaves the home without a button for the avisos its row opens, though they still open', () => {
    const { member } = groupSections(group());
    expect(homeButtons(member)).toEqual(['charla', 'eventos', 'tareas', 'cuota', 'actas', 'socios']);
    expect(canOpenGroupSection(group(), 'avisos')).toBe(true);
  });

  it('gives a socio Cuentas only while the junta makes the accounts public', () => {
    const open = { cuota: false, avisos: false, cuentas: true };
    expect(groupSections(group({ transparency: open })).member).toEqual([
      'avisos', 'charla', 'eventos', 'tareas', 'cuota', 'actas', 'cuentas', 'socios',
    ]);
    expect(groupSections(group({ transparency: { ...open, cuentas: false } })).member).not.toContain('cuentas');
    expect(canOpenGroupSection(group({ transparency: open }), 'cuentas')).toBe(true);
    expect(canOpenGroupSection(group(), 'cuentas')).toBe(false);
    expect(groupSections(group({ type: 'ayuntamiento', transparency: open })).member).not.toContain('cuentas');
  });

  it('shows Avisos with the megaphone, on the row and on the admin button', () => {
    expect(GROUP_SECTION_ICONS.avisos).toBe('megaphone-outline');
    expect(GROUP_SECTION_ICONS.mensajes).toBe('megaphone-outline');
  });

  it('keeps the group settings to its admins', () => {
    expect(canOpenGroupSection(group(), 'ajustes')).toBe(false);
    expect(canOpenGroupSection(group({}, 'admin'), 'ajustes')).toBe(true);
  });

  it('refuses a member a Gestionar screen', () => {
    expect(canOpenGroupSection(group(), 'cobros')).toBe(false);
    expect(canOpenGroupSection(group({}, 'admin'), 'cobros')).toBe(true);
  });

  it('opens the cosateca to every integrante only once an admin switches it on', () => {
    expect(canOpenGroupSection(group(), 'cosateca')).toBe(false);
    const on = group({ type: 'ayuntamiento', cosateca: { enabled: true, audience: 'pueblo' } });
    expect(groupSections(on).member).toEqual(['charla', 'eventos', 'tareas', 'cosateca']);
    expect(homeButtons(groupSections(on).member)).toContain('cosateca');
    expect(GROUP_SECTION_ICONS.cosateca).toBe('cube-outline');
  });
});

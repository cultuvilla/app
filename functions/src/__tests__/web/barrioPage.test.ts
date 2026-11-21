import { describe, it, expect } from 'vitest';
import type { BarrioView, OrgView, Village } from '../../web/data';
import { orgCard } from '../../web/data';
import { render } from '../../web/html';
import { barrioPage, orgPage } from '../../web/pages';

const village: Village = {
  id: 'v1',
  name: 'Matabuena',
  slug: 'matabuena',
  province: 'Segovia',
  escudoUrl: null,
  active: true,
  description: null,
  lat: null,
  lng: null,
  locationLabel: null,
};

const barrio = (residentCount: number | null): BarrioView => ({
  id: 'b1',
  name: 'El Arrabal',
  kind: null,
  images: [],
  residentCount,
});

// QA 2026-11-20: a one-resident barrio read «1 vecinos».
describe('resident count agrees in number', () => {
  it('barrioPage', () => {
    expect(render(barrioPage(village, barrio(1), '/x').body)).toContain('· 1 vecino<');
    expect(render(barrioPage(village, barrio(4), '/x').body)).toContain('· 4 vecinos<');
  });
});

const org = (memberCount: number): OrgView => ({
  id: 'o1',
  name: 'Peña El Botijo',
  description: null,
  images: [],
  type: 'peña',
  memberCount,
  municipalityId: 'v1',
});

// «1 integrantes» on the group card and page; the count now comes from the app's catalog.
describe('member count agrees in number', () => {
  it('orgCard', () => {
    expect(orgCard(org(1), 'matabuena').subtitle).toBe('1 integrante');
    expect(orgCard(org(5), 'matabuena').subtitle).toBe('5 integrantes');
  });

  it('orgPage', () => {
    expect(render(orgPage(village, org(1), '/x', false, []).body)).toContain('1 integrante<');
    expect(render(orgPage(village, org(5), '/x', false, []).body)).toContain('5 integrantes<');
  });
});

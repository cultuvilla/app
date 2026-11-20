import { describe, it, expect } from 'vitest';
import type { BarrioView, Village } from '../../web/data';
import { residentsLabel } from '../../web/data';
import { render } from '../../web/html';
import { barrioPage } from '../../web/pages';

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
  it('residentsLabel', () => {
    expect(residentsLabel(1)).toBe('1 vecino');
    expect(residentsLabel(3)).toBe('3 vecinos');
  });

  it('barrioPage', () => {
    expect(render(barrioPage(village, barrio(1), '/x').body)).toContain('· 1 vecino<');
    expect(render(barrioPage(village, barrio(4), '/x').body)).toContain('· 4 vecinos<');
  });
});

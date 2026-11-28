import { describe, it, expect } from 'vitest';
import type { Village, WrappedView } from '../../web/data';
import { render } from '../../web/html';
import { wrappedPage } from '../../web/pages';

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

const wrapped = (eventCount: number, personCount: number): WrappedView => ({
  year: 2026,
  images: [],
  cards: [],
  eventCount,
  personCount,
});

describe('wrappedPage figures agree in number', () => {
  it('one event, one person', () => {
    const page = wrappedPage(village, wrapped(1, 1), '/app');
    expect(page.head.description).toContain('1 evento, 1 persona apuntada.');
    expect(render(page.body)).toContain('1 evento · 1 persona apuntada');
  });

  it('several events and people', () => {
    const page = wrappedPage(village, wrapped(4, 30), '/app');
    expect(page.head.description).toContain('4 eventos, 30 personas apuntadas.');
  });
});

import { describe, it, expect } from 'vitest';
import { matchRoute } from '../../web/routes';

describe('matchRoute', () => {
  it.each([
    ['/', { type: 'home' }],
    ['/descarga', { type: 'download' }],
    ['/pueblos', { type: 'villages' }],
    ['/pueblos/', { type: 'villages' }],
    ['/pueblos/x', { type: 'notFound' }],
    ['/embajadores', { type: 'ambassadors' }],
    ['/embajadores/', { type: 'ambassadors' }],
    ['/embajadores/x', { type: 'notFound' }],
    ['/legal/privacidad', { type: 'legal', page: 'privacidad' }],
    ['/legal/terminos', { type: 'legal', page: 'terminos' }],
    ['/legal/eliminar-cuenta', { type: 'legal', page: 'eliminar-cuenta' }],
    ['/matabuena', { type: 'village', villageSlug: 'matabuena' }],
    ['/matabuena/', { type: 'village', villageSlug: 'matabuena' }],
    ['/matabuena/carteles', { type: 'section', villageSlug: 'matabuena', section: 'carteles' }],
    ['/matabuena/vocabulario', { type: 'section', villageSlug: 'matabuena', section: 'vocabulario' }],
    [
      '/matabuena/evento/fiestas_e1',
      { type: 'entity', kind: 'event', villageSlug: 'matabuena', ref: 'fiestas_e1', id: 'e1' },
    ],
    [
      '/matabuena/acontecimiento/la-riada_h1',
      { type: 'entity', kind: 'historyEntry', villageSlug: 'matabuena', ref: 'la-riada_h1', id: 'h1' },
    ],
    [
      '/matabuena/entidad/pena_o1/unirse',
      { type: 'invite', villageSlug: 'matabuena', ref: 'pena_o1', id: 'o1' },
    ],
    ['/matabuena/palabra/zagal', { type: 'word', villageSlug: 'matabuena', termSlug: 'zagal' }],
    ['/matabuena/fiestas/2026', { type: 'wrapped', villageSlug: 'matabuena', year: 2026 }],
  ])('%s', (path, expected) => {
    expect(matchRoute(path)).toEqual(expected);
  });

  it.each([
    '/ajustes',
    '/crear/evento',
    '/mis-inscripciones',
    '/buzon',
    '/usuario/u1',
    '/persona/p1',
    '/matabuena/censo',
    '/matabuena/miembros',
    '/matabuena/editar',
    '/matabuena/lugar/ermita_p1/editar',
    '/matabuena/palabra/nueva',
    '/matabuena/palabra/zagal/definir',
    '/matabuena/acontecimiento/nuevo',
    '/matabuena/evento/fiestas_e1/plaza/tok',
  ])('%s is app-only', (path) => {
    expect(matchRoute(path)).toEqual({ type: 'appOnly' });
  });

  it.each(['/matabuena/fiestas', '/matabuena/fiestas/agosto', '/matabuena/fiestas/2026/x', '/matabuena/nada', '/matabuena/evento', '/matabuena/evento/x_e1/otra', '/legal/otra', '/%E0%A4%A'])(
    '%s is not found',
    (path) => {
      expect(matchRoute(path)).toEqual({ type: 'notFound' });
    },
  );
});

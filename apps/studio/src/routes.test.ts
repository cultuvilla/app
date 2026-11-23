import { describe, expect, it } from 'vitest';
import { parseStudioPath, studioPath, type StudioRoute } from './routes';

describe('studio routes', () => {
  it('round-trips every route', () => {
    const routes: StudioRoute[] = [
      { name: 'articles' },
      { name: 'newArticle' },
      { name: 'article', id: 'abc123' },
      { name: 'pairing', pairingId: 'p-1_x' },
    ];
    for (const route of routes) expect(parseStudioPath(studioPath(route))).toEqual(route);
  });

  it('opens the article list at the root, with or without a trailing slash', () => {
    expect(parseStudioPath('/estudio')).toEqual({ name: 'articles' });
    expect(parseStudioPath('/estudio/')).toEqual({ name: 'articles' });
    expect(parseStudioPath('/estudio/articulos')).toEqual({ name: 'articles' });
  });

  it('answers the QR code with the app pairing path', () => {
    expect(studioPath({ name: 'pairing', pairingId: 'p1' })).toBe('/estudio/vincular/p1');
  });

  it('knows nothing outside the studio', () => {
    expect(parseStudioPath('/matabuena')).toBeNull();
    expect(parseStudioPath('/estudio/ajustes')).toBeNull();
    expect(parseStudioPath('/estudio/articulos/a1/editar')).toBeNull();
  });
});

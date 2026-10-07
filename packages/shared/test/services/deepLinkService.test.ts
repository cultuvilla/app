import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { deepLinkHost: 'example.test.app' } } },
}));

import {
  getBarrioViewLink,
  getEntityLink,
  getEventLink,
  getNewsLink,
  getOrgInviteLink,
  getOrgViewLink,
  getPlaceViewLink,
  getSeatClaimLink,
  getUserViewLink,
  getVillageViewLink,
  getWrappedLink,
  parseLink,
  buildShareMessage,
} from '../../src/services/deepLinkService';

const HOST = 'https://example.test.app';
const target = (id: string, title: string) => ({ id, title, villageSlug: 'matabuena' });

describe('deepLinkService builders', () => {
  it('builds village-first Spanish URLs on the configured host', () => {
    expect(getVillageViewLink('matabuena')).toEqual({
      url: `${HOST}/matabuena`,
      path: '/matabuena',
      kind: 'content',
      resource: 'village',
    });
    expect(getEventLink(target('evt_1', 'Fiestas de San Roque'))).toEqual({
      url: `${HOST}/matabuena/evento/fiestas-de-san-roque_evt_1`,
      path: '/matabuena/evento/fiestas-de-san-roque_evt_1',
      kind: 'content',
      resource: 'event',
    });
    expect(getNewsLink(target('n1', 'Bando')).url).toBe(`${HOST}/matabuena/noticia/bando_n1`);
    expect(getOrgViewLink(target('o1', 'Peña El Roble')).url).toBe(
      `${HOST}/matabuena/entidad/pena-el-roble_o1`,
    );
    expect(getPlaceViewLink(target('p1', 'Ermita')).url).toBe(`${HOST}/matabuena/lugar/ermita_p1`);
    expect(getBarrioViewLink(target('b1', 'El Arrabal')).url).toBe(
      `${HOST}/matabuena/barrio/el-arrabal_b1`,
    );
    expect(getEntityLink('festivalPoster', target('c1', 'Fiestas 1987')).url).toBe(
      `${HOST}/matabuena/cartel/fiestas-1987_c1`,
    );
    expect(getEntityLink('historyEntry', target('h1', 'La riada de 1912')).url).toBe(
      `${HOST}/matabuena/acontecimiento/la-riada-de-1912_h1`,
    );
    expect(getUserViewLink('uid_1').url).toBe(`${HOST}/usuario/uid_1`);
  });

  it('marks the invite forms', () => {
    expect(getOrgInviteLink(target('o1', 'Peña'))).toMatchObject({
      url: `${HOST}/matabuena/entidad/pena_o1/unirse`,
      kind: 'invite',
      resource: 'organization',
    });
    expect(getSeatClaimLink(target('e1', 'Cena'), 'tok')).toMatchObject({
      url: `${HOST}/matabuena/evento/cena_e1/plaza/tok`,
      kind: 'invite',
      resource: 'event',
    });
  });

  // The share sheet and the seat-claim link are the two ways an event URL
  // leaves the app; neither may spell out a private event's title.
  it('never puts a private event title in a link', () => {
    const secret = { id: 'e9', title: 'Cena secreta', villageSlug: 'matabuena', visibilityOrgId: 'org1' };
    expect(getEventLink(secret).url).toBe(`${HOST}/matabuena/evento/evento-privado_e9`);
    expect(getSeatClaimLink(secret, 'tok').url).toBe(`${HOST}/matabuena/evento/evento-privado_e9/plaza/tok`);
  });

  it('rejects missing ids', () => {
    expect(() => getEventLink(target('', 'x'))).toThrow(/id/i);
    expect(() => getUserViewLink('')).toThrow(/uid/);
    expect(() => getSeatClaimLink(target('e1', 'x'), '')).toThrow(/token/);
  });
});

describe('deepLinkService.parseLink', () => {
  it('round-trips every builder to its in-app path', () => {
    const links = [
      getVillageViewLink('matabuena'),
      getEventLink(target('evt_1', 'Fiestas')),
      getOrgInviteLink(target('o1', 'Peña')),
      getSeatClaimLink(target('e1', 'Cena'), 'tok'),
      getUserViewLink('u1'),
      getWrappedLink('matabuena', 2026),
    ];
    for (const l of links) {
      expect(parseLink(l.url)).toEqual({ path: l.path, kind: l.kind, resource: l.resource });
    }
  });

  it('links a Wrapped as village content', () => {
    expect(getWrappedLink('matabuena', 2026)).toEqual({
      url: `${HOST}/matabuena/fiestas/2026`,
      path: '/matabuena/fiestas/2026',
      kind: 'content',
      resource: 'wrapped',
    });
  });

  it('accepts the app scheme', () => {
    expect(parseLink('cultuvilla://matabuena/evento/x_e1?utm=1')).toEqual({
      path: '/matabuena/evento/x_e1',
      kind: 'content',
      resource: 'event',
    });
  });

  it('returns null for other hosts, app routes and garbage', () => {
    expect(parseLink('https://other.host/matabuena')).toBeNull();
    expect(parseLink(`${HOST}/ajustes`)).toBeNull();
    expect(parseLink(`${HOST}/matabuena/lugares`)).toBeNull();
    expect(parseLink(`${HOST}/`)).toBeNull();
    expect(parseLink('http://example.test.app/matabuena')).toBeNull();
    expect(parseLink('not-a-url')).toBeNull();
  });
});

describe('deepLinkService.buildShareMessage', () => {
  const t = (key: string, vars?: Record<string, string | number>): string => {
    const map: Record<string, string> = {
      'deeplink.share.event.view': 'Mira «{name}»: {url}',
      'deeplink.share.event.invite': 'Te he guardado una plaza en «{name}»: {url}',
      'deeplink.share.organization.invite': 'Te invito a unirte a {name}: {url}',
    };
    let out: string = map[key] ?? key;
    for (const k of Object.keys(vars ?? {})) out = out.split(`{${k}}`).join(String(vars?.[k]));
    return out;
  };

  it('picks the message by resource and kind', () => {
    const view = getEventLink(target('e1', 'Fiesta'));
    expect(buildShareMessage(view, t, 'Fiesta')).toBe(`Mira «Fiesta»: ${view.url}`);
    const seat = getSeatClaimLink(target('e1', 'Fiesta'), 'tok');
    expect(buildShareMessage(seat, t, 'Fiesta')).toBe(`Te he guardado una plaza en «Fiesta»: ${seat.url}`);
    const invite = getOrgInviteLink(target('o1', 'Peña'));
    expect(buildShareMessage(invite, t, 'Peña')).toBe(`Te invito a unirte a Peña: ${invite.url}`);
  });
});

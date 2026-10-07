import { describe, it, expect } from 'vitest';
import type { Card, Village, VillageHome } from '../../web/data';
import { renderDocument } from '../../web/document';
import { render } from '../../web/html';
import { homePage, type Landing } from '../../web/pages';

const village = (slug: string, name: string, province: string | null = 'Segovia'): Village => ({
  id: `id-${slug}`,
  name,
  slug,
  province,
  escudoUrl: null,
  active: true,
  description: 'La cuna de la sierra segoviana.',
  lat: null,
  lng: null,
  locationLabel: null,
});

const card = (href: string, title: string, imageUrl: string | null = null, originalUrl: string | null = null): Card => ({
  href,
  title,
  subtitle: null,
  imageUrl,
  originalUrl,
});

const emptyHome: VillageHome = { events: [], news: [], posters: [], orgs: [], places: [], barrios: [], history: [], word: null };

const matabuena = village('matabuena', 'Matabuena');
const showcase: Landing['showcase'] = {
  village: matabuena,
  home: {
    ...emptyHome,
    events: [card('/matabuena/evento/torneo-de-mus_e1', 'Torneo de mus')],
    posters: [1, 2, 3].map((n) => card(`/matabuena/cartel/p${String(n)}`, `Cartel ${String(n)}`, `https://img/p${String(n)}_card.jpg`)),
    orgs: [card('/matabuena/entidad/o1', 'El Frontón', 'https://img/o1_card.jpg', 'https://img/o1.jpg')],
  },
};

const body = (landing: Landing) => render(homePage(landing).body);

describe('homePage', () => {
  it('renders on the full-width landing layout', () => {
    const page = homePage({ villages: [], showcase: null });
    expect(page.layout).toBe('landing');
    const out = renderDocument(page, { canonical: 'https://cultuvilla.es/', appPath: '/' });
    expect(out).toContain('<main class="landing">');
    expect(out).toContain('/brand/gloock-latin.woff2');
  });

  it('shows the featured pueblo with links into its real pages', () => {
    const out = body({ villages: [matabuena], showcase });
    expect(out).toContain('Así se vive Matabuena en Cultuvilla');
    expect(out).toContain('href="/matabuena/evento/torneo-de-mus_e1"');
    expect(out).toContain('href="/matabuena/carteles"');
    // The Embajador block uses a real event URL as its example.
    expect(out).toContain('cultuvilla.es/matabuena/evento/torneo-de-mus_e1');
    // Three posters with images make the hero fan.
    expect(out).toContain('class="fan"');
  });

  it('falls back to the original upload when a card variant is missing', () => {
    expect(body({ villages: [], showcase })).toContain("this.src='https://img/o1.jpg'");
  });

  it('lists every active pueblo and counts them', () => {
    const out = body({ villages: [matabuena, village('pedraza', 'Pedraza')], showcase });
    expect(out).toContain('2 pueblos y contando');
    expect(out).toContain('href="/pedraza"');
  });

  it('drops the showcase and the village list when there is nothing to show', () => {
    const out = body({ villages: [], showcase: { village: matabuena, home: emptyHome } });
    expect(out).not.toContain('Así se vive');
    expect(out).not.toContain('class="fan"');
    expect(out).not.toContain('pueblos y contando');
  });

  it('escapes pueblo-written text', () => {
    const out = body({ villages: [village('x', '<script>x</script>')], showcase: null });
    expect(out).not.toContain('<script>x</script>');
  });
});

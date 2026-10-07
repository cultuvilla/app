import { describe, it, expect } from 'vitest';
import type { Card, Village, VillageHome } from '../../web/data';
import { renderDocument } from '../../web/document';
import { render } from '../../web/html';
import { homePage, villagesPage, type Landing } from '../../web/pages';

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
const villagesBody = (landing: Landing) => render(villagesPage(landing).body);

describe('homePage', () => {
  it('renders on the full-width landing layout', () => {
    const page = homePage({ villages: [], showcase: null });
    expect(page.layout).toBe('landing');
    const out = renderDocument(page, { canonical: 'https://cultuvilla.es/', appPath: '/' });
    expect(out).toContain('<main class="landing">');
    expect(out).toContain('/brand/gloock-latin.woff2');
  });

  it('draws the app phone from the featured pueblo and links it to the pueblo', () => {
    const out = body({ villages: [matabuena], showcase });
    expect(out).toContain('class="phone" href="/matabuena"');
    expect(out).toContain('Torneo de mus');
    expect(out).toContain('Cartel 1');
    // The Embajador block uses a real event URL as its example.
    expect(out).toContain('cultuvilla.es/matabuena/evento/torneo-de-mus_e1');
    expect(out).toContain('href="/pueblos"');
    expect(out).toContain('1 pueblo y contando');
  });

  it('keeps the full showcase and the pueblo list on /pueblos, not on the home', () => {
    const home = body({ villages: [matabuena], showcase });
    expect(home).not.toContain('Así se vive');
    expect(home).not.toContain('class="villages"');
    const out = villagesBody({ villages: [matabuena, village('pedraza', 'Pedraza')], showcase });
    expect(out).toContain('Así se vive Matabuena en Cultuvilla');
    expect(out).toContain('href="/matabuena/carteles"');
    expect(out).toContain('2 pueblos y contando');
    expect(out).toContain('href="/pedraza"');
  });

  it('falls back to the original upload when a card variant is missing', () => {
    const out = villagesBody({ villages: [], showcase });
    expect(out).toContain('data-fallback="https://img/o1.jpg" onerror="this.onerror=null;this.src=this.dataset.fallback"');
  });

  it('never puts an upload URL inside the fallback handler', () => {
    const hostile = "https://img/x.jpg';alert(1);//";
    const out = villagesBody({
      villages: [],
      showcase: { village: matabuena, home: { ...emptyHome, orgs: [card('/m/entidad/o9', 'Peña', 'https://img/x_card.jpg', hostile)] } },
    });
    const handlers = out.match(/onerror="[^"]*"/g) ?? [];
    expect(handlers.length).toBeGreaterThan(0);
    for (const h of handlers) expect(h).toBe('onerror="this.onerror=null;this.src=this.dataset.fallback"');
  });

  it('drops the phone, showcase and lists when there is nothing to show', () => {
    expect(body({ villages: [], showcase: null })).not.toContain('class="phone"');
    expect(body({ villages: [], showcase: null })).not.toContain('pueblos y contando');
    const out = villagesBody({ villages: [], showcase: { village: matabuena, home: emptyHome } });
    expect(out).not.toContain('Así se vive');
    expect(out).not.toContain('pueblos y contando');
  });

  it('escapes pueblo-written text', () => {
    const out = villagesBody({ villages: [village('x', '<script>x</script>')], showcase: null });
    expect(out).not.toContain('<script>x</script>');
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import type { Card, Village, VillageHome, WrappedView } from '../../web/data';
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
    const page = homePage({ villages: [], showcase: null, wrapped: null });
    expect(page.layout).toBe('landing');
    const out = renderDocument(page, { canonical: 'https://cultuvilla.es/', appPath: '/' });
    expect(out).toContain('<main class="landing">');
    expect(out).toContain('/brand/gloock-latin.woff2');
  });

  it('shows the fiestas summary of the featured pueblo in a swipeable phone, never its named people', () => {
    const view: WrappedView = {
      year: 2026,
      images: [],
      eventCount: 21,
      personCount: 186,
      cards: (['cover', 'stats', 'events', 'news', 'people', 'organizers', 'posters'] as const).map((c) => ({
        card: c,
        url: `https://img/${c}.png`,
      })),
    };
    const out = body({ villages: [matabuena], showcase, wrapped: { village: matabuena, view } });
    expect(out).toContain('class="wr-track"');
    expect(out).toContain('href="/matabuena/fiestas/2026"');
    for (const c of ['cover', 'stats', 'events', 'news', 'posters']) expect(out).toContain(`src="https://img/${c}.png"`);
    for (const c of ['people', 'organizers']) expect(out).not.toContain(`https://img/${c}.png`);
    // The Embajador block uses a real event URL as its example.
    expect(out).toContain('cultuvilla.es/matabuena/evento/torneo-de-mus_e1');
    expect(body({ villages: [matabuena], showcase, wrapped: null })).not.toContain('class="wr-track"');
  });

  it('unmutes the intro film where it is, without restarting it', () => {
    const out = body({ villages: [], showcase: null, wrapped: null });
    expect(out).toContain('cultuvilla-intro-vertical.mp4');
    expect(out).not.toContain('currentTime');
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
      wrapped: null,
    });
    const handlers = out.match(/onerror="[^"]*"/g) ?? [];
    expect(handlers.length).toBeGreaterThan(0);
    for (const h of handlers) expect(h).toBe('onerror="this.onerror=null;this.src=this.dataset.fallback"');
  });

  it('drops the summary, showcase and lists when there is nothing to show', () => {
    expect(body({ villages: [], showcase: null, wrapped: null })).not.toContain('class="wr');
    const out = villagesBody({ villages: [], showcase: { village: matabuena, home: emptyHome }, wrapped: null });
    expect(out).not.toContain('Así se vive');
    expect(out).not.toContain('pueblos y contando');
  });

  it('escapes pueblo-written text', () => {
    const out = villagesBody({ villages: [village('x', '<script>x</script>')], showcase: null, wrapped: null });
    expect(out).not.toContain('<script>x</script>');
  });

  it('serves every landing photo and video from Hosting and credits it', () => {
    const dir = resolve(__dirname, '../../../../web/public/brand/landing');
    const credits = readFileSync(resolve(dir, 'CREDITS.md'), 'utf8');
    const pages = [body({ villages: [matabuena], showcase }), villagesBody({ villages: [matabuena], showcase })].join('');
    const styles = renderDocument(homePage({ villages: [], showcase: null, wrapped: null }), { canonical: 'https://x/', appPath: '/' });
    const names = new Set([...`${pages}${styles}`.matchAll(/\/brand\/landing\/([a-z-]+\.(?:webp|mp4))/g)].map((m) => m[1]));
    expect(names.size).toBeGreaterThanOrEqual(10);
    for (const name of names) {
      expect(existsSync(resolve(dir, name)), name).toBe(true);
      expect(credits, `${name} credit`).toContain(`\`${name}\``);
    }
  });
});

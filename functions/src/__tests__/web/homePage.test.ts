import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, it, expect } from 'vitest';
import type { Card, Village, VillageHome, WrappedView } from '../../web/data';
import { renderDocument } from '../../web/document';
import { render } from '../../web/html';
import { AMBASSADOR_PICKER, ambassadorsPage, homePage, villagesPage, WRAPPED_AUTOPLAY, type Landing } from '../../web/pages';
import { LANDING_STYLES } from '../../web/styles';

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
    expect(out).toContain('/brand/figtree-latin.woff2');
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
    // It plays by itself: no link out, no arrows.
    expect(out).not.toContain('/matabuena/fiestas/2026');
    expect(out).not.toContain('<button type="button" aria-label="Siguiente"');
    expect(out).toContain('Cada año, listo para compartir entre los vecinos.');
    for (const c of ['cover', 'stats', 'events', 'news', 'posters']) expect(out).toContain(`src="https://img/${c}.png"`);
    // The cover is repeated, hidden, at the end so the loop can wrap without rewinding.
    expect(out).toMatch(/src="https:\/\/img\/posters\.png"[^>]*\/><img src="https:\/\/img\/cover\.png" alt="" aria-hidden="true"/);
    for (const c of ['people', 'organizers']) expect(out).not.toContain(`https://img/${c}.png`);
    expect(out).toContain('<section class="blk amb">');
    // The home only hooks the Embajador pitch with the film's question and hands over to /embajadores.
    expect(out).toContain('<h2>¿Presumes de pueblo allá donde vas?</h2>');
    expect(out).toContain('<a class="cta" href="/embajadores">');
    expect(out).not.toContain('class="steps"');
    expect(out).not.toContain('Para quién');
    expect(body({ villages: [matabuena], showcase, wrapped: null })).not.toContain('class="wr-track"');
  });

  it('unmutes the intro film from the icon inside the phone, without restarting it, and mutes it again', () => {
    const out = body({ villages: [], showcase: null, wrapped: null });
    // The icon sits on the phone's screen, beside the video it controls.
    expect(out).toMatch(/<span class="intro-phone"><video [^>]*><\/video><button type="button" class="sound"/);
    const onclick = /class="sound" aria-label="Activar sonido" onclick="([^"]*)"/.exec(out)?.[1];
    if (!onclick) throw new Error('the sound icon has no handler');
    const video = { muted: true, currentTime: 12.5, plays: 0, play() { this.plays += 1; } };
    const classes = new Set<string>();
    const button = {
      label: 'Activar sonido',
      parentNode: { querySelector: () => video },
      classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
      setAttribute(name: string, value: string) {
        if (name === 'aria-label') this.label = value;
      },
    };
    // The handler runs as the button: in a fresh vm context, top-level `this` is the context object.
    const click = () => runInNewContext(onclick.replace(/&#39;/g, "'").replace(/&quot;/g, '"'), button);
    click();
    expect(video).toMatchObject({ muted: false, currentTime: 12.5, plays: 1 });
    expect(classes.has('on')).toBe(true);
    expect(button.label).toBe('Silenciar');
    click();
    expect(video).toMatchObject({ muted: true, currentTime: 12.5, plays: 1 });
    expect(classes.has('on')).toBe(false);
    expect(button.label).toBe('Activar sonido');
  });

  it('advances the summary one card at a time and wraps from the copied cover back to the start', () => {
    let tick = (): void => undefined;
    const pending: (() => void)[] = [];
    const scrolls: { left: number; behavior: string }[] = [];
    const track = {
      children: { length: 6 }, // five cards plus the trailing copy of the cover
      clientWidth: 300,
      scrollLeft: 0,
      addEventListener: () => undefined,
      scrollTo(o: { left: number; behavior: string }) {
        scrolls.push(o);
        this.scrollLeft = o.left;
      },
    };
    runInNewContext(WRAPPED_AUTOPLAY, {
      document: { hidden: false, querySelectorAll: () => [track] },
      matchMedia: () => ({ matches: false }),
      setInterval: (f: () => void) => (tick = f),
      setTimeout: (f: () => void) => pending.push(f),
    });
    for (let i = 0; i < 5; i++) tick();
    expect(scrolls.map((x) => x.left)).toEqual([300, 600, 900, 1200, 1500]);
    // Landing on the copy queues an instant jump back to the real cover.
    expect(pending).toHaveLength(1);
    pending[0]();
    expect(scrolls[scrolls.length - 1]).toEqual({ left: 0, behavior: 'instant' });
    tick();
    expect(scrolls[scrolls.length - 1]).toEqual({ left: 300, behavior: 'smooth' });
  });

  it('stays still for readers who ask for reduced motion', () => {
    let started = false;
    runInNewContext(WRAPPED_AUTOPLAY, {
      document: { hidden: false, querySelectorAll: () => [{ children: { length: 6 }, addEventListener: () => undefined }] },
      matchMedia: () => ({ matches: true }),
      setInterval: () => (started = true),
    });
    expect(started).toBe(false);
  });

  it('heads the page in green with only "pueblo" in orange, over a star-less fiesta strip', () => {
    const out = body({ villages: [], showcase: null, wrapped: null });
    expect(out).toContain('<h1>Cuida la cultura de tu <em>pueblo</em>.</h1>');
    expect(out).toContain('<span>Romerías</span>');
    expect(out).not.toContain('✦');
  });

  it('sets the landing in Figtree and drops the intro phone below the bunting only on the wide layout', () => {
    expect(LANDING_STYLES).toMatch(/@font-face\{font-family:Figtree;src:url\(\/brand\/figtree-latin\.woff2\)/);
    expect(LANDING_STYLES).toMatch(/\nbody\{font-family:Figtree,/);
    expect(LANDING_STYLES).toContain('@media (min-width:821px){.landing .intro{padding-top:56px}}');
    expect(LANDING_STYLES).not.toMatch(/\n\.landing \.intro\{[^}]*padding-top/);
    expect(existsSync(resolve(__dirname, '../../../../web/public/brand/figtree-latin.woff2'))).toBe(true);
    expect(existsSync(resolve(__dirname, '../../../../web/public/brand/figtree-OFL.txt'))).toBe(true);
  });

  it('gives would-be Embajadores a short page of their own: the film and a form that asks for their pueblo and phone', () => {
    const page = ambassadorsPage();
    expect(page.layout).toBe('landing');
    const out = render(page.body);
    expect(out).toContain('<h1>¿Vives las fiestas de tu pueblo <em>como nadie</em>?</h1>');
    expect(out).toContain('src="/brand/landing/cultuvilla-embajador-vertical.mp4"');
    expect(out).toContain('<form id="amb-form" class="amb-form" method="post" action="/embajadores" novalidate>');
    for (const name of ['pueblo', 'municipalityId', 'nombre', 'telefono', 'consentimiento', 'web']) expect(out).toContain(`name="${name}"`);
    expect(out).toContain('type="tel"');
    expect(out).toContain('href="/legal/privacidad"');
    // Concise: none of the long version's sections.
    expect(out).not.toContain('class="steps"');
    expect(out).not.toContain('class="faq"');
    expect(out.match(/<a class="store"/g)).toHaveLength(2);
    for (const f of ['cultuvilla-embajador-vertical.mp4', 'cultuvilla-embajador-vertical.webp']) {
      expect(existsSync(resolve(__dirname, '../../../../web/public/brand/landing', f))).toBe(true);
    }
  });

  it('hands a rejected form back with what was typed, escaped, and each problem beside its field', () => {
    const form = { pueblo: '<b>Mata</b>', municipalityId: '', nombre: 'Ana "la del bar"', telefono: '123', consentimiento: true, web: '' };
    const out = render(ambassadorsPage({ form, errors: { telefono: 'Escribe un teléfono válido, por ejemplo 612 345 678.' } }).body);
    expect(out).toContain('value="&lt;b&gt;Mata&lt;/b&gt;"');
    expect(out).toContain('value="Ana &quot;la del bar&quot;"');
    expect(out).toContain('<span class="err" role="alert">Escribe un teléfono válido');
    expect(out).toMatch(/name="consentimiento" value="si" required checked/);
  });

  it('fills the pueblo picker from the search and remembers the id of the pueblo chosen', async () => {
    const listeners: Record<string, () => void> = {};
    const input = { value: '', addEventListener: (_: string, f: () => void) => (listeners['input'] = f) };
    const hidden = { value: '' };
    const options: { value: string }[] = [];
    const list = { set textContent(_: string) { options.length = 0; }, appendChild: (o: { value: string }) => options.push(o) };
    const timers: (() => void)[] = [];
    const fetched: string[] = [];
    let resolveFetch: (() => void) | null = null;
    const done = new Promise<void>((r) => (resolveFetch = r));
    runInNewContext(AMBASSADOR_PICKER, {
      document: {
        getElementById: (id: string) => (id === 'amb-form' ? { elements: { pueblo: input, municipalityId: hidden } } : list),
        createElement: () => ({ value: '' }),
      },
      encodeURIComponent,
      clearTimeout: () => undefined,
      setTimeout: (f: () => void) => timers.push(f),
      fetch: (url: string) => {
        fetched.push(url);
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'm1', name: 'Matabuena', province: 'Segovia' }]) }).finally(() => setImmediate(() => resolveFetch?.()));
      },
    });
    input.value = 'mata';
    listeners['input']();
    for (const f of timers) f();
    await done;
    expect(fetched).toEqual(['/embajadores/pueblos?q=mata']);
    expect(options.map((o) => o.value)).toEqual(['Matabuena (Segovia)']);
    input.value = 'Matabuena (Segovia)';
    listeners['input']();
    expect(hidden.value).toBe('m1');
  });

  it('marks each store button with its store icon', () => {
    const out = body({ villages: [], showcase: null, wrapped: null });
    expect(out).toMatch(/<a class="store" href="https:\/\/apps\.apple\.com[^"]*"><svg viewBox="0 0 24 24" aria-hidden="true">/);
    expect(out).toMatch(/<a class="store" href="https:\/\/play\.google\.com[^"]*"><svg viewBox="0 0 24 24" aria-hidden="true">/);
  });

  it('keeps the full showcase and the pueblo list on /pueblos, not on the home', () => {
    const home = body({ villages: [matabuena], showcase, wrapped: null });
    expect(home).not.toContain('Así se vive');
    expect(home).not.toContain('class="villages"');
    const out = villagesBody({ villages: [matabuena, village('pedraza', 'Pedraza')], showcase, wrapped: null });
    expect(out).toContain('Así se vive Matabuena en Cultuvilla');
    expect(out).toContain('href="/matabuena/carteles"');
    expect(out).toContain('2 pueblos y contando');
    expect(out).toContain('href="/pedraza"');
  });

  it('falls back to the original upload when a card variant is missing', () => {
    const out = villagesBody({ villages: [], showcase, wrapped: null });
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
    const pages = [body({ villages: [matabuena], showcase, wrapped: null }), villagesBody({ villages: [matabuena], showcase, wrapped: null })].join('');
    const styles = renderDocument(homePage({ villages: [], showcase: null, wrapped: null }), { canonical: 'https://x/', appPath: '/' });
    const names = new Set([...`${pages}${styles}`.matchAll(/\/brand\/landing\/([a-z-]+\.(?:webp|mp4))/g)].map((m) => m[1]));
    expect(names.size).toBeGreaterThanOrEqual(10);
    for (const name of names) {
      expect(existsSync(resolve(dir, name)), name).toBe(true);
      expect(credits, `${name} credit`).toContain(`\`${name}\``);
    }
  });
});

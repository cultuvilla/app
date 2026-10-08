import { APP_STORES } from '@cultuvilla/shared/config';
import { palette } from '@cultuvilla/shared/design-system';
import { LEGAL_DOCS } from '@cultuvilla/shared/legal';
import type { WrappedCard } from '@cultuvilla/shared/models';
import { villagePath, villageSectionPath } from '@cultuvilla/shared/utils';
import {
  cardImage,
  eventWhen,
  posterTitle,
  type Card,
  type DefinitionView,
  type EventView,
  type HistoryView,
  type NewsView,
  type OrgView,
  type PlaceView,
  type BarrioView,
  type PosterView,
  type SectionData,
  type TermView,
  type Village,
  type VillageHome,
  type WrappedView,
} from './data';
import { appCta, type Page } from './document';
import { html, raw, type Child, type SafeHtml } from './html';
import type { LegalPage, PublicSection } from './routes';
import { richText } from './richText';
import type { AmbassadorForm, AmbassadorFormErrors, AmbassadorFormField } from './ambassadorLead';

// The read site is Spanish-only server output. Enum labels mirror
// packages/i18n/messages/es.json (news.compose.category, village.admin.places.kind).
const NEWS_CATEGORY: Readonly<Partial<Record<string, string>>> = {
  fiesta: 'Fiesta',
  tradicion: 'Tradición',
  gastronomia: 'Gastronomía',
  historia: 'Historia',
  otro: 'Otro',
};
const PLACE_KIND: Readonly<Partial<Record<string, string>>> = {
  cemetery: 'Cementerio',
  church: 'Iglesia',
  hermitage: 'Ermita',
  plaza: 'Plaza',
  town_hall: 'Ayuntamiento',
  otros: 'Otros',
};
const BARRIO_KIND: Readonly<Partial<Record<string, string>>> = {
  barrio: 'Barrio',
  pedania: 'Pedanía',
  aldea: 'Aldea',
  parroquia: 'Parroquia',
};
const ORG_TYPE: Readonly<Partial<Record<string, string>>> = {
  ayuntamiento: 'Ayuntamiento',
  peña: 'Peña',
  asociación: 'Asociación',
  otros: 'Entidad',
};
const TERM_KIND: Readonly<Partial<Record<string, string>>> = {
  palabra: 'Palabra',
  dicho: 'Dicho',
  mote: 'Mote',
  toponimo: 'Topónimo',
};
const SECTION_TITLE: Readonly<Record<PublicSection, string>> = {
  carteles: 'Carteles de fiestas',
  lugares: 'Lugares',
  entidades: 'Peñas y asociaciones',
  barrios: 'Barrios',
  historia: 'Historia',
  vocabulario: 'Vocabulario',
};

const label = (map: Readonly<Partial<Record<string, string>>>, key: string | null) => (key ? (map[key] ?? null) : null);

function excerpt(text: string | null, max = 160): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** An image whose `_card` variant may not exist yet — fall back to the original. */
function img(src: string | null, alt: string, cls?: string, original?: string | null): Child {
  if (!src) return null;
  const fallback = original && original !== src ? original : null;
  return fallback
    ? // The URL rides in an HTML-escaped attribute and the handler is fixed code:
      // interpolating it into the handler's JavaScript would let a quote in an
      // upload URL break out of the string.
      html`<img class="${cls ?? ''}" src="${src}" alt="${alt}" loading="lazy" data-fallback="${fallback}" onerror="this.onerror=null;this.src=this.dataset.fallback"/>`
    : html`<img class="${cls ?? ''}" src="${src}" alt="${alt}" loading="lazy"/>`;
}

function cards(items: Card[]): SafeHtml {
  return html`<ul class="cards">${items.map(
    (c) => html`<li><a href="${c.href}">${img(c.imageUrl, '', undefined, c.originalUrl)}<span class="t">${c.title}</span>${
      c.subtitle ? html`<span class="s">${c.subtitle}</span>` : null
    }</a></li>`,
  )}</ul>`;
}

function section(title: string, items: Card[], more?: string): Child {
  if (items.length === 0) return null;
  return html`<section><h2>${title}</h2>${cards(items)}${more ? html`<a class="more" href="${more}">Ver todo</a>` : null}</section>`;
}

function backTo(v: Village): SafeHtml {
  return html`<p class="meta"><a href="${villagePath(v.slug)}">← ${v.name}</a></p>`;
}

function paragraphs(text: string | null): Child {
  if (!text) return null;
  return html`<div class="body">${text.split(/\n{2,}/).map((p) => html`<p>${p}</p>`)}</div>`;
}

function gallery(urls: string[], alt: string): Child {
  if (urls.length === 0) return null;
  return html`${img(urls[0] ?? null, alt, 'hero')}${urls.slice(1).map((u) => html`<p>${img(u, alt)}</p>`)}`;
}

// ── Village ─────────────────────────────────────────────────────────────────

export function villagePage(v: Village, home: VillageHome | null): Page {
  const where = v.province ? `${v.name}, ${v.province}` : v.name;
  const intro = html`<div style="display:flex;gap:16px;align-items:center">${img(v.escudoUrl, `Escudo de ${v.name}`, 'escudo')}<div><h1>${v.name}</h1>${
    v.province ? html`<p class="meta">${v.province}</p>` : null
  }</div></div>`;

  if (!v.active || !home) {
    return {
      head: { title: v.name, description: `${where} aún no tiene comunidad en Cultuvilla.`, noindex: true },
      body: html`${intro}<div class="notice"><p>${v.name} aún no está en Cultuvilla. Cualquier vecino puede darlo de alta desde la app y empezar a compartir sus fiestas, noticias e historia.</p></div>${appCta(villagePath(v.slug), 'Traer mi pueblo a Cultuvilla')}`,
    };
  }

  const word = home.word
    ? html`<section><h2>Palabra del día</h2><div class="notice"><p><a href="${home.word.href}"><strong>${home.word.term.term}</strong></a></p>${
        home.word.definition ? html`<p>${home.word.definition.definition}</p>` : null
      }</div></section>`
    : null;

  return {
    head: {
      title: v.name,
      description: v.description ?? `Fiestas, eventos, noticias e historia de ${where}.`,
      imageUrl: v.escudoUrl,
      jsonLd: {
        '@type': 'City',
        name: v.name,
        address: { '@type': 'PostalAddress', addressCountry: 'ES', ...(v.province ? { addressRegion: v.province } : {}) },
        ...(v.lat !== null && v.lng !== null ? { geo: { '@type': 'GeoCoordinates', latitude: v.lat, longitude: v.lng } } : {}),
      },
    },
    body: html`${intro}${paragraphs(v.description)}
${section('Eventos', home.events)}
${section('Noticias', home.news)}
${section('Carteles de fiestas', home.posters, villageSectionPath(v.slug, 'carteles'))}
${section('Peñas y asociaciones', home.orgs, villageSectionPath(v.slug, 'entidades'))}
${section('Lugares', home.places, villageSectionPath(v.slug, 'lugares'))}
${section('Barrios', home.barrios, villageSectionPath(v.slug, 'barrios'))}
${section('Historia', home.history, villageSectionPath(v.slug, 'historia'))}
${word}
${appCta(villagePath(v.slug), `Sigue a ${v.name} en la app`)}`,
  };
}

export function sectionPage(v: Village, data: SectionData): Page {
  const title = `${SECTION_TITLE[data.section]} de ${v.name}`;
  let content: SafeHtml;
  switch (data.section) {
    case 'historia':
      content = data.groups.length
        ? html`${data.groups.map((g) => html`${g.label ? html`<h2>${g.label}</h2>` : null}${cards(g.cards)}`)}`
        : html`<p>Todavía no hay entradas.</p>`;
      break;
    case 'vocabulario':
      content = data.terms.length
        ? html`<ul class="list">${data.terms.map(
            (t) => html`<li><a href="${t.href}">${t.term}</a>${label(TERM_KIND, t.kind) ? html` <span class="meta">· ${label(TERM_KIND, t.kind)}</span>` : null}</li>`,
          )}</ul>`
        : html`<p>Todavía no hay palabras.</p>`;
      break;
    default:
      content = data.cards.length ? cards(data.cards) : html`<p>Todavía no hay nada aquí.</p>`;
  }
  return {
    head: { title, description: `${SECTION_TITLE[data.section]} de ${v.name} en Cultuvilla.` },
    body: html`${backTo(v)}<h1>${title}</h1>${content}${appCta(villageSectionPath(v.slug, data.section), 'Añade lo que falta desde la app')}`,
  };
}

// ── Entities ────────────────────────────────────────────────────────────────

export function eventPage(v: Village, e: EventView, appPath: string): Page {
  if (e.private) {
    return {
      head: { title: 'Evento privado', description: 'Solo visible para los miembros de la organización.', noindex: true },
      body: html`${backTo(v)}<h1>Evento privado</h1><p>Este evento solo es visible para los miembros de la organización que lo publica.</p>${appCta(appPath, 'Ver en la app')}`,
    };
  }
  const when = eventWhen(e);
  return {
    head: {
      title: e.title,
      description: excerpt(e.description) ?? `${when ?? ''} · ${v.name}`,
      imageUrl: e.imageUrl,
      jsonLd: e.start
        ? {
            '@type': 'Event',
            name: e.title,
            startDate: e.start.toISOString(),
            ...(e.end ? { endDate: e.end.toISOString() } : {}),
            eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
            eventStatus: e.cancelled ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
            location: {
              '@type': 'Place',
              name: e.locationName ?? v.name,
              address: { '@type': 'PostalAddress', addressLocality: v.name, addressCountry: 'ES' },
            },
            ...(e.description ? { description: excerpt(e.description, 300) } : {}),
            ...(e.imageUrl ? { image: e.imageUrl } : {}),
          }
        : null,
    },
    body: html`${backTo(v)}${img(e.imageUrl, e.title, 'hero')}<h1>${e.title}</h1>
${e.cancelled ? html`<div class="notice"><strong>Evento cancelado</strong></div>` : null}
<ul class="facts">${when ? html`<li>📅 ${when}</li>` : null}${e.locationName ? html`<li>📍 ${e.locationName}</li>` : null}<li>🏡 ${v.name}</li></ul>
${paragraphs(e.description)}
${e.cancelled ? null : appCta(appPath, 'Apúntate desde la app')}`,
  };
}

export function newsPage(v: Village, n: NewsView, appPath: string): Page {
  const ctx = { villageSlug: v.slug };
  const blocks = n.blocks.map((b) => {
    if (b.type === 'image') {
      return html`<figure style="margin:16px 0">${img(b.url, '')}${b.caption ? html`<figcaption class="meta">${richText(b.caption, ctx)}</figcaption>` : null}</figure>`;
    }
    if (b.style === 'section') return html`<h2>${richText(b.rich, ctx)}</h2>`;
    if (b.style === 'subsection') return html`<h3>${richText(b.rich, ctx)}</h3>`;
    return html`<p>${richText(b.rich, ctx)}</p>`;
  });
  const firstText = n.blocks.find((b) => b.type === 'text');
  const meta = [label(NEWS_CATEGORY, n.category), n.publishedAt ? eventWhen({ start: n.publishedAt, end: null })?.split(',')[0] : null]
    .filter(Boolean)
    .join(' · ');
  return {
    head: {
      title: n.title,
      description: excerpt(firstText?.type === 'text' ? firstText.rich.text : null),
      imageUrl: n.coverUrl,
      jsonLd: {
        '@type': 'NewsArticle',
        headline: n.title,
        ...(n.publishedAt ? { datePublished: n.publishedAt.toISOString() } : {}),
        ...(n.coverUrl ? { image: n.coverUrl } : {}),
      },
    },
    body: html`${backTo(v)}${img(n.coverUrl, n.title, 'hero')}<h1>${n.title}</h1>${meta ? html`<p class="meta">${meta}</p>` : null}<div class="body">${blocks}</div>${appCta(appPath, 'Comenta en la app')}`,
  };
}

export function orgPage(v: Village, o: OrgView, appPath: string, invite: boolean, events: Card[]): Page {
  const kind = label(ORG_TYPE, o.type) ?? 'Entidad';
  const facts = [kind, o.memberCount ? `${String(o.memberCount)} miembros` : null].filter(Boolean).join(' · ');
  return {
    head: {
      title: invite ? `Únete a ${o.name}` : o.name,
      description: excerpt(o.description) ?? `${kind} de ${v.name}.`,
      imageUrl: o.images[0] ?? null,
      // An invite link is shareable by anyone holding it; it must never rank.
      noindex: invite,
      jsonLd: invite ? null : { '@type': 'Organization', name: o.name, ...(o.description ? { description: excerpt(o.description, 300) } : {}) },
    },
    body: html`${backTo(v)}${invite ? html`<div class="notice"><strong>Te han invitado a unirte a ${o.name}.</strong></div>` : null}${img(o.images[0] ?? null, o.name, 'hero')}<h1>${o.name}</h1><p class="meta">${facts}</p>${paragraphs(o.description)}${o.images.slice(1).map((u) => html`<p>${img(u, o.name)}</p>`)}${section('Eventos', events)}${appCta(appPath, invite ? 'Únete desde la app' : `Sigue a ${o.name} en la app`)}`,
  };
}

export function placePage(v: Village, p: PlaceView, appPath: string): Page {
  const kind = label(PLACE_KIND, p.kind);
  return {
    head: {
      title: `${p.name} · ${v.name}`,
      description: excerpt(p.description) ?? `${kind ?? 'Lugar'} de ${v.name}.`,
      imageUrl: p.images[0] ?? null,
      jsonLd: { '@type': 'Place', name: p.name, address: { '@type': 'PostalAddress', addressLocality: v.name, addressCountry: 'ES' } },
    },
    body: html`${backTo(v)}${gallery(p.images, p.name)}<h1>${p.name}</h1><p class="meta">${[kind, p.locationLabel].filter(Boolean).join(' · ')}</p>${paragraphs(p.description)}${appCta(appPath, 'Ver en la app')}`,
  };
}

export function barrioPage(v: Village, b: BarrioView, appPath: string): Page {
  const kind = label(BARRIO_KIND, b.kind) ?? 'Barrio';
  return {
    head: { title: `${b.name} · ${v.name}`, description: `${kind} de ${v.name}.`, imageUrl: b.images[0] ?? null },
    body: html`${backTo(v)}${gallery(b.images, b.name)}<h1>${b.name}</h1><p class="meta">${kind}${b.residentCount ? ` · ${String(b.residentCount)} vecinos` : ''}</p>${appCta(appPath, '¿Eres de aquí? Únete desde la app')}`,
  };
}

export function posterPage(v: Village, p: PosterView, appPath: string): Page {
  const title = posterTitle(p);
  return {
    head: { title: `${title} · ${v.name}`, description: `${title} de ${v.name}${p.datesLabel ? `, ${p.datesLabel}` : ''}.`, imageUrl: p.images[0] ?? null },
    body: html`${backTo(v)}<h1>${title}</h1><p class="meta">${p.datesLabel ?? String(p.year)}</p>${p.images.map((u) => html`<p>${img(u, title)}</p>`)}${appCta(appPath, 'Ver en la app')}`,
  };
}

export function historyPage(v: Village, h: HistoryView, appPath: string): Page {
  const ctx = { villageSlug: v.slug };
  return {
    head: { title: `${h.title} · ${v.name}`, description: excerpt(h.body?.text ?? null) ?? `${h.dateLabel} · Historia de ${v.name}.`, imageUrl: h.images[0]?.url ?? null },
    body: html`${backTo(v)}<h1>${h.title}</h1><p class="meta">${h.dateLabel}</p>${h.images.map(
      (i) => html`<figure style="margin:16px 0">${img(i.url, h.title)}${i.caption ? html`<figcaption class="meta">${i.caption}</figcaption>` : null}</figure>`,
    )}${h.body ? html`<div class="body"><p>${richText(h.body, ctx)}</p></div>` : null}${
      h.sources ? html`<h2>Fuentes</h2><div class="body"><p>${richText({ text: h.sources }, ctx)}</p></div>` : null
    }${appCta(appPath, 'Ver en la app')}`,
  };
}

export function wordPage(v: Village, term: TermView, definitions: DefinitionView[], appPath: string): Page {
  const kind = label(TERM_KIND, term.kind) ?? 'Palabra';
  return {
    head: {
      title: `${term.term} · ${v.name}`,
      description: definitions[0]?.definition ?? `${kind} de ${v.name}.`,
      jsonLd: { '@type': 'DefinedTerm', name: term.term, ...(definitions[0] ? { description: definitions[0].definition } : {}) },
    },
    body: html`<p class="meta"><a href="${villageSectionPath(v.slug, 'vocabulario')}">← Vocabulario de ${v.name}</a></p><h1>${term.term}</h1><p class="meta">${kind} de ${v.name}</p>${
      definitions.length
        ? html`<ol>${definitions.map(
            (d) => html`<li><p>${d.definition}</p>${d.example ? html`<p class="meta">«${d.example}»</p>` : null}${d.castellano ? html`<p class="meta">En castellano: ${d.castellano}</p>` : null}</li>`,
          )}</ol>`
        : html`<p>Aún no tiene definición.</p>`
    }${appCta(appPath, 'Añade tu definición desde la app')}`,
  };
}

export function wrappedPage(v: Village, w: WrappedView, appPath: string): Page {
  const title = `Fiestas ${String(w.year)}`;
  const figures = [
    w.eventCount ? `${String(w.eventCount)} eventos` : null,
    w.personCount ? `${String(w.personCount)} personas apuntadas` : null,
  ].filter((f): f is string => f !== null);
  const lead = figures.length ? `${figures.join(', ')}. ` : '';
  return {
    head: {
      title: `${title} · ${v.name}`,
      description: `${lead}El resumen de las fiestas de ${v.name} en Cultuvilla.`,
      imageUrl: w.images[0] ?? null,
    },
    // The cards are already the whole story: drawn on the server, captioned on
    // the image, so the page only stacks them.
    body: html`${backTo(v)}<h1>${title}</h1>${figures.length ? html`<p class="meta">${figures.join(' · ')}</p>` : null}${w.images.map(
      (u, i) => html`<p>${img(u, `${title} · ${v.name} (${String(i + 1)}/${String(w.images.length)})`)}</p>`,
    )}${appCta(appPath, 'Verlo y compartirlo en la app')}`,
  };
}

// ── Site pages ──────────────────────────────────────────────────────────────

export interface Landing {
  villages: Village[];
  /** One real pueblo shown as the worked example; null when none is active. */
  showcase: { village: Village; home: VillageHome } | null;
  /** That pueblo's latest published fiestas summary. */
  wrapped: { village: Village; view: WrappedView } | null;
}

const BUNTING = raw(
  `<svg class="bunting" viewBox="0 0 1200 48" preserveAspectRatio="none" aria-hidden="true"><path d="M0 4 Q600 30 1200 4" fill="none" stroke="${palette.sage}" stroke-width="1.5"/>${Array.from(
    { length: 15 },
    (_, i) => {
      const x = 30 + i * 80;
      const sag = Math.round(4 + 26 * (1 - ((x + 20 - 600) / 600) ** 2));
      const colors = [palette.terracotta, palette.olive, palette.clay, palette.sage, palette.rust, palette.peach];
      const points = [x, sag, x + 40, sag, x + 20, Math.min(sag + 34, 48)].map(String);
      return `<polygon class="flag" points="${points[0]},${points[1]} ${points[2]},${points[3]} ${points[4]},${points[5]}" fill="${colors[i % colors.length]}"/>`;
    },
  ).join('')}</svg>`,
);

const FIESTAS = ['Fiestas patronales', 'Romerías', 'Verbenas', 'San Juan', 'Quintos', 'Matanza', 'Semana Santa', 'Carnaval', 'Encierros', 'Ferias', 'Hogueras'];

function shelf(title: string, items: Card[], more: string, cls = ''): Child {
  if (items.length === 0) return null;
  return html`<div class="shelf ${cls}"><div class="shelf-head"><h3>${title}</h3><a href="${more}">Ver todo →</a></div>${cards(items.slice(0, 8))}</div>`;
}

function showcaseBlock({ village: v, home }: NonNullable<Landing['showcase']>): Child {
  const vp = villagePath(v.slug);
  const shelves = [
    shelf('Eventos', home.events, vp),
    shelf('Carteles de fiestas', home.posters, villageSectionPath(v.slug, 'carteles'), 'posters'),
    shelf('Historia', home.history, villageSectionPath(v.slug, 'historia')),
    shelf('Peñas y asociaciones', home.orgs, villageSectionPath(v.slug, 'entidades')),
  ].filter(Boolean);
  if (shelves.length === 0 && !home.word) return null;
  const word = home.word
    ? html`<div class="word"><span class="eyebrow">Palabra del día en ${v.name}</span><a href="${home.word.href}">${home.word.term.term}</a>${
        home.word.definition ? html`<p class="muted">${home.word.definition.definition}</p>` : null
      }</div>`
    : null;
  return html`<section class="band blk"><div class="in"><div class="head"><span class="eyebrow">Un pueblo de verdad${v.province ? html` · ${v.province}` : null}</span><h2>Así se vive ${v.name} en Cultuvilla</h2>${
    v.description ? html`<p class="lead">${v.description}</p>` : null
  }<p><a class="ghost" style="color:inherit" href="${vp}">Entrar en ${v.name} →</a></p></div>${shelves}${word}</div></section>`;
}

/**
 * The Wrapped cards a stranger may see on the home page. `people` and
 * `organizers` name real vecinos: they stay on the pueblo's own summary page,
 * never in Cultuvilla's marketing.
 */
const LANDING_WRAPPED_CARDS: readonly WrappedCard[] = ['cover', 'stats', 'events', 'news', 'posters'];

/** A phone whose screen is the pueblo's fiestas summary, swiped card by card. */
/**
 * Advances every Wrapped phone one card every few seconds. The last slide is a
 * copy of the first, so on reaching it the track jumps back to the start
 * unseen and the loop never rewinds. Fixed code: it reads nothing from the page.
 */
export const WRAPPED_AUTOPLAY = `document.querySelectorAll('.wr-track').forEach(function(t){
if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
var held=false,n=t.children.length-1;
['pointerdown','touchstart','mouseenter','focusin'].forEach(function(e){t.addEventListener(e,function(){held=true;},{passive:true});});
['pointerup','touchend','mouseleave','focusout'].forEach(function(e){t.addEventListener(e,function(){held=false;},{passive:true});});
setInterval(function(){
if(held||document.hidden)return;
var w=t.clientWidth,i=Math.round(t.scrollLeft/w)+1;
t.scrollTo({left:i*w,behavior:'smooth'});
if(i>=n)setTimeout(function(){t.scrollTo({left:0,behavior:'instant'});},700);
},3500);
});`;

function wrappedPhone({ village: v, view }: NonNullable<Landing['wrapped']>): Child {
  const cards = view.cards.filter((c) => LANDING_WRAPPED_CARDS.includes(c.card));
  if (cards.length === 0) return null;
  return html`<section class="blk"><div class="in wr-split"><div><span class="eyebrow">Fiestas ${String(view.year)} · ${v.name}</span><h2>El resumen de vuestras fiestas</h2><p class="lead">Cada año, listo para compartir entre los vecinos.</p></div><div class="wr"><div class="wr-phone"><div class="wr-track" tabindex="0" aria-label="${`Resumen de las fiestas ${String(view.year)} de ${v.name}`}">${cards.map(
    (c, i) => html`<img src="${c.url}" alt="${`Tarjeta ${String(i + 1)} de ${String(cards.length)} del resumen de fiestas`}" width="1080" height="1920" loading="lazy" decoding="async"/>`,
  )}<img src="${cards[0].url}" alt="" aria-hidden="true" width="1080" height="1920" loading="lazy" decoding="async"/></div></div></div></div></section><script>${raw(WRAPPED_AUTOPLAY)}</script>`;
}

/** A landing photograph from /brand/landing — Unsplash, credited in CREDITS.md there. */
function photo(name: string, alt: string, width: number, height: number, cls = ''): SafeHtml {
  return html`<img class="${cls}" src="/brand/landing/${name}.webp" alt="${alt}" width="${width}" height="${height}" loading="lazy" decoding="async"/>`;
}

/**
 * A film from cultuvilla/motion in a phone, muted so it may autoplay. The sound
 * toggle is fixed code: it reads nothing from the page.
 */
function phoneVideo(name: string, label: string): SafeHtml {
  return html`<figure class="intro"><span class="intro-phone"><video src="/brand/landing/${name}.mp4" poster="/brand/landing/${name}.webp" width="540" height="960" autoplay muted loop playsinline preload="metadata" aria-label="${label}"></video><button type="button" class="sound" aria-label="Activar sonido" onclick="var v=this.parentNode.querySelector('video');v.muted=!v.muted;if(!v.muted){v.play();}this.classList.toggle('on',!v.muted);this.setAttribute('aria-label',v.muted?'Activar sonido':'Silenciar')">${raw(
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path class="off" d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><path class="wave" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>',
)}</button></span></figure>`;
}

const INTRO_VIDEO = phoneVideo('cultuvilla-intro-vertical', 'Vídeo: cómo funciona Cultuvilla');

const storeIcon = (path: string): SafeHtml => raw(`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}" fill="currentColor"/></svg>`);
const APPLE_ICON = storeIcon('M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701');
const PLAY_ICON = storeIcon('M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594zM1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924zm12.207 10.065l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973zm0 2.067l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z');

function storeButtons(): SafeHtml {
  return html`${APP_STORES.ios ? html`<a class="store" href="${APP_STORES.ios}">${APPLE_ICON}<span><small>Descárgala en el</small><b>App Store</b></span></a>` : null}${
    APP_STORES.android ? html`<a class="store" href="${APP_STORES.android}">${PLAY_ICON}<span><small>Disponible en</small><b>Google Play</b></span></a>` : null
  }`;
}

const FAQ: [string, string][] = [
  ['¿Cuánto cuesta?', 'Nada. Descargar la app, crear una peña o activar un pueblo es gratis.'],
  ['Mi pueblo no aparece. ¿Qué hago?', 'Están todos los municipios de España. Si el tuyo aún no está activado, pide ser su Embajador desde la app y lo ponemos en marcha contigo.'],
  ['¿Puede usarlo una peña aunque el ayuntamiento no esté?', 'Sí. Cada peña y asociación funciona por su cuenta dentro del pueblo. Cuantos más se sumen, más completo queda.'],
  ['¿Puedo apuntar a mis hijos o a mis padres?', 'Sí. Añade a las personas a tu cargo en tu perfil y apúntalas a los eventos contigo.'],
  ['¿Hace falta la app para ver un evento?', 'No. Cualquier evento, noticia o pueblo se abre en el navegador desde un enlace. Para apuntarte o publicar sí necesitas la app.'],
];

export function homePage({ wrapped }: Landing): Page {
  return {
    layout: 'landing',
    head: {
      title: 'Cultuvilla',
      description: 'Cuida la cultura de tu pueblo: sus fiestas, su historia, sus palabras y su gente, guardadas para siempre. Gratis para vecinos, peñas y ayuntamientos.',
      jsonLd: { '@type': 'WebSite', name: 'Cultuvilla', url: 'https://cultuvilla.es/' },
    },
    body: html`${BUNTING}
<section class="in top"><div><h1>Cuida la cultura de tu <em>pueblo</em>.</h1><p class="lead">La construyen sus propios vecinos y queda guardada para siempre.</p></div>${INTRO_VIDEO}</section>
<div class="strip" aria-hidden="true"><div class="strip-track">${[...FIESTAS, ...FIESTAS].map((f) => html`<span>${f}</span>`)}</div></div>
<section class="blk"><div class="in split"><ul class="mosaic">${(
      [
        ['fiesta-calle', 'Sus fiestas.', 'Calle de un pueblo adornada con farolillos de papel para las fiestas'],
        ['ventana-piedra', 'Su historia.', 'Ventana con rejas y geranios en una fachada de piedra'],
        ['vecinos-paseo', 'Sus palabras.', 'Una pareja mayor pasea por una calle empedrada'],
        ['baile-tradicional', 'Su gente.', 'Vecinos con traje tradicional bailan en la plaza'],
      ] as const
    ).map(([name, word, alt]) => html`<li>${photo(name, alt, 800, 800)}<span>${word}</span></li>`)}</ul><div><span class="eyebrow">Más que una agenda</span><h2 style="margin:12px 0 18px">Conserva la cultura de tu pueblo</h2><p class="lead">Los carteles de cada año, los motes, las palabras que solo se dicen allí, las historias de los mayores. Hoy están repartidos entre el bar, los grupos de WhatsApp y la memoria de unos pocos.</p><p class="lead">En Cultuvilla quedan guardados para siempre: para quien vive en el pueblo todo el año, para quien vuelve cada agosto y para los que vienen detrás.</p></div></div></section>
<section class="band blk"><div class="in"><div class="head"><span class="eyebrow">Qué puedes hacer</span><h2>Descubre. Apúntate. Inmortalízalo.</h2></div><div class="pillars">
<div class="pillar">${photo('pueblo-segovia', 'Un pueblo de Segovia visto desde el aire', 900, 600)}<b>Descubre</b><p class="muted">Todo lo que pasa en tu pueblo, sin perderte nada por no estar en el grupo adecuado.</p><ul><li>Calendario de eventos y fiestas</li><li>Noticias y avisos de quien organiza</li><li>Carteles de fiestas, de este año y de antes</li></ul></div>
<div class="pillar">${photo('paella-popular', 'Una paella gigante para la comida popular', 900, 600)}<b>Apúntate</b><p class="muted">Te apuntas con un toque, y a tu familia también, sin listas en papel.</p><ul><li>Comidas, torneos y excursiones</li><li>Apunta a los hijos y mayores a tu cargo</li><li>Únete a peñas y asociaciones</li></ul></div>
<div class="pillar">${photo('biblioteca-antigua', 'Una biblioteca antigua con estanterías de madera y el techo pintado', 900, 600)}<b>Inmortalízalo</b><p class="muted">La historia del pueblo, sus palabras y sus fiestas, contadas por sus vecinos y guardadas para siempre.</p><ul><li>Línea del tiempo del pueblo</li><li>Barrios, lugares y vocabulario propio</li><li>El resumen de vuestras fiestas, para compartir</li></ul></div>
</div></div></section>
${wrapped ? wrappedPhone(wrapped) : null}
<section class="blk amb"><div class="in split"><div class="head"><h2>¿Presumes de pueblo allá donde vas?</h2><p class="lead">Hazte Embajador de Cultuvilla y cuida la cultura de tu pueblo para siempre.</p><p><a class="cta" href="/embajadores">Quiero ser Embajador →</a></p></div>${photo('conversacion-mayor', 'Un joven charla con un hombre mayor al aire libre', 1200, 800, 'amb-photo')}</div></section>
<section class="band blk"><div class="in price"><span class="big">0 €</span><div style="display:grid;gap:12px"><h2>Gratis para todo el pueblo</h2><p class="lead">Sin cuotas por socio ni planes. Vecinos, peñas, asociaciones y ayuntamientos usan Cultuvilla sin pagar nada.</p></div></div></section>
<section class="blk"><div class="in faq-wrap"><div class="faq-head"><h2>Preguntas frecuentes</h2><p class="muted">¿Te queda otra duda? Escríbenos a <a href="mailto:cultuvilla.app@gmail.com">cultuvilla.app@gmail.com</a>.</p></div><div class="faq">${FAQ.map(
      ([q, a], i) => (i === 0 ? html`<details open><summary>${q}<span class="pm" aria-hidden="true"></span></summary><p>${a}</p></details>` : html`<details><summary>${q}<span class="pm" aria-hidden="true"></span></summary><p>${a}</p></details>`),
    )}</div></div></section>
<section class="band blk night"><div class="in final"><h2>Y tú, a disfrutar de las fiestas.</h2><p class="lead">Cuando todo está en un sitio, quien organiza apaga menos fuegos y los demás viven más la fiesta.</p><div class="stores">${storeButtons()}</div></div></section>`,
  };
}

/**
 * Fills the form's pueblo picker from /embajadores/pueblos as the visitor types,
 * and keeps the chosen municipality's id in the hidden field. Without it the
 * form still works: the server looks up whatever was typed. Fixed code: it
 * reads nothing from the page but the form's own fields.
 */
export const AMBASSADOR_PICKER = `(function(){var f=document.getElementById('amb-form');if(!f)return;
var i=f.elements['pueblo'],h=f.elements['municipalityId'],l=document.getElementById('amb-pueblos'),t,ids={};
i.addEventListener('input',function(){h.value=ids[i.value]||'';clearTimeout(t);var q=i.value.trim();if(q.length<2)return;
t=setTimeout(function(){fetch('/embajadores/pueblos?q='+encodeURIComponent(q)).then(function(r){return r.ok?r.json():[];}).then(function(rs){
l.textContent='';rs.forEach(function(p){var v=p.name+' ('+p.province+')';ids[v]=p.id;var o=document.createElement('option');o.value=v;l.appendChild(o);});
h.value=ids[i.value]||'';}).catch(function(){});},200);});})();`;

const formError = (errors: AmbassadorFormErrors, key: AmbassadorFormField): Child =>
  errors[key] ? html`<span class="err" role="alert">${errors[key]}</span>` : null;

function ambassadorForm(form: AmbassadorForm | null, errors: AmbassadorFormErrors): SafeHtml {
  const v = form ?? { pueblo: '', municipalityId: '', nombre: '', telefono: '', consentimiento: false, web: '' };
  return html`<form id="amb-form" class="amb-form" method="post" action="/embajadores" novalidate>
${formError(errors, 'form')}
<label>Tu pueblo<input name="pueblo" list="amb-pueblos" autocomplete="off" required placeholder="Empieza a escribir…" value="${v.pueblo}"/></label>${formError(errors, 'pueblo')}
<datalist id="amb-pueblos"></datalist><input type="hidden" name="municipalityId" value="${v.municipalityId}"/>
<label>Tu nombre<input name="nombre" autocomplete="name" required maxlength="80" value="${v.nombre}"/></label>${formError(errors, 'nombre')}
<label>Tu teléfono<input name="telefono" type="tel" inputmode="tel" autocomplete="tel" required placeholder="612 345 678" value="${v.telefono}"/></label>${formError(errors, 'telefono')}
<label class="hp" aria-hidden="true">Web<input name="web" tabindex="-1" autocomplete="off"/></label>
<label class="check"><input type="checkbox" name="consentimiento" value="si" required${v.consentimiento ? raw(' checked') : null}/><span>Quiero que Cultuvilla me llame o me escriba por WhatsApp para activar mi pueblo.</span></label>${formError(errors, 'consentimiento')}
<button type="submit" class="cta">Quiero ser Embajador</button>
<p class="fine">Responsable: Álvaro Francisco Gil (Cultuvilla). Usamos tu nombre y tu teléfono solo para contactarte sobre esta solicitud, con tu consentimiento, y los borramos cuando se resuelve. Puedes pedir acceso, rectificación o supresión en cultuvilla.app@gmail.com. Más en la <a href="/legal/privacidad">política de privacidad</a>.</p>
</form><script>${raw(AMBASSADOR_PICKER)}</script>`;
}

export function ambassadorsPage(submitted?: { form: AmbassadorForm; errors: AmbassadorFormErrors }): Page {
  return {
    layout: 'landing',
    head: {
      title: 'Embajadores',
      description: '¿Presumes de pueblo allá donde vas? Hazte su Embajador de Cultuvilla: déjanos tu teléfono y lo ponemos en marcha contigo.',
    },
    body: html`<div class="amb-page">${BUNTING}
<section class="in amb-top"><h1>¿Presumes de pueblo <em>allá donde vas</em>?</h1><p class="lead">Hazte su Embajador: activa la página de tu pueblo y cuida su cultura para siempre. Déjanos tu teléfono y lo ponemos en marcha contigo.</p>${phoneVideo('cultuvilla-embajador-vertical', 'Vídeo: hazte Embajador de Cultuvilla')}${ambassadorForm(submitted?.form ?? null, submitted?.errors ?? {})}</section>
<section class="blk amb-more"><div class="in"><ul class="amb-does">
<li><b>Lo pone en marcha</b><span>Activa la página del pueblo, con su escudo.</span></li>
<li><b>Suma a su gente</b><span>Invita a los vecinos, a sus peñas y al ayuntamiento.</span></li>
<li><b>Guarda su cultura</b><span>Fiestas, carteles, lugares, historia y palabras.</span></li>
</ul><p class="muted amb-app">¿Prefieres hacerlo tú desde la app? Busca tu pueblo y pulsa «Quiero ser embajador».</p><div class="stores">${storeButtons()}</div></div></section></div>`,
  };
}

export function ambassadorsThanksPage(): Page {
  return {
    layout: 'landing',
    head: { title: 'Gracias', noindex: true },
    body: html`<div class="amb-page">${BUNTING}
<section class="in top single"><div><span class="eyebrow">Embajadores de Cultuvilla</span><h1>¡Gracias! <em>Te llamamos pronto.</em></h1><p class="lead">Revisamos tu solicitud y te llamamos o te escribimos por WhatsApp en unos días para poner tu pueblo en marcha contigo. Mientras, ve descargando la app.</p><div class="stores">${storeButtons()}</div></div></section></div>`,
  };
}

export function villagesPage({ villages, showcase }: Landing): Page {
  return {
    layout: 'landing',
    head: {
      title: 'Pueblos',
      description: `${String(villages.length)} pueblos de España ya cuentan sus fiestas, eventos, peñas e historia en Cultuvilla.`,
    },
    body: html`${BUNTING}
<section class="in top single"><div><span class="eyebrow">Los pueblos de Cultuvilla</span><h1>Pueblos que ya se cuentan <em>aquí.</em></h1><p class="lead">Cada pueblo desarrolla aquí su perfil: sus eventos, sus carteles de fiestas, su historia y sus peñas, guardados para siempre. Entra en cualquiera, no hace falta la app.</p></div></section>
<div class="in banner">${photo('pueblo-atardecer', 'Un pueblo blanco al atardecer entre colinas', 1600, 615)}</div>
${showcase ? showcaseBlock(showcase) : null}
${villages.length ? html`<section class="blk"><div class="in"><div class="head"><span class="eyebrow">Ya están en Cultuvilla</span><h2>${villages.length} ${villages.length === 1 ? 'pueblo' : 'pueblos'} y contando</h2></div><ul class="villages">${villages.map(
      (v) => html`<li><a href="${villagePath(v.slug)}">${img(cardImage(v.escudoUrl), '', undefined, v.escudoUrl)}<span>${v.name}${v.province ? html`<small>${v.province}</small>` : null}</span></a></li>`,
    )}</ul></div></section>` : null}
<section class="band blk night"><div class="in final"><span class="eyebrow">Embajadores de Cultuvilla</span><h2>¿No ves tu pueblo? Tráelo tú.</h2><p class="lead">Están todos los municipios de España. Pide ser el Embajador o la Embajadora del tuyo desde la app y lo ponemos en marcha contigo.</p><div class="stores">${storeButtons()}</div></div></section>`,
  };
}

export function downloadPage(): Page {
  const stores = [
    APP_STORES.ios ? html`<a class="cta" href="${APP_STORES.ios}">Descargar en el App Store</a>` : null,
    APP_STORES.android ? html`<a class="cta" href="${APP_STORES.android}">Descargar en Google Play</a>` : null,
  ];
  return {
    head: { title: 'Descarga la app', description: 'La agenda de tu pueblo, en tu bolsillo.' },
    body: html`<h1>Cultuvilla</h1><p>La agenda de tu pueblo, en tu bolsillo.</p><div class="stores">${stores}</div>`,
  };
}

export function legalPage(page: LegalPage): Page {
  const doc =
    page === 'privacidad' ? LEGAL_DOCS.privacy : page === 'terminos' ? LEGAL_DOCS.terms : LEGAL_DOCS.accountDeletion;
  const lines = (body: string[]) => {
    const out: SafeHtml[] = [];
    let bullets: string[] = [];
    const flush = () => {
      if (bullets.length) out.push(html`<ul>${bullets.map((b) => html`<li>${b}</li>`)}</ul>`);
      bullets = [];
    };
    for (const line of body) {
      if (line.startsWith('•')) bullets.push(line.replace(/^•\s*/, ''));
      else {
        flush();
        out.push(html`<p>${line}</p>`);
      }
    }
    flush();
    return out;
  };
  return {
    head: { title: doc.title },
    body: html`<h1>${doc.title}</h1><p class="meta">Actualizado el ${doc.updated}</p>${lines(doc.intro)}${doc.sections.map(
      (s) => html`<h2>${s.heading}</h2>${lines(s.body)}`,
    )}`,
  };
}

export function appOnlyPage(appPath: string): Page {
  return {
    head: { title: 'Abre Cultuvilla', noindex: true },
    body: html`<h1>Esto está en la app</h1><p>Esta parte de Cultuvilla solo está disponible en la aplicación.</p>${appCta(appPath, 'Abrir en la app')}`,
  };
}

export function notFoundPage(): Page {
  return {
    status: 404,
    head: { title: 'No encontrado', noindex: true },
    body: html`<h1>No hemos encontrado esta página</h1><p>Puede que se haya borrado o que el enlace esté mal escrito.</p><p><a href="/">Ir al inicio</a></p>`,
  };
}

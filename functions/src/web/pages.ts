import { APP_STORES } from '@cultuvilla/shared/config';
import { LEGAL_DOCS } from '@cultuvilla/shared/legal';
import { villagePath, villageSectionPath } from '@cultuvilla/shared/utils';
import {
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
import { html, type Child, type SafeHtml } from './html';
import type { LegalPage, PublicSection } from './routes';
import { richText } from './richText';

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
    ? html`<img class="${cls ?? ''}" src="${src}" alt="${alt}" loading="lazy" onerror="this.onerror=null;this.src='${fallback}'"/>`
    : html`<img class="${cls ?? ''}" src="${src}" alt="${alt}" loading="lazy"/>`;
}

function cards(items: Card[]): SafeHtml {
  return html`<ul class="cards">${items.map(
    (c) => html`<li><a href="${c.href}">${img(c.imageUrl, '')}<span class="t">${c.title}</span>${
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

export function orgPage(v: Village, o: OrgView, appPath: string, invite: boolean): Page {
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
    body: html`${backTo(v)}${invite ? html`<div class="notice"><strong>Te han invitado a unirte a ${o.name}.</strong></div>` : null}${img(o.images[0] ?? null, o.name, 'hero')}<h1>${o.name}</h1><p class="meta">${facts}</p>${paragraphs(o.description)}${o.images.slice(1).map((u) => html`<p>${img(u, o.name)}</p>`)}${appCta(appPath, invite ? 'Únete desde la app' : `Sigue a ${o.name} en la app`)}`,
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

export function homePage(villages: Card[]): Page {
  return {
    head: { title: 'Cultuvilla', description: 'Las fiestas, eventos, noticias e historia de tu pueblo, en el móvil.' },
    body: html`<h1>La vida de tu pueblo, en tu bolsillo</h1><p>Fiestas, eventos, noticias, peñas, historia y vocabulario de los pueblos de España, contados por sus vecinos.</p>${appCta('/', 'Descarga la app')}${section('Pueblos en Cultuvilla', villages)}`,
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

import type { Firestore } from 'firebase-admin/firestore';
import { APP_STORES } from '@cultuvilla/shared/config';
import {
  entityPath,
  eventLinkTarget,
  festivalPosterLinkTarget,
  orgJoinPath,
  resolveStorePlatform,
  wordPath,
  type UrlEntityKind,
} from '@cultuvilla/shared/utils';
import {
  cardImage,
  loadBarrio,
  loadEvent,
  loadHistoryEntry,
  loadNews,
  loadOrg,
  loadPlace,
  loadPoster,
  loadSection,
  loadTerm,
  loadVillageById,
  loadVillageBySlug,
  loadVillageHome,
  loadWrapped,
  type Card,
  type Village,
} from './data';
import type { Page } from './document';
import {
  appOnlyPage,
  barrioPage,
  downloadPage,
  eventPage,
  historyPage,
  homePage,
  legalPage,
  newsPage,
  notFoundPage,
  orgPage,
  placePage,
  posterPage,
  sectionPage,
  villagePage,
  wordPage,
  wrappedPage,
} from './pages';
import { matchRoute, type WebRoute } from './routes';

export interface WebRequest {
  pathname: string;
  userAgent: string | null;
}

export type WebResponse =
  | { kind: 'page'; page: Page; path: string }
  /** Permanent for canonical paths, temporary for the UA-dependent store hand-off. */
  | { kind: 'redirect'; location: string; permanent: boolean };

export interface WebDeps {
  db: Firestore;
  bucket: string;
  now: Date;
}

const page = (p: Page, path: string): WebResponse => ({ kind: 'page', page: p, path });
const notFound = (path: string): WebResponse => page(notFoundPage(), path);

/** One URL per doc: a stale title slug or the wrong pueblo answers with a redirect. */
function canonical(requested: string, wanted: string, build: () => Page): WebResponse {
  return requested === wanted ? page(build(), wanted) : { kind: 'redirect', location: wanted, permanent: true };
}

async function villageOf(deps: WebDeps, municipalityId: string | null): Promise<Village | null> {
  return municipalityId ? loadVillageById(deps.db, municipalityId) : null;
}

async function entity(
  deps: WebDeps,
  route: Extract<WebRoute, { type: 'entity' } | { type: 'invite' }>,
  kind: UrlEntityKind,
  path: string,
): Promise<WebResponse> {
  const { db, bucket } = deps;
  const invite = route.type === 'invite';

  // Places and barrios live under their municipality, so the pueblo in the URL
  // is the only way to find them.
  if (kind === 'place' || kind === 'barrio') {
    const v = await loadVillageBySlug(db, route.villageSlug);
    if (!v) return notFound(path);
    if (kind === 'place') {
      const p = await loadPlace(db, v.id, route.id);
      return p ? canonical(path, entityPath('place', { id: p.id, title: p.name, villageSlug: v.slug }), () => placePage(v, p, path)) : notFound(path);
    }
    const b = await loadBarrio(db, v.id, route.id);
    return b ? canonical(path, entityPath('barrio', { id: b.id, title: b.name, villageSlug: v.slug }), () => barrioPage(v, b, path)) : notFound(path);
  }

  switch (kind) {
    case 'event': {
      const e = await loadEvent(db, route.id);
      const v = await villageOf(deps, e?.municipalityId ?? null);
      if (!e || !v) return notFound(path);
      const wanted = entityPath('event', eventLinkTarget({ id: e.id, title: e.title, villageSlug: v.slug, visibilityOrgId: e.private ? 'private' : null }));
      return canonical(path, wanted, () => eventPage(v, e, wanted));
    }
    case 'news': {
      const n = await loadNews(db, bucket, route.id);
      const v = await villageOf(deps, n?.municipalityId ?? null);
      if (!n || !v) return notFound(path);
      const wanted = entityPath('news', { id: n.id, title: n.title, villageSlug: v.slug });
      return canonical(path, wanted, () => newsPage(v, n, wanted));
    }
    case 'organization': {
      const o = await loadOrg(db, route.id);
      const v = await villageOf(deps, o?.municipalityId ?? null);
      if (!o || !v) return notFound(path);
      const target = { id: o.id, title: o.name, villageSlug: v.slug };
      const wanted = invite ? orgJoinPath(target) : entityPath('organization', target);
      return canonical(path, wanted, () => orgPage(v, o, wanted, invite));
    }
    case 'festivalPoster': {
      const p = await loadPoster(db, route.id);
      const v = await villageOf(deps, p?.municipalityId ?? null);
      if (!p || !v) return notFound(path);
      const wanted = entityPath('festivalPoster', festivalPosterLinkTarget({ id: p.id, title: p.title, year: p.year, villageSlug: v.slug }));
      return canonical(path, wanted, () => posterPage(v, p, wanted));
    }
    case 'historyEntry': {
      const h = await loadHistoryEntry(db, route.id);
      const v = await villageOf(deps, h?.municipalityId ?? null);
      if (!h || !v) return notFound(path);
      const wanted = entityPath('historyEntry', { id: h.id, title: h.title, villageSlug: v.slug });
      return canonical(path, wanted, () => historyPage(v, h, wanted));
    }
  }
}

async function activeVillageCards(db: Firestore): Promise<Card[]> {
  // Same shape as the sitemap's query — single-field, no composite index.
  // typed-refs: allowed — converter-less read; see the header of data.ts.
  const snap = await db.collection('municipalities').where('communityActive', '==', true).limit(60).get();
  return snap.docs
    .map((d) => ({
      href: `/${String(d.get('slug'))}`,
      title: String(d.get('name') ?? ''),
      subtitle: typeof d.get('province') === 'string' ? (d.get('province') as string) : null,
      imageUrl: cardImage((d.get('escudoManualUrl') as string | null) ?? (d.get('escudoUrl') as string | null) ?? null),
    }))
    .filter((c) => c.href !== '/undefined' && c.title)
    .sort((a, b) => a.title.localeCompare(b.title, 'es'));
}

export async function handle(req: WebRequest, deps: WebDeps): Promise<WebResponse> {
  const path = req.pathname.length > 1 ? req.pathname.replace(/\/+$/, '') : '/';
  const route = matchRoute(path);
  const { db, bucket } = deps;

  switch (route.type) {
    case 'home':
      return page(homePage(await activeVillageCards(db)), path);
    case 'download': {
      // The printed /descarga QR: a phone goes straight to its store.
      const platform = resolveStorePlatform(req.userAgent, 0);
      const store = platform ? APP_STORES[platform] : '';
      return store ? { kind: 'redirect', location: store, permanent: false } : page(downloadPage(), path);
    }
    case 'legal':
      return page(legalPage(route.page), path);
    case 'appOnly':
      return page(appOnlyPage(path), path);
    case 'notFound':
      return notFound(path);
    case 'village': {
      const v = await loadVillageBySlug(db, route.villageSlug);
      if (!v) return notFound(path);
      return page(villagePage(v, v.active ? await loadVillageHome(db, bucket, v, deps.now) : null), path);
    }
    case 'section': {
      const v = await loadVillageBySlug(db, route.villageSlug);
      return v ? page(sectionPage(v, await loadSection(db, v, route.section)), path) : notFound(path);
    }
    case 'word': {
      const v = await loadVillageBySlug(db, route.villageSlug);
      const found = v ? await loadTerm(db, v.id, route.termSlug) : null;
      if (!v || !found) return notFound(path);
      const wanted = wordPath(v.slug, found.term.slug);
      return canonical(path, wanted, () => wordPage(v, found.term, found.definitions, wanted));
    }
    case 'wrapped': {
      const v = await loadVillageBySlug(db, route.villageSlug);
      const w = v ? await loadWrapped(db, v.id, route.year) : null;
      return v && w ? page(wrappedPage(v, w, path), path) : notFound(path);
    }
    case 'entity':
      return entity(deps, route, route.kind, path);
    case 'invite':
      return entity(deps, route, 'organization', path);
  }
}


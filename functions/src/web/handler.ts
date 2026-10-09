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
  loadActiveVillages,
  loadBarrio,
  loadEvent,
  loadHistoryEntry,
  loadNews,
  loadOrg,
  loadOrgEventCards,
  loadPlace,
  loadPoster,
  loadSection,
  loadTerm,
  loadVillageById,
  loadVillageBySlug,
  loadVillageHome,
  loadWrapped,
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
  type Landing,
  legalPage,
  newsPage,
  notFoundPage,
  orgPage,
  placePage,
  posterPage,
  sectionPage,
  villagesPage,
  ambassadorsPage,
  ambassadorsThanksPage,
  villagePage,
  wordPage,
  wrappedPage,
} from './pages';
import { matchRoute, type WebRoute } from './routes';
import { searchPueblos, submitAmbassadorLead } from './ambassadorLead';

export interface WebRequest {
  pathname: string;
  userAgent: string | null;
  /** GET unless said otherwise; only /embajadores accepts a POST. */
  method?: string;
  /** The `q` search parameter, for the pueblo picker. */
  q?: string;
  /** A parsed form body. */
  body?: unknown;
  /** The visitor's address, only to throttle the form. */
  ip?: string;
}

export type WebResponse =
  /** `deviceDependent`: the answer differs by User-Agent, so the edge must not share it. */
  | { kind: 'page'; page: Page; path: string; deviceDependent?: true }
  /** Permanent for canonical paths, temporary for the UA-dependent store hand-off. */
  | { kind: 'redirect'; location: string; permanent: boolean; seeOther?: true }
  /** `maxAge` in seconds for the browser and the edge. */
  | { kind: 'json'; body: unknown; maxAge: number }
  /** A method this path does not take. */
  | { kind: 'methodNotAllowed'; allow: string };

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
      // A stale slug only redirects, so it never pays for the events query.
      const events = path === wanted ? await loadOrgEventCards(db, o.id, v.slug, deps.now) : [];
      return canonical(path, wanted, () => orgPage(v, o, wanted, invite, events));
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

/**
 * The pueblo the landing page shows as its worked example: the first of these
 * that is active, else the first active pueblo by name (dev and beta have no
 * Matabuena). An editorial pick, not a ranking — ranking by content would cost
 * a count query per pueblo on every home render.
 */
const SHOWCASE_VILLAGES = ['matabuena'];

async function loadLanding(deps: WebDeps): Promise<Landing> {
  const villages = await loadActiveVillages(deps.db);
  const featured = villages.find((v) => SHOWCASE_VILLAGES.includes(v.slug)) ?? (villages.length > 0 ? villages[0] : null);
  if (!featured) return { villages, showcase: null, wrapped: null };
  // This year's fiestas, or last year's until this year's summary is published.
  const year = deps.now.getUTCFullYear();
  const [home, thisYear, lastYear] = await Promise.all([
    loadVillageHome(deps.db, deps.bucket, featured, deps.now),
    loadWrapped(deps.db, featured.id, year),
    loadWrapped(deps.db, featured.id, year - 1),
  ]);
  const view = thisYear ?? lastYear;
  return { villages, showcase: { village: featured, home }, wrapped: view ? { village: featured, view } : null };
}

export async function handle(req: WebRequest, deps: WebDeps): Promise<WebResponse> {
  const path = req.pathname.length > 1 ? req.pathname.replace(/\/+$/, '') : '/';
  const route = matchRoute(path);
  const { db, bucket } = deps;
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD' && !(method === 'POST' && route.type === 'ambassadors')) {
    return { kind: 'methodNotAllowed', allow: route.type === 'ambassadors' ? 'GET, HEAD, POST' : 'GET, HEAD' };
  }

  switch (route.type) {
    case 'home':
      return page(homePage(await loadLanding(deps)), path);
    case 'villages':
      return page(villagesPage(await loadLanding(deps)), path);
    case 'ambassadors': {
      if (req.method !== 'POST') return page(ambassadorsPage(), path);
      const outcome = await submitAmbassadorLead(db, req.body, req.ip ?? 'unknown', deps.now);
      if (outcome.ok) return { kind: 'redirect', location: '/embajadores/gracias', permanent: false, seeOther: true };
      // The visitor's own answers come back to them, so the edge must never keep this page.
      return { kind: 'page', page: { ...ambassadorsPage(outcome), status: 400 }, path, deviceDependent: true };
    }
    case 'ambassadorsThanks':
      return page(ambassadorsThanksPage(), path);
    case 'ambassadorSearch':
      return { kind: 'json', body: await searchPueblos(db, req.q ?? ''), maxAge: 86400 };
    case 'download': {
      // The printed /descarga QR: a phone goes straight to its store.
      const platform = resolveStorePlatform(req.userAgent, 0);
      const store = platform ? APP_STORES[platform] : '';
      return store
        ? { kind: 'redirect', location: store, permanent: false }
        : { kind: 'page', page: downloadPage(), path, deviceDependent: true };
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


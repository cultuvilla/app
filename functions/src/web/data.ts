import type { Firestore } from 'firebase-admin/firestore';
import {
  entityPath,
  festivalPosterLinkTarget,
  formatDate,
  formatFestivalPosterDates,
  formatHistoryEntryDate,
  historicalCentury,
  historicalCenturyLabel,
  pickWordOfTheDay,
  variantImageURL,
  wordPath,
  type UrlEntityKind,
} from '@cultuvilla/shared/utils';
import { WRAPPED_CARDS, wrappedId } from '@cultuvilla/shared/models';
import { arr, bool, date, num, obj, str, strArr, type Raw } from './read';
import type { RichTextInput } from './richText';

/**
 * Everything the read site reads, and the single place that decides what an
 * anonymous visitor may see. Each loader re-applies the visibility the app's
 * rules and screens apply — `status`, private events, approved orgs — because
 * the Admin SDK bypasses firestore.rules entirely.
 *
 * Queries copy the app's own shapes exactly, so they ride indexes that already
 * exist; a new shape would put `firestore.indexes.json` into this change.
 */

const TZ = 'Europe/Madrid';

export interface Card {
  href: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
}

export interface Village {
  id: string;
  name: string;
  slug: string;
  province: string | null;
  escudoUrl: string | null;
  /** The pueblo has a Cultuvilla community; an inactive one is a bare municipality. */
  active: boolean;
  description: string | null;
  lat: number | null;
  lng: number | null;
  locationLabel: string | null;
}

function toVillage(id: string, d: Raw): Village {
  const coords = obj(d['coordinates']);
  return {
    id,
    name: str(d['name']) ?? '',
    slug: str(d['slug']) ?? '',
    province: str(d['province']),
    escudoUrl: str(d['escudoManualUrl']) ?? str(d['escudoUrl']),
    active: bool(d['communityActive']),
    description: str(obj(d['community'])?.['description']),
    lat: num(coords?.['lat']),
    lng: num(coords?.['lng']),
    locationLabel: str(d['locationLabel']),
  };
}

export async function loadVillageBySlug(db: Firestore, slug: string): Promise<Village | null> {
  // typed-refs: allowed — converter-less read; see the header of data.ts.
  const snap = await db.collection('municipalities').where('slug', '==', slug).limit(1).get();
  const [doc] = snap.docs;
  return snap.empty ? null : toVillage(doc.id, doc.data());
}

export async function loadVillageById(db: Firestore, id: string): Promise<Village | null> {
  // typed-refs: allowed — converter-less read; see the header of data.ts.
  const snap = await db.collection('municipalities').doc(id).get();
  return snap.exists ? toVillage(snap.id, snap.data() ?? {}) : null;
}

/** Card-sized image; the app writes `_card` variants for its own uploads. */
export function cardImage(url: string | null): string | null {
  return variantImageURL(url, 'card');
}

// ── Events ──────────────────────────────────────────────────────────────────

export interface EventView {
  id: string;
  title: string;
  description: string | null;
  start: Date | null;
  end: Date | null;
  locationName: string | null;
  imageUrl: string | null;
  cancelled: boolean;
  /** Org-only event: the page withholds everything but the fact it exists. */
  private: boolean;
  municipalityId: string | null;
}

const LISTED_EVENT_STATUSES = ['published', 'completed'];
const VISIBLE_EVENT_STATUSES = [...LISTED_EVENT_STATUSES, 'cancelled'];

function toEvent(id: string, d: Raw): EventView {
  return {
    id,
    title: str(d['title']) ?? '',
    description: str(d['description']),
    start: date(d['startDate']),
    end: date(d['endDate']),
    locationName: str(obj(d['location'])?.['displayName']),
    imageUrl: str(d['imageURL']) ?? str(d['villageCoverImage']),
    cancelled: d['status'] === 'cancelled',
    private: d['visibility'] === 'private' || str(d['visibilityOrgId']) !== null,
    municipalityId: str(d['municipalityId']),
  };
}

export async function loadEvent(db: Firestore, id: string): Promise<EventView | null> {
  // typed-refs: allowed — converter-less read; see the header of data.ts.
  const snap = await db.collection('events').doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data() ?? {};
  if (!VISIBLE_EVENT_STATUSES.includes(String(d['status']))) return null;
  return toEvent(snap.id, d);
}

export function eventWhen(e: Pick<EventView, 'start' | 'end'>): string | null {
  if (!e.start) return null;
  const start = `${formatDate(e.start, 'long', TZ)}, ${formatDate(e.start, 'time', TZ)}`;
  if (!e.end || formatDate(e.end, 'short', TZ) === formatDate(e.start, 'short', TZ)) return start;
  return `${start} – ${formatDate(e.end, 'long', TZ)}`;
}

function eventCard(e: EventView, villageSlug: string): Card {
  return {
    href: entityPath('event', { id: e.id, title: e.title, villageSlug }),
    title: e.title,
    subtitle: e.start ? formatDate(e.start, 'dayMonth', TZ) : null,
    imageUrl: cardImage(e.imageUrl),
  };
}

// ── News ────────────────────────────────────────────────────────────────────

export type NewsBlockView =
  | { type: 'text'; style: 'paragraph' | 'section' | 'subsection'; rich: RichTextInput }
  | { type: 'image'; url: string; caption: RichTextInput | null };

export interface NewsView {
  id: string;
  title: string;
  category: string | null;
  publishedAt: Date | null;
  coverUrl: string | null;
  blocks: NewsBlockView[];
  municipalityId: string | null;
}

/**
 * News images are stored by path, not URL. `news/{postId}/images/*` is public
 * in storage.rules, so the plain media URL needs no token or signature.
 */
export function storageMediaUrl(bucket: string, path: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
}

function toNews(id: string, d: Raw, bucket: string): NewsView {
  const imagePath = (value: unknown) => str(obj(value)?.['storagePath']);
  const cover = imagePath(d['coverImage']) ?? imagePath(arr(d['images'])[0]);
  const blocks: NewsBlockView[] = arr(d['content']).flatMap((raw): NewsBlockView[] => {
    const b = obj(raw);
    if (!b) return [];
    if (b['type'] === 'text') {
      const text = str(b['text']);
      if (!text) return [];
      const style = b['style'] === 'section' || b['style'] === 'subsection' ? b['style'] : 'paragraph';
      return [{ type: 'text', style, rich: { text, mentions: b['mentions'], links: b['links'], marks: b['marks'] } }];
    }
    if (b['type'] === 'image') {
      const path = str(b['storagePath']);
      if (!path) return [];
      const caption = str(b['caption']);
      return [
        {
          type: 'image',
          url: storageMediaUrl(bucket, path),
          caption: caption
            ? { text: caption, mentions: b['captionMentions'], links: b['captionLinks'], marks: b['captionMarks'] }
            : null,
        },
      ];
    }
    return [];
  });
  // Posts written before block content carry a plain `body`.
  const legacy = str(d['body']);
  if (blocks.length === 0 && legacy) blocks.push({ type: 'text', style: 'paragraph', rich: { text: legacy } });
  return {
    id,
    title: str(d['title']) ?? '',
    category: str(d['category']),
    publishedAt: date(d['publishedAt']) ?? date(d['createdAt']),
    coverUrl: cover ? storageMediaUrl(bucket, cover) : null,
    blocks,
    municipalityId: str(d['municipalityId']),
  };
}

export async function loadNews(db: Firestore, bucket: string, id: string): Promise<NewsView | null> {
  // typed-refs: allowed — converter-less read; see the header of data.ts.
  const snap = await db.collection('news').doc(id).get();
  if (!snap.exists || snap.get('status') !== 'active') return null;
  return toNews(snap.id, snap.data() ?? {}, bucket);
}

function newsCard(n: NewsView, villageSlug: string): Card {
  return {
    href: entityPath('news', { id: n.id, title: n.title, villageSlug }),
    title: n.title,
    subtitle: n.publishedAt ? formatDate(n.publishedAt, 'dayMonth', TZ) : null,
    imageUrl: n.coverUrl,
  };
}

// ── Organizations ───────────────────────────────────────────────────────────

export interface OrgView {
  id: string;
  name: string;
  description: string | null;
  images: string[];
  type: string | null;
  memberCount: number | null;
  municipalityId: string | null;
}

function toOrg(id: string, d: Raw): OrgView {
  return {
    id,
    name: str(d['name']) ?? '',
    description: str(d['description']),
    images: strArr(d['images']),
    type: str(d['type']),
    memberCount: num(d['memberCount']),
    municipalityId: str(d['municipalityId']),
  };
}

export async function loadOrg(db: Firestore, id: string): Promise<OrgView | null> {
  // typed-refs: allowed — converter-less read; see the header of data.ts.
  const snap = await db.collection('organizations').doc(id).get();
  // Pending and rejected orgs are readable by id in the app; the web shows only approved ones.
  if (!snap.exists || snap.get('status') !== 'approved') return null;
  return toOrg(snap.id, snap.data() ?? {});
}

function orgCard(o: OrgView, villageSlug: string): Card {
  return {
    href: entityPath('organization', { id: o.id, title: o.name, villageSlug }),
    title: o.name,
    subtitle: o.memberCount ? `${String(o.memberCount)} miembros` : null,
    imageUrl: cardImage(o.images[0] ?? null),
  };
}

// ── Places & barrios (subcollections of the municipality) ──────────────────

export interface PlaceView {
  id: string;
  name: string;
  kind: string | null;
  description: string | null;
  images: string[];
  locationLabel: string | null;
}

export interface BarrioView {
  id: string;
  name: string;
  kind: string | null;
  images: string[];
  residentCount: number | null;
}

function toPlace(id: string, d: Raw): PlaceView {
  return {
    id,
    name: str(d['name']) ?? '',
    kind: str(d['kind']),
    description: str(d['description']),
    images: strArr(d['images']),
    locationLabel: str(d['locationLabel']),
  };
}

function toBarrio(id: string, d: Raw): BarrioView {
  return {
    id,
    name: str(d['name']) ?? '',
    kind: str(d['kind']),
    images: strArr(d['images']),
    residentCount: num(d['residentCount']),
  };
}

async function loadActiveSubdoc<T>(
  db: Firestore,
  municipalityId: string,
  collection: 'places' | 'barrios',
  id: string,
  map: (id: string, d: Raw) => T,
): Promise<T | null> {
  // typed-refs: allowed — converter-less read; see the header of data.ts.
  const snap = await db.collection('municipalities').doc(municipalityId).collection(collection).doc(id).get();
  // Readable by anyone in the rules, so the status gate is ours to apply.
  if (!snap.exists || snap.get('status') !== 'active') return null;
  return map(snap.id, snap.data() ?? {});
}

export const loadPlace = (db: Firestore, municipalityId: string, id: string) =>
  loadActiveSubdoc(db, municipalityId, 'places', id, toPlace);

export const loadBarrio = (db: Firestore, municipalityId: string, id: string) =>
  loadActiveSubdoc(db, municipalityId, 'barrios', id, toBarrio);

// ── Festival posters ────────────────────────────────────────────────────────

export interface PosterView {
  id: string;
  title: string | null;
  year: number;
  datesLabel: string | null;
  images: string[];
  municipalityId: string | null;
}

function toPoster(id: string, d: Raw): PosterView {
  const year = num(d['year']) ?? 0;
  const precision = d['datePrecision'] === 'month' || d['datePrecision'] === 'day' ? d['datePrecision'] : 'year';
  return {
    id,
    title: str(d['title']),
    year,
    datesLabel: formatFestivalPosterDates({
      year,
      datePrecision: precision,
      startsAt: date(d['startsAt']),
      endsAt: date(d['endsAt']),
    }),
    images: strArr(d['images']),
    municipalityId: str(d['municipalityId']),
  };
}

export async function loadPoster(db: Firestore, id: string): Promise<PosterView | null> {
  // typed-refs: allowed — converter-less read; see the header of data.ts.
  const snap = await db.collection('festivalPosters').doc(id).get();
  if (!snap.exists || snap.get('status') !== 'active') return null;
  return toPoster(snap.id, snap.data() ?? {});
}

export function posterTitle(p: Pick<PosterView, 'title' | 'year'>): string {
  return p.title ?? `Cartel de fiestas ${String(p.year)}`;
}

function posterCard(p: PosterView, villageSlug: string): Card {
  return {
    href: entityPath('festivalPoster', festivalPosterLinkTarget({ ...p, villageSlug })),
    title: posterTitle(p),
    subtitle: p.datesLabel ?? String(p.year),
    imageUrl: cardImage(p.images[0] ?? null),
  };
}

// ── History ─────────────────────────────────────────────────────────────────

export interface HistoryView {
  id: string;
  title: string;
  dateLabel: string;
  century: string | null;
  images: { url: string; caption: string | null }[];
  body: RichTextInput | null;
  sources: string | null;
  municipalityId: string | null;
}

interface HistoricalDate {
  year: number;
  month: number | null;
  day: number | null;
}

function historicalDate(value: unknown): HistoricalDate | null {
  const d = obj(value);
  const year = num(d?.['year']);
  return year === null ? null : { year, month: num(d?.['month']), day: num(d?.['day']) };
}

function toHistory(id: string, d: Raw): HistoryView {
  const start = historicalDate(d['start']);
  const body = obj(d['body']);
  const text = str(body?.['text']);
  return {
    id,
    title: str(d['title']) ?? '',
    dateLabel: start
      ? formatHistoryEntryDate({ start, end: historicalDate(d['end']), approximate: bool(d['approximate']) })
      : '',
    century: start ? historicalCenturyLabel(historicalCentury(start.year)) : null,
    images: arr(d['images']).flatMap((raw) => {
      const url = str(obj(raw)?.['url']);
      return url ? [{ url, caption: str(obj(raw)?.['caption']) }] : [];
    }),
    body: text ? { text, mentions: body?.['mentions'], links: body?.['links'], marks: body?.['marks'] } : null,
    sources: str(d['sources']),
    municipalityId: str(d['municipalityId']),
  };
}

export async function loadHistoryEntry(db: Firestore, id: string): Promise<HistoryView | null> {
  // typed-refs: allowed — converter-less read; see the header of data.ts.
  const snap = await db.collection('historyEntries').doc(id).get();
  if (!snap.exists || snap.get('status') !== 'active') return null;
  return toHistory(snap.id, snap.data() ?? {});
}

// ── Vocabulary ──────────────────────────────────────────────────────────────

export interface TermView {
  id: string;
  slug: string;
  term: string;
  kind: string | null;
}

export interface DefinitionView {
  definition: string;
  example: string | null;
  castellano: string | null;
}

function toTerm(id: string, d: Raw): TermView {
  return { id, slug: id.slice(id.lastIndexOf('__') + 2), term: str(d['term']) ?? '', kind: str(d['kind']) };
}

export async function loadTerm(
  db: Firestore,
  municipalityId: string,
  slug: string,
): Promise<{ term: TermView; definitions: DefinitionView[] } | null> {
  // typed-refs: allowed — converter-less read; see the header of data.ts.
  const snap = await db.collection('vocabularyTerms').doc(`${municipalityId}__${slug}`).get();
  if (!snap.exists || snap.get('status') !== 'active') return null;
  return { term: toTerm(snap.id, snap.data() ?? {}), definitions: await loadDefinitions(db, snap.id) };
}

async function loadDefinitions(db: Firestore, termId: string): Promise<DefinitionView[]> {
  const snap = await db
    .collection('vocabularyDefinitions')
    .where('termId', '==', termId)
    .where('status', '==', 'active')
    .orderBy('createdAt', 'asc')
    .get();
  return snap.docs.flatMap((doc) => {
    const definition = str(doc.get('definition'));
    return definition
      ? [{ definition, example: str(doc.get('example')), castellano: str(doc.get('castellano')) }]
      : [];
  });
}

// ── Fiestas Wrapped ─────────────────────────────────────────────────────────

export interface WrappedView {
  year: number;
  /** The rendered cards in display order, cover first. */
  images: string[];
  eventCount: number | null;
  personCount: number | null;
}

/** Only a published Wrapped: a draft is its village admins' to release. */
export async function loadWrapped(db: Firestore, municipalityId: string, year: number): Promise<WrappedView | null> {
  // typed-refs: allowed — converter-less read; see the header of data.ts.
  const snap = await db.collection('villageWrapped').doc(wrappedId(municipalityId, year)).get();
  if (!snap.exists || snap.get('status') !== 'published') return null;
  const images = obj(snap.get('images')) ?? {};
  const stats = obj(snap.get('stats')) ?? {};
  return {
    year,
    images: WRAPPED_CARDS.flatMap((card) => {
      const url = str(images[card]);
      return url ? [url] : [];
    }),
    eventCount: num(stats['eventCount']),
    personCount: num(stats['uniquePersonCount']),
  };
}

// ── Village-wide lists ──────────────────────────────────────────────────────

const byMunicipality = (db: Firestore, collection: string, municipalityId: string) =>
  db.collection(collection).where('municipalityId', '==', municipalityId);

async function listEvents(db: Firestore, m: string): Promise<EventView[]> {
  const snap = await byMunicipality(db, 'events', m)
    .where('visibility', '==', 'public')
    .where('status', 'in', LISTED_EVENT_STATUSES)
    .orderBy('startDate', 'asc')
    .get();
  return snap.docs.map((d) => toEvent(d.id, d.data()));
}

const HOME_LIMIT = 12;

/**
 * An organization's public events as cards, in the app's order. Status is
 * filtered in memory: the query rides the visibility + organizerOrgIds +
 * startDate index, and a status filter would need another.
 */
export async function loadOrgEventCards(db: Firestore, orgId: string, villageSlug: string, now: Date): Promise<Card[]> {
  const snap = await db
    .collection('events')
    .where('visibility', '==', 'public')
    .where('organizerOrgIds', 'array-contains', orgId)
    .orderBy('startDate', 'asc')
    .get();
  const events = snap.docs
    .filter((d) => LISTED_EVENT_STATUSES.includes(str(d.get('status')) ?? ''))
    .map((d) => toEvent(d.id, d.data()));
  return orderEvents(events, now).slice(0, HOME_LIMIT).map((e) => eventCard(e, villageSlug));
}

async function listNews(db: Firestore, bucket: string, m: string, limit: number): Promise<NewsView[]> {
  const snap = await byMunicipality(db, 'news', m)
    .where('status', '==', 'active')
    .orderBy('publishedAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((d) => toNews(d.id, d.data(), bucket));
}

async function listPosters(db: Firestore, m: string): Promise<PosterView[]> {
  const snap = await byMunicipality(db, 'festivalPosters', m).where('status', '==', 'active').orderBy('year', 'desc').get();
  return snap.docs.map((d) => toPoster(d.id, d.data()));
}

async function listOrgs(db: Firestore, m: string): Promise<OrgView[]> {
  const snap = await byMunicipality(db, 'organizations', m).where('status', '==', 'approved').orderBy('name', 'asc').get();
  return snap.docs.map((d) => toOrg(d.id, d.data())).sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0));
}

async function listSub<T>(db: Firestore, m: string, collection: 'places' | 'barrios', map: (id: string, d: Raw) => T) {
  const snap = await db
    .collection('municipalities')
    .doc(m)
    .collection(collection)
    .where('status', '==', 'active')
    .orderBy('name', 'asc')
    .get();
  return snap.docs.map((d) => map(d.id, d.data()));
}

async function listHistory(db: Firestore, m: string): Promise<HistoryView[]> {
  const snap = await byMunicipality(db, 'historyEntries', m).where('status', '==', 'active').orderBy('sortKey', 'desc').get();
  return snap.docs.map((d) => toHistory(d.id, d.data()));
}

async function listTerms(db: Firestore, m: string): Promise<TermView[]> {
  const snap = await byMunicipality(db, 'vocabularyTerms', m).where('status', '==', 'active').orderBy('normalized', 'asc').get();
  return snap.docs.map((d) => toTerm(d.id, d.data()));
}

/** Upcoming first (soonest first), then past (most recent first) — the app's order. */
export function orderEvents(events: EventView[], now: Date): EventView[] {
  const ends = (e: EventView) => (e.end ?? e.start)?.getTime() ?? 0;
  const upcoming = events.filter((e) => ends(e) >= now.getTime());
  const past = events.filter((e) => ends(e) < now.getTime()).reverse();
  return [...upcoming, ...past];
}

export interface VillageHome {
  events: Card[];
  news: Card[];
  posters: Card[];
  orgs: Card[];
  places: Card[];
  barrios: Card[];
  history: Card[];
  word: { term: TermView; definition: DefinitionView | null; href: string } | null;
}

export async function loadVillageHome(db: Firestore, bucket: string, v: Village, now: Date): Promise<VillageHome> {
  const [events, news, posters, orgs, places, barrios, history, terms] = await Promise.all([
    listEvents(db, v.id),
    listNews(db, bucket, v.id, 10),
    listPosters(db, v.id),
    listOrgs(db, v.id),
    listSub(db, v.id, 'places', toPlace),
    listSub(db, v.id, 'barrios', toBarrio),
    listHistory(db, v.id),
    listTerms(db, v.id),
  ]);
  const picked = pickWordOfTheDay(terms, v.id, now);
  const word = picked
    ? {
        term: picked,
        definition: (await loadDefinitions(db, picked.id))[0] ?? null,
        href: wordPath(v.slug, picked.slug),
      }
    : null;
  const slug = v.slug;
  return {
    events: orderEvents(events, now).slice(0, HOME_LIMIT).map((e) => eventCard(e, slug)),
    news: news.map((n) => newsCard(n, slug)),
    posters: posters.slice(0, HOME_LIMIT).map((p) => posterCard(p, slug)),
    orgs: orgs.slice(0, HOME_LIMIT).map((o) => orgCard(o, slug)),
    places: places.slice(0, HOME_LIMIT).map((p) => placeCard(p, slug)),
    barrios: barrios.slice(0, HOME_LIMIT).map((b) => barrioCard(b, slug)),
    history: history.slice(0, HOME_LIMIT).map((h) => historyCard(h, slug)),
    word,
  };
}

function placeCard(p: PlaceView, villageSlug: string): Card {
  return {
    href: entityPath('place', { id: p.id, title: p.name, villageSlug }),
    title: p.name,
    subtitle: null,
    imageUrl: cardImage(p.images[0] ?? null),
  };
}

function barrioCard(b: BarrioView, villageSlug: string): Card {
  return {
    href: entityPath('barrio', { id: b.id, title: b.name, villageSlug }),
    title: b.name,
    subtitle: b.residentCount ? `${String(b.residentCount)} vecinos` : null,
    imageUrl: cardImage(b.images[0] ?? null),
  };
}

function historyCard(h: HistoryView, villageSlug: string): Card {
  return {
    href: entityPath('historyEntry', { id: h.id, title: h.title, villageSlug }),
    title: h.title,
    subtitle: h.dateLabel || null,
    imageUrl: cardImage(h.images[0]?.url ?? null),
  };
}

export type SectionData =
  | { section: 'carteles'; cards: Card[] }
  | { section: 'lugares'; cards: Card[] }
  | { section: 'entidades'; cards: Card[] }
  | { section: 'barrios'; cards: Card[] }
  | { section: 'historia'; groups: { label: string; cards: Card[] }[] }
  | { section: 'vocabulario'; terms: { term: string; kind: string | null; href: string }[] };

export async function loadSection(db: Firestore, v: Village, section: SectionData['section']): Promise<SectionData> {
  switch (section) {
    case 'carteles':
      return { section, cards: (await listPosters(db, v.id)).map((p) => posterCard(p, v.slug)) };
    case 'lugares':
      return { section, cards: (await listSub(db, v.id, 'places', toPlace)).map((p) => placeCard(p, v.slug)) };
    case 'entidades':
      return { section, cards: (await listOrgs(db, v.id)).map((o) => orgCard(o, v.slug)) };
    case 'barrios':
      return { section, cards: (await listSub(db, v.id, 'barrios', toBarrio)).map((b) => barrioCard(b, v.slug)) };
    case 'historia': {
      const groups: { label: string; cards: Card[] }[] = [];
      for (const h of await listHistory(db, v.id)) {
        const label = h.century ?? '';
        const last = groups[groups.length - 1];
        if (groups.length > 0 && last.label === label) last.cards.push(historyCard(h, v.slug));
        else groups.push({ label, cards: [historyCard(h, v.slug)] });
      }
      return { section, groups };
    }
    case 'vocabulario':
      return {
        section,
        terms: (await listTerms(db, v.id)).map((t) => ({ term: t.term, kind: t.kind, href: wordPath(v.slug, t.slug) })),
      };
  }
}

/** The path each entity lives at today — a stale slug or wrong pueblo is redirected here. */
export function canonicalEntityPath(kind: UrlEntityKind, id: string, title: string, villageSlug: string): string {
  return entityPath(kind, { id, title, villageSlug });
}

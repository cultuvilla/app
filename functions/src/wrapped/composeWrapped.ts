import { aggregateWrapped, cartelHistory, type WrappedAggregate } from '@cultuvilla/shared/wrapped';
import type { WrappedBlock, WrappedCard } from '@cultuvilla/shared/models';
import { webOriginForProject, wrappedPath } from '@cultuvilla/shared/utils';
import type { GatheredWrapped } from './gatherInputs';
import {
  coverCard, eventsCard, newsCard, organizersCard, peopleCard, postersCard, statsCard,
  MAX_EVENT_TILES, POSTER_ASPECT, eventTileImageHeight, type CardContext,
} from './render/cards';
import { fixedAspectGrid, hexLayout, mosaicLayout } from './render/layout';
import { IMAGE_CONCURRENCY, loadImages } from './render/images';
import { renderImage, type ImageFormat } from './render/renderCard';
import type { SatoriNode } from './render/h';
import { CARD_WIDTH, GUTTER } from './render/theme';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const TZ = 'Europe/Madrid';

function madridParts(d: Date): { day: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, day: 'numeric', month: 'numeric' }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { day: get('day'), month: get('month') };
}

/** "14 – 28 de agosto", or "30 de julio – 2 de agosto" across a month boundary. */
export function formatDateRange(start: Date, end: Date): string {
  const a = madridParts(start);
  const b = madridParts(end);
  if (a.month === b.month) return `${String(a.day)} – ${String(b.day)} de ${MONTHS[b.month - 1]}`;
  return `${String(a.day)} de ${MONTHS[a.month - 1]} – ${String(b.day)} de ${MONTHS[b.month - 1]}`;
}

function shortDate(d: Date): string {
  const p = madridParts(d);
  return `${String(p.day)} ${MONTHS[p.month - 1].slice(0, 3)}`;
}

/**
 * The address printed on the cards: the project's public host and the
 * Wrapped's path, without the scheme nobody reads off an image.
 */
export function cardLink(projectId: string | undefined, villageSlug: string | null, year: number): string | null {
  if (!villageSlug) return null;
  return `${webOriginForProject(projectId).replace(/^https?:\/\//, '')}${wrappedPath(villageSlug, year)}`;
}

/** Which encoding each card ships in — see `renderImage`. */
export const CARD_FORMATS: Record<WrappedCard, ImageFormat> = {
  cover: 'png',
  stats: 'png',
  events: 'jpeg',
  news: 'jpeg',
  people: 'jpeg',
  organizers: 'png',
  posters: 'jpeg',
};

export interface ComposedWrapped {
  aggregate: WrappedAggregate;
  /** A card with nothing to show — the articles card in a year with none — is absent. */
  images: Partial<Record<WrappedCard, { format: ImageFormat; bytes: Buffer }>>;
}

/**
 * Aggregate, fetch the images each card needs at the size it draws them, and
 * render the cards.
 *
 * Images are fetched at their RENDERED size: the layout is computed first so a
 * 60px bubble never pulls a 4MB photo. Every fetch is failure-tolerant (see
 * `loadImage`), so a dead URL costs one tile its photo, not the Wrapped.
 */
export async function composeWrapped(
  gathered: GatheredWrapped,
  /** The fiesta blocks shown on the cover, in date order. */
  meta: { blocks: Pick<WrappedBlock, 'name' | 'start' | 'end'>[]; year: number; link?: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<ComposedWrapped> {
  const aggregate = aggregateWrapped(gathered.inputs);
  const ctx: CardContext = {
    villageName: gathered.villageName,
    year: meta.year,
    blocks: meta.blocks.map((b) => ({ name: b.name, dateRange: formatDateRange(b.start, b.end) })),
    link: meta.link ?? null,
  };

  const bodyWidth = CARD_WIDTH - GUTTER * 2;
  const participants = new Set(aggregate.participantPersonIds);
  // Participants first, so a village's engaged core reads as one block of the
  // wall rather than being scattered through it. Alphabetical within each group
  // keeps a recompute from reshuffling anyone.
  const people = [...gathered.people].sort(
    (a, b) =>
      Number(participants.has(b.personId)) - Number(participants.has(a.personId)) ||
      a.displayName.localeCompare(b.displayName, 'es'),
  );
  const bubble = hexLayout(people.length, bodyWidth, 1320).diameter;

  const shownEvents = aggregate.countedEvents.slice(0, MAX_EVENT_TILES);
  const tile = mosaicLayout(shownEvents.length, bodyWidth, 1300, 14, 0.92);

  const shownNews = gathered.news.slice(0, MAX_EVENT_TILES);
  const newsTile = mosaicLayout(shownNews.length, bodyWidth, 1300, 14, 0.92);

  const orgs = aggregate.topOrganizations;
  const orgPeople = aggregate.topOrganizers;

  const archive = cartelHistory(gathered.posters, meta.year);
  const poster = fixedAspectGrid(archive.ordered.length, bodyWidth, 1250, 8, POSTER_ASPECT);

  const jobs = [
    { url: gathered.escudoUrl, width: 240, height: 240 },
    ...people.map((p) => ({ url: p.photoURL, width: bubble * 2, height: bubble * 2 })),
    ...shownEvents.map((e) => ({
      url: e.imageURL,
      width: tile.tileWidth * 2,
      height: eventTileImageHeight(tile.tileHeight) * 2,
      anchor: 'top' as const,
    })),
    ...shownNews.map((n) => ({
      url: n.imageURL,
      width: newsTile.tileWidth * 2,
      height: eventTileImageHeight(newsTile.tileHeight) * 2,
    })),
    ...orgs.map((o) => ({ url: o.imageURL, width: 260, height: 260 })),
    ...orgPeople.map((p) => ({ url: p.photoURL, width: 180, height: 180 })),
    ...archive.ordered.map((p) => ({ url: p.imageURL, width: poster.tileWidth * 2, height: poster.tileHeight * 2 })),
  ];
  const images = await loadImages(jobs, IMAGE_CONCURRENCY, fetchImpl);
  let cursor = 0;
  const take = (n: number) => images.slice(cursor, (cursor += n));
  const [escudo] = take(1);
  const personImages = take(people.length);
  const eventImages = take(shownEvents.length);
  const newsImages = take(shownNews.length);
  const orgImages = take(orgs.length);
  const organizerImages = take(orgPeople.length);
  const posterImages = take(archive.ordered.length);

  const trees: Partial<Record<WrappedCard, SatoriNode>> = {
    cover: coverCard(ctx, escudo),
    people: peopleCard(
      ctx,
      people.map((p, i) => ({ name: p.displayName, photo: personImages[i], participant: participants.has(p.personId) })),
      aggregate.stats.censoParticipantCount,
    ),
    events: eventsCard(
      ctx,
      aggregate.countedEvents.map((e, i) => ({
        title: e.title,
        dateLabel: shortDate(e.startDate),
        image: i < eventImages.length ? eventImages[i] : null,
      })),
    ),
    news:
      gathered.news.length > 0
        ? newsCard(
            ctx,
            gathered.news.map((n, i) => ({
              title: n.title,
              dateLabel: shortDate(n.publishedAt),
              image: i < newsImages.length ? newsImages[i] : null,
            })),
          )
        : undefined,
    organizers: organizersCard(
      ctx,
      orgs.map((o, i) => ({ name: o.name, count: o.eventCount, image: orgImages[i] })),
      orgPeople.map((p, i) => ({ name: p.displayName, count: p.eventCount, image: organizerImages[i] })),
    ),
    stats: statsCard(ctx, aggregate.stats, aggregate.fullestEvent),
    posters: postersCard(
      ctx,
      archive.ordered.map((p, i) => ({ year: p.year, image: posterImages[i], isThisYear: p.year === meta.year })),
      {
        firstYear: archive.firstYear,
        spanYears: archive.spanYears,
        yearsWithCartel: archive.yearsWithCartel,
        thisYearCount: archive.thisYear.length,
      },
    ),
  };

  const entries = await Promise.all(
    (Object.entries(trees) as [WrappedCard, SatoriNode | undefined][]).flatMap(([card, tree]) => {
      if (!tree) return [];
      const format = CARD_FORMATS[card];
      return [(async () => [card, { format, bytes: await renderImage(tree, format) }] as const)()];
    }),
  );
  return { aggregate, images: Object.fromEntries(entries) };
}

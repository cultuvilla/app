import type { WrappedStats } from '@cultuvilla/shared/models';
import { h, type SatoriNode } from './h';
import { CARD_HEIGHT, CARD_WIDTH, GUTTER, colors } from './theme';
import { copy } from './copy';
import { fitFontSize, fixedAspectGrid, hexLayout, mosaicLayout } from './layout';
import { colorFor, initials } from './images';
import { brandMark } from './brand/brandMark';

/**
 * Satori element trees for the Wrapped cards. Satori renders a subset of
 * CSS: every element with more than one child must be `display: flex`, and all
 * text must sit directly inside an element. The trees are plain objects built
 * with `h()` rather than JSX.
 */

export interface CardContext {
  villageName: string;
  year: number;
  /** The fiestas blocks this Wrapped covers, in date order. Names are free text
   *  a village admin types ("Santiago", "Carmen"); dates are pre-formatted,
   *  e.g. "14 – 28 de agosto". */
  blocks: { name: string; dateRange: string }[];
  /** Where this Wrapped lives, scheme-less (`cultuvilla.es/matabuena/fiestas/2026`).
   *  Printed on every card: a card forwarded on its own — a WhatsApp status,
   *  an Instagram story — carries no link, so it has to carry its own way back.
   *  Null when the pueblo has no slug to address it by. */
  link: string | null;
}

function signOff(ctx: CardContext, mark: SatoriNode, linkSize: number): SatoriNode {
  if (!ctx.link) return mark;
  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: Math.round(linkSize * 0.4) } },
    mark,
    text(ctx.link, { fontSize: linkSize, color: colors.muted }),
  );
}

const HEADER_HEIGHT = 380;
const FOOTER_HEIGHT = 130;
const BODY_TOP = HEADER_HEIGHT;
const BODY_HEIGHT = CARD_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT;
const BODY_WIDTH = CARD_WIDTH - GUTTER * 2;

function text(value: string, style: Record<string, unknown>): SatoriNode {
  return h('div', { style: { display: 'flex', ...style } }, value);
}

/** Shared chrome: dark ground, kicker + title at the top, pueblo and year at the foot. */
function frame(ctx: CardContext, header: { kicker: string; title: string; subtitle?: string }, body: SatoriNode): SatoriNode {
  return h(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: colors.ground,
        color: colors.ink,
        fontFamily: 'Archivo',
        position: 'relative',
      },
    },
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          height: HEADER_HEIGHT,
          padding: `0 ${String(GUTTER)}px 44px`,
        },
      },
      text(header.kicker.toUpperCase(), { fontSize: 28, fontWeight: 600, letterSpacing: 5, color: colors.accentSoft }),
      text(header.title, {
        fontSize: fitFontSize(header.title, BODY_WIDTH, 104),
        fontWeight: 800,
        lineHeight: 1,
        marginTop: 14,
        letterSpacing: -2,
      }),
      header.subtitle ? text(header.subtitle, { fontSize: 38, color: colors.inkDim, marginTop: 16 }) : null,
    ),
    body,
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'absolute',
          left: GUTTER,
          right: GUTTER,
          bottom: 0,
          height: FOOTER_HEIGHT,
          borderTop: `2px solid ${colors.line}`,
        },
      },
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        text(ctx.villageName, { fontSize: 32, fontWeight: 700 }),
        text(copy.fiestasYear(ctx.year), { fontSize: 26, color: colors.muted, marginTop: 4 }),
      ),
      signOff(ctx, brandMark(30), 22),
    ),
  );
}

// ── cover ────────────────────────────────────────────────────────────────

/** The escudo and the Cultuvilla icon are drawn at the same size, top and bottom of the cover. */
const COVER_BADGE = 120;

export function coverCard(ctx: CardContext, escudo: string | null): SatoriNode {
  const village = ctx.villageName.toUpperCase();
  return h(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        padding: `${String(GUTTER * 1.6)}px ${String(GUTTER)}px ${String(GUTTER)}px`,
        backgroundColor: colors.ground,
        backgroundImage: `linear-gradient(170deg, #4a2418 0%, ${colors.ground} 58%)`,
        color: colors.ink,
        fontFamily: 'Archivo',
      },
    },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 28 } },
      escudo
        ? h('img', { src: escudo, width: COVER_BADGE, height: COVER_BADGE, style: { objectFit: 'cover', borderRadius: 28 } })
        : null,
      // Letter-spaced capitals run wide, so a long pueblo name is fitted
      // beside the escudo rather than set at a size that spills off the card.
      text(village, {
        fontSize: fitFontSize(village, CARD_WIDTH - GUTTER * 2 - COVER_BADGE - 28, 50, 30, 0.78),
        fontWeight: 600,
        letterSpacing: 6,
        color: colors.accentSoft,
      }),
    ),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column' } },
      text(copy.fiestas, { fontSize: 148, fontWeight: 800, lineHeight: 0.95, letterSpacing: -4 }),
      text(String(ctx.year), { fontSize: 220, fontWeight: 800, lineHeight: 1, color: colors.accent, letterSpacing: -8, marginTop: 8 }),
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 30, marginTop: 44 } },
        ...ctx.blocks.map((b) =>
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', borderLeft: `6px solid ${colors.accent}`, paddingLeft: 26 } },
            // Free text a village admin types, with no length limit, so it is
            // fitted rather than set at a size that overflows the card.
            text(b.name, {
              fontSize: fitFontSize(b.name, CARD_WIDTH - GUTTER * 2 - 32, 64, 36),
              fontWeight: 700,
              lineHeight: 1.1,
            }),
            text(b.dateRange, { fontSize: 40, color: colors.inkDim, marginTop: 6 }),
          ),
        ),
      ),
    ),
    ctx.link
      ? h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: 18 } },
          brandMark(36, { icon: COVER_BADGE }),
          text(ctx.link, { fontSize: 30, color: colors.inkDim }),
        )
      : brandMark(36, { icon: COVER_BADGE }),
  );
}

// ── people ───────────────────────────────────────────────────────────────

export interface PersonBubble {
  name: string;
  photo: string | null;
  participant: boolean;
}

export function peopleCard(ctx: CardContext, people: PersonBubble[], censoParticipantCount: number): SatoriNode {
  const layout = hexLayout(people.length, BODY_WIDTH, BODY_HEIGHT - 90);
  const d = layout.diameter;

  const bubbles = people.map((p, i) => {
    const pos = layout.positions[i];
    const ring = p.participant ? colors.accent : 'transparent';
    const common = {
      position: 'absolute',
      left: pos.x,
      top: pos.y,
      width: d,
      height: d,
      borderRadius: d,
      border: `${String(Math.max(2, d * 0.06))}px solid ${ring}`,
      // Non-participants stay on the wall — this is everyone — just quieter.
      opacity: p.participant ? 1 : 0.42,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    };
    if (p.photo) {
      return h('div', { style: common }, h('img', { src: p.photo, width: d, height: d, style: { objectFit: 'cover' } }));
    }
    return h(
      'div',
      { style: { ...common, backgroundColor: colorFor(p.name) } },
      text(initials(p.name), { fontSize: d * 0.36, fontWeight: 700, color: colors.ink }),
    );
  });

  const legendDot = (color: string, opacity: number) =>
    h('div', { style: { display: 'flex', width: 26, height: 26, borderRadius: 26, backgroundColor: color, opacity } });

  const body = h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', position: 'absolute', left: GUTTER, top: BODY_TOP, width: BODY_WIDTH, height: BODY_HEIGHT } },
    h('div', { style: { display: 'flex', position: 'relative', width: BODY_WIDTH, height: BODY_HEIGHT - 90 } }, ...bubbles),
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 16, marginTop: 30 } },
      legendDot(colors.accent, 1),
      text(copy.peopleLegendIn, { fontSize: 26, color: colors.inkDim }),
      h('div', { style: { display: 'flex', width: 28 } }),
      legendDot(colors.sage, 0.42),
      text(copy.peopleLegendOut, { fontSize: 26, color: colors.inkDim }),
    ),
  );

  return frame(
    ctx,
    { kicker: copy.peopleKicker, title: copy.peopleTitle(people.length), subtitle: copy.peopleSubtitle(censoParticipantCount) },
    body,
  );
}

// ── events & articles ────────────────────────────────────────────────────

/** A picture with its date and title underneath: an event flyer or an article cover. */
export interface EventTile {
  title: string;
  dateLabel: string;
  image: string | null;
}

/** Most tiles the mosaic draws before collapsing the rest into "y N más". */
export const MAX_EVENT_TILES = 24;

/**
 * Height of a flyer's picture inside its tile, above the caption band.
 *
 * Exported because the flyer must be FETCHED at this size, not at the tile's:
 * fetched at the full tile and drawn into the shorter box, it was cropped a
 * second time around its centre, cutting off the title at the top of the flyer.
 */
export function eventTileImageHeight(tileHeight: number): number {
  return tileHeight - Math.round(Math.min(96, tileHeight * 0.34));
}

/** The mosaic both the events and the articles cards are drawn with, so they read as a pair. */
function tileMosaic(tiles: EventTile[], anchor: 'top' | 'center'): SatoriNode {
  const shown = tiles.slice(0, MAX_EVENT_TILES);
  const hidden = tiles.length - shown.length;
  const gap = 14;
  const g = mosaicLayout(shown.length, BODY_WIDTH, BODY_HEIGHT - (hidden > 0 ? 70 : 20), gap, 0.92);
  const titleSize = Math.max(20, Math.min(34, g.tileWidth / 11));

  // The flyers carry their own lettering, so a title laid over them collides
  // with it and neither reads. The caption sits in its own band underneath.
  const imageHeight = eventTileImageHeight(g.tileHeight);
  const captionHeight = g.tileHeight - imageHeight;
  const drawn = shown.map((e) =>
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          width: g.tileWidth,
          height: g.tileHeight,
          borderRadius: 18,
          overflow: 'hidden',
          backgroundColor: colors.groundRaised,
        },
      },
      h(
        'div',
        { style: { display: 'flex', width: g.tileWidth, height: imageHeight, backgroundColor: colorFor(e.title) } },
        e.image ? h('img', { src: e.image, width: g.tileWidth, height: imageHeight, style: { objectFit: 'cover', objectPosition: anchor } }) : null,
      ),
      h(
        'div',
        {
          style: {
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            height: captionHeight, padding: '0 14px',
          },
        },
        text(e.dateLabel.toUpperCase(), { fontSize: titleSize * 0.6, fontWeight: 600, letterSpacing: 2, color: colors.accentSoft }),
        text(e.title, { fontSize: titleSize * 0.82, fontWeight: 700, lineHeight: 1.1, marginTop: 3, overflow: 'hidden', maxHeight: titleSize * 0.82 * 2.2 }),
      ),
    ),
  );

  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', position: 'absolute', left: GUTTER, top: BODY_TOP, width: BODY_WIDTH } },
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap, width: BODY_WIDTH } }, ...drawn),
    hidden > 0 ? text(copy.eventsMore(hidden), { fontSize: 32, color: colors.inkDim, marginTop: 26 }) : null,
  );
}

export function eventsCard(ctx: CardContext, events: EventTile[]): SatoriNode {
  return frame(ctx, { kicker: copy.eventsKicker, title: copy.eventsTitle(events.length) }, tileMosaic(events, 'top'));
}

/** Article covers are photos, not flyers, so they keep their centre rather than their top. */
export function newsCard(ctx: CardContext, articles: EventTile[]): SatoriNode {
  return frame(ctx, { kicker: copy.newsKicker, title: copy.newsTitle(articles.length) }, tileMosaic(articles, 'center'));
}

// ── organizers ───────────────────────────────────────────────────────────

export interface CreditRow {
  name: string;
  count: number;
  image: string | null;
}

function creditAvatar(row: CreditRow, size: number): SatoriNode {
  return row.image
    ? h('img', { src: row.image, width: size, height: size, style: { objectFit: 'cover', borderRadius: size } })
    : h(
        'div',
        {
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: size, height: size, borderRadius: size, backgroundColor: colorFor(row.name),
          },
        },
        text(initials(row.name), { fontSize: size * 0.36, fontWeight: 700 }),
      );
}

/** The organization that ran the most, given the room its lead deserves. */
function leadCredit(row: CreditRow): SatoriNode {
  return h(
    'div',
    {
      style: {
        display: 'flex', alignItems: 'center', gap: 28, padding: '26px 30px',
        backgroundColor: colors.groundRaised, borderRadius: 24,
      },
    },
    creditAvatar(row, 120),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', flex: 1 } },
      text(row.name, { fontSize: fitFontSize(row.name, BODY_WIDTH - 240, 44, 32), fontWeight: 700, lineHeight: 1.1 }),
      text(copy.eventCount(row.count), { fontSize: 30, color: colors.accentSoft, marginTop: 6 }),
    ),
  );
}

const CREDIT_GAP = 24;
const CREDIT_COLUMN = Math.floor((BODY_WIDTH - CREDIT_GAP) / 2);

/**
 * Everyone else, two to a row. A single column held five names; a comisión
 * lists its whole team on every event it runs, so a real village's fiestas
 * credit ten or more people, and every one of them organized something.
 */
function creditGrid(rows: CreditRow[], avatar: number): SatoriNode {
  const nameWidth = CREDIT_COLUMN - avatar - 20;
  return h(
    'div',
    { style: { display: 'flex', flexWrap: 'wrap', columnGap: CREDIT_GAP, rowGap: 22, width: BODY_WIDTH } },
    ...rows.map((row) =>
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 20, width: CREDIT_COLUMN } },
        creditAvatar(row, avatar),
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', width: nameWidth } },
          text(row.name, { fontSize: fitFontSize(row.name, nameWidth, 30, 22), fontWeight: 700, lineHeight: 1.1 }),
          text(copy.eventCount(row.count), { fontSize: 24, color: colors.accentSoft, marginTop: 4 }),
        ),
      ),
    ),
  );
}

export function organizersCard(ctx: CardContext, orgs: CreditRow[], people: CreditRow[]): SatoriNode {
  const section = (label: string) =>
    text(label.toUpperCase(), { fontSize: 24, fontWeight: 600, letterSpacing: 4, color: colors.muted, marginBottom: 18 });

  // Destructured, `lead` is typed as always present, and the guard below would
  // be flagged as dead — yet a Wrapped with no org-run events has none.
  const lead = orgs.length > 0 ? orgs[0] : undefined;
  const otherOrgs = orgs.slice(1);
  const body = h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', position: 'absolute', left: GUTTER, top: BODY_TOP, width: BODY_WIDTH, gap: 48 } },
    lead
      ? h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: 22 } },
          section(copy.organizersOrgs),
          leadCredit(lead),
          otherOrgs.length > 0 ? creditGrid(otherOrgs, 88) : null,
        )
      : null,
    people.length > 0
      ? h('div', { style: { display: 'flex', flexDirection: 'column' } }, section(copy.organizersPeople), creditGrid(people, 76))
      : null,
  );

  return frame(ctx, { kicker: copy.organizersKicker, title: copy.organizersTitle }, body);
}

// ── stats ────────────────────────────────────────────────────────────────

export interface StatsHighlight {
  title: string;
  count: number;
  capacity: number | null;
}

/**
 * Confirmed sign-ups per counted event, rounded to a whole person. Each
 * confirmed registration is one persona on one event, so this is the average
 * party size of an event, not distinct people.
 */
export function averagePerEvent(stats: Pick<WrappedStats, 'eventCount' | 'confirmedCount'>): string {
  if (stats.eventCount === 0) return '0';
  return String(Math.round(stats.confirmedCount / stats.eventCount));
}

export function statsCard(ctx: CardContext, stats: WrappedStats, fullest: StatsHighlight | null): SatoriNode {
  const tile = (value: string, label: string, accent: boolean) =>
    h(
      'div',
      {
        style: {
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          width: (BODY_WIDTH - 24) / 2, height: 250, padding: 30,
          backgroundColor: colors.groundRaised, borderRadius: 26,
        },
      },
      text(value, { fontSize: 112, fontWeight: 800, lineHeight: 1, letterSpacing: -3, color: accent ? colors.accent : colors.ink }),
      text(label, { fontSize: 30, color: colors.inkDim, marginTop: 10, lineHeight: 1.2 }),
    );

  const body = h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', position: 'absolute', left: GUTTER, top: BODY_TOP, width: BODY_WIDTH } },
    // Everyone who took part. Deliberately NOT read against the censo: this
    // figure includes personas with no village link and people from elsewhere,
    // so "N de censoCount" would be a false ratio. The censo ratio lives on the
    // people card, computed against the censo.
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', marginBottom: 34 } },
      text(String(stats.uniquePersonCount), { fontSize: 230, fontWeight: 800, lineHeight: 0.9, letterSpacing: -8, color: colors.accent }),
      text(copy.statsPeople, { fontSize: 44, fontWeight: 600, marginTop: 10 }),
    ),
    h(
      'div',
      { style: { display: 'flex', flexWrap: 'wrap', gap: 24 } },
      tile(String(stats.eventCount), copy.statsEvents, false),
      tile(String(stats.confirmedCount), copy.statsSignups, false),
      tile(String(stats.commentCount), copy.statsComments, false),
      tile(averagePerEvent(stats), copy.statsPerEvent, false),
    ),
    fullest
      ? h(
          'div',
          {
            style: {
              display: 'flex', flexDirection: 'column', marginTop: 72, padding: '30px 32px',
              borderRadius: 26, border: `2px solid ${colors.accent}`,
            },
          },
          text(copy.statsFullest.toUpperCase(), { fontSize: 24, fontWeight: 600, letterSpacing: 4, color: colors.accentSoft }),
          text(fullest.title, { fontSize: 44, fontWeight: 700, lineHeight: 1.12, marginTop: 10 }),
          text(copy.statsFullestCount(fullest.count, fullest.capacity), { fontSize: 32, color: colors.inkDim, marginTop: 8 }),
        )
      : null,
  );

  return frame(ctx, { kicker: copy.statsKicker, title: copy.fiestasYear(ctx.year) }, body);
}

// ── carteles ─────────────────────────────────────────────────────────────

export interface CartelTile {
  year: number;
  image: string | null;
  isThisYear: boolean;
}

export const POSTER_ASPECT = 2 / 3;
const TIMELINE_HEIGHT = 120;

/**
 * The pueblo's poster archive, oldest first, so this year's carteles land at
 * the end of the wall — added to the history rather than shown on their own.
 *
 * The timeline underneath marks every year that HAS a cartel and leaves the
 * others blank. It shows the gaps without explaining them: the archive is
 * crowdsourced, so a gap means nobody uploaded that year, not that there were
 * no fiestas.
 */
export function postersCard(
  ctx: CardContext,
  tiles: CartelTile[],
  history: { firstYear: number | null; spanYears: number; yearsWithCartel: number[]; thisYearCount: number },
): SatoriNode {
  const gap = 8;
  const wallHeight = BODY_HEIGHT - TIMELINE_HEIGHT - 40;
  const g = fixedAspectGrid(tiles.length, BODY_WIDTH, wallHeight, gap, POSTER_ASPECT);
  const ring = Math.max(3, g.tileWidth * 0.045);

  const wall = tiles.map((t) =>
    h(
      'div',
      {
        style: {
          display: 'flex',
          position: 'relative',
          width: g.tileWidth,
          height: g.tileHeight,
          borderRadius: 6,
          overflow: 'hidden',
          backgroundColor: colors.groundRaised,
          border: t.isThisYear ? `${String(ring)}px solid ${colors.accent}` : `1px solid ${colors.line}`,
        },
      },
      t.image ? h('img', { src: t.image, width: g.tileWidth, height: g.tileHeight, style: { objectFit: 'cover' } }) : null,
      t.isThisYear
        ? h(
            'div',
            {
              style: {
                display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 0,
                justifyContent: 'center', padding: '4px 0', backgroundColor: colors.accent,
              },
            },
            text(String(t.year), { fontSize: Math.max(14, g.tileWidth * 0.17), fontWeight: 800, color: colors.ink }),
          )
        : null,
    ),
  );

  const first = history.firstYear ?? ctx.year;
  const span = Math.max(1, ctx.year - first);
  const present = new Set(history.yearsWithCartel);
  const ticks: SatoriNode[] = [];
  for (let y = first; y <= ctx.year; y++) {
    if (!present.has(y)) continue;
    const isNow = y === ctx.year;
    ticks.push(
      h('div', {
        style: {
          display: 'flex', position: 'absolute',
          left: ((y - first) / span) * (BODY_WIDTH - 6),
          bottom: 0,
          width: isNow ? 8 : 5,
          height: isNow ? 56 : 30,
          borderRadius: 3,
          backgroundColor: isNow ? colors.accent : colors.inkDim,
        },
      }),
    );
  }

  const timeline = h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', marginTop: 40, width: BODY_WIDTH } },
    h(
      'div',
      { style: { display: 'flex', position: 'relative', width: BODY_WIDTH, height: 58, borderBottom: `2px solid ${colors.line}` } },
      ...ticks,
    ),
    h(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', marginTop: 12 } },
      text(String(first), { fontSize: 28, fontWeight: 600, color: colors.inkDim }),
      text(String(ctx.year), { fontSize: 28, fontWeight: 800, color: colors.accent }),
    ),
  );

  const body = h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', position: 'absolute', left: GUTTER, top: BODY_TOP, width: BODY_WIDTH } },
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap, width: BODY_WIDTH } }, ...wall),
    timeline,
  );

  return frame(
    ctx,
    { kicker: copy.postersKicker, title: copy.postersTitle(history.spanYears), subtitle: copy.postersAdded(history.thisYearCount) },
    body,
  );
}

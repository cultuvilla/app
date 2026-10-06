import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { composeWrapped, CARD_FORMATS, cardLink, formatDateRange } from '../../wrapped/composeWrapped';
import type { GatheredWrapped } from '../../wrapped/gatherInputs';
import { fitFontSize } from '../../wrapped/render/layout';
import { averagePerEvent, coverCard, statsCard, type CardContext } from '../../wrapped/render/cards';
import type { SatoriChild } from '../../wrapped/render/h';

/**
 * Renders real cards end to end — Satori layout, embedded fonts, sharp
 * rasterisation — with the network stubbed out. This is the path that breaks
 * a deploy silently: a font that doesn't load, a layout engine that didn't
 * bundle, a native module that won't initialise.
 */

const WINDOW = { start: new Date('2026-08-14T00:00:00+02:00'), end: new Date('2026-08-28T23:59:59.999+02:00') };

function gathered(): GatheredWrapped {
  return {
    villageName: 'Matabuena',
    villageSlug: 'matabuena',
    escudoUrl: null,
    people: [
      { personId: 'p1', displayName: 'Lucía Sánchez Baeza', photoURL: null },
      { personId: 'p2', displayName: 'Juan García (hijo)', photoURL: 'https://example.invalid/p2.jpg' },
      { personId: 'p3', displayName: 'Ana Martín', photoURL: null },
    ],
    posters: [
      { id: 'c1960', year: 1960, title: null, imageURL: 'https://example.invalid/1960.jpg' },
      { id: 'c1977', year: 1977, title: null, imageURL: null },
      { id: 'c2026', year: 2026, title: 'Fiestas en honor a la Virgen del Carmen', imageURL: 'https://example.invalid/2026.jpg' },
    ],
    news: [
      { id: 'n1', title: 'La carrera, mucho más que 5 kilómetros', publishedAt: new Date('2026-08-31T20:00:00+02:00'), imageURL: 'https://example.invalid/n1.jpg' },
    ],
    inputs: {
      range: WINDOW,
      events: [
        {
          id: 'e1', title: 'Torneo de Brisca', status: 'completed', startDate: new Date('2026-08-24T16:00:00+02:00'),
          imageURL: 'https://example.invalid/e1.jpg', commentCount: 4, maxAttendees: 20, createdBy: 'u1', organizerOrgIds: ['o1'], organizerUserIds: [],
        },
        {
          id: 'e2', title: 'Taller de pan', status: 'completed', startDate: new Date('2026-08-15T10:00:00+02:00'),
          imageURL: null, commentCount: 0, maxAttendees: null, createdBy: 'u1', organizerOrgIds: [], organizerUserIds: [],
        },
      ],
      registrations: [
        { eventId: 'e1', personId: 'p1', userId: 'u1', status: 'confirmed' },
        { eventId: 'e1', personId: 'outsider', userId: 'u9', status: 'waitlisted' },
      ],
      organizations: [{ id: 'o1', name: 'Comisión de Festejos', imageURL: null }],
      organizerProfiles: [{ userId: 'u1', displayName: 'Álvaro García', photoURL: null }],
      censoCount: 3,
      censoPersonIds: ['p1', 'p2', 'p3'],
      posterCount: 1,
    },
  };
}

/** Every remote image fails — the Wrapped must still render, with fallbacks. */
const offline: typeof fetch = () => Promise.resolve(new Response(null, { status: 404 }));

describe('composeWrapped', () => {
  it('renders every card at the 9:16 story size', async () => {
    const { images } = await composeWrapped(gathered(), { blocks: [{ name: 'Fiestas de agosto', ...WINDOW }], year: 2026 }, offline);
    expect(Object.keys(images).sort()).toEqual(['cover', 'events', 'news', 'organizers', 'people', 'posters', 'stats']);
    for (const [card, img] of Object.entries(images)) {
      const meta = await sharp(img.bytes).metadata();
      expect({ card, w: meta.width, h: meta.height }).toEqual({ card, w: 1080, h: 1920 });
      expect(meta.format).toBe(img.format);
    }
  }, 60_000);

  it('still renders the carteles card for a pueblo with no archive yet', async () => {
    const g = { ...gathered(), posters: [] };
    const { images } = await composeWrapped(g, { blocks: [{ name: 'Fiestas de agosto', ...WINDOW }], year: 2026 }, offline);
    expect((await sharp(images.posters?.bytes).metadata()).width).toBe(1080);
  }, 60_000);

  // A blank "0 artículos" card would make a quiet year look dead; it is left out.
  it('leaves the articles card out of a year with no articles', async () => {
    const g = { ...gathered(), news: [] };
    const { images } = await composeWrapped(g, { blocks: [{ name: 'Fiestas de agosto', ...WINDOW }], year: 2026 }, offline);
    expect(images.news).toBeUndefined();
    expect(images.events).toBeDefined();
  }, 60_000);

  it('ships photo cards as JPEG and flat cards as PNG', async () => {
    const { images } = await composeWrapped(gathered(), { blocks: [{ name: 'Fiestas de agosto', ...WINDOW }], year: 2026 }, offline);
    for (const card of Object.keys(CARD_FORMATS) as (keyof typeof CARD_FORMATS)[]) {
      expect(images[card]?.format).toBe(CARD_FORMATS[card]);
    }
  }, 60_000);

  // A dead photo URL must cost one bubble its photo, never the whole Wrapped.
  it('still renders when every image fetch fails', async () => {
    await expect(
      composeWrapped(gathered(), { blocks: [{ name: 'Fiestas de agosto', ...WINDOW }], year: 2026 }, offline),
    ).resolves.toBeDefined();
  }, 60_000);

  // A village admin types the block name and nothing limits its length, so
  // the cover fits it instead of setting it at a fixed size that overflows.
  it('renders a very long fiesta block name within the card', async () => {
    const blockName = 'Fiestas patronales de Nuestra Señora de la Asunción y San Roque';
    const { images } = await composeWrapped(gathered(), { blocks: [{ name: blockName, ...WINDOW }], year: 2026 }, offline);
    const meta = await sharp(images.cover?.bytes).metadata();
    expect({ w: meta.width, h: meta.height }).toEqual({ w: 1080, h: 1920 });
    expect(fitFontSize(blockName, 1080 - 72 * 2, 148, 56)).toBeLessThan(148);
  }, 60_000);

  it('reads the censo figure against the censo only', async () => {
    const { aggregate } = await composeWrapped(gathered(), { blocks: [{ name: 'Fiestas de agosto', ...WINDOW }], year: 2026 }, offline);
    expect(aggregate.stats.uniquePersonCount).toBe(2);
    expect(aggregate.stats.censoParticipantCount).toBe(1);
  }, 60_000);
});

/** Every string drawn by a card tree — Satori turns text into paths, so the tree is where text is still readable. */
function textsOf(node: SatoriChild | SatoriChild[] | undefined): string[] {
  if (node == null) return [];
  if (Array.isArray(node)) return node.flatMap(textsOf);
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  return textsOf(node.props.children);
}

describe('card link', () => {
  // A card shared on its own — a WhatsApp status, an Instagram story — has no
  // link attached, so the card has to carry its own way back.
  const ctx: CardContext = { villageName: 'Matabuena', year: 2026, blocks: [], link: 'cultuvilla.es/matabuena/fiestas/2026' };
  const stats = { eventCount: 2, confirmedCount: 3, waitlistedCount: 0, uniquePersonCount: 2, uniqueAccountCount: 1, commentCount: 0, censoCount: 3, censoParticipantCount: 1, posterCount: 0 };

  it('prints the Wrapped address on the cover and on every framed card', () => {
    expect(textsOf(coverCard(ctx, null))).toContain(ctx.link);
    expect(textsOf(statsCard(ctx, stats, null))).toContain(ctx.link);
  });

  it('prints nothing when there is no address to give', () => {
    expect(textsOf(statsCard({ ...ctx, link: null }, stats, null)).join(' ')).not.toContain('cultuvilla.es');
  });

  it('names the public host of each project, without the scheme', () => {
    expect(cardLink('cultuvilla-prod', 'matabuena', 2026)).toBe('cultuvilla.es/matabuena/fiestas/2026');
    expect(cardLink('villa-events', 'matabuena', 2026)).toBe('villa-events.web.app/matabuena/fiestas/2026');
    expect(cardLink('cultuvilla-prod', null, 2026)).toBeNull();
  });
});

describe('averagePerEvent', () => {
  it('rounds to a whole person', () => {
    expect(averagePerEvent({ eventCount: 20, confirmedCount: 258 })).toBe('13');
    expect(averagePerEvent({ eventCount: 4, confirmedCount: 41 })).toBe('10');
  });

  it('is 0 for a Wrapped with no events, not NaN', () => {
    expect(averagePerEvent({ eventCount: 0, confirmedCount: 0 })).toBe('0');
  });
});

describe('formatDateRange', () => {
  it('writes a same-month range once', () => {
    expect(formatDateRange(WINDOW.start, WINDOW.end)).toBe('14 – 28 de agosto');
  });

  it('names both months across a boundary', () => {
    expect(
      formatDateRange(new Date('2026-07-30T00:00:00+02:00'), new Date('2026-08-02T23:59:59+02:00')),
    ).toBe('30 de julio – 2 de agosto');
  });

  // 23:30 on the 28th in Madrid is already the 29th in... nowhere west of it —
  // but a UTC reading of a Madrid midnight lands on the PREVIOUS day.
  it('reads the day in Madrid, not UTC', () => {
    expect(formatDateRange(new Date('2026-08-14T00:00:00+02:00'), new Date('2026-08-14T23:30:00+02:00'))).toBe(
      '14 – 14 de agosto',
    );
  });
});

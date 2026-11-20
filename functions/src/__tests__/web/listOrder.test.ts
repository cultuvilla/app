import { describe, it, expect } from 'vitest';
import { orderEvents, type EventView } from '../../web/data';

const NOW = new Date('2026-10-20T12:00:00Z');

function ev(id: string, start: string, seriesId: string | null = null): EventView {
  return {
    id,
    title: id,
    description: null,
    start: new Date(start),
    end: null,
    locationName: null,
    imageUrl: null,
    cancelled: false,
    private: false,
    municipalityId: 'm',
    seriesId,
  };
}

describe('orderEvents', () => {
  it('lists upcoming soonest first, then past most recent first', () => {
    const out = orderEvents([ev('past', '2026-10-01'), ev('soon', '2026-10-22'), ev('later', '2026-11-01')], NOW);
    expect(out.map((e) => e.id)).toEqual(['soon', 'later', 'past']);
  });

  it('shows a weekly series once, at its next date', () => {
    const out = orderEvents(
      [
        ev('y-past', '2026-10-13', 'y'),
        ev('y-next', '2026-10-27', 'y'),
        ev('y-after', '2026-11-03', 'y'),
        ev('solo', '2026-10-30'),
      ],
      NOW,
    );
    expect(out.map((e) => e.id)).toEqual(['y-next', 'solo']);
  });

  it('falls back to the latest date of a series that is over', () => {
    const out = orderEvents([ev('a', '2026-10-06', 'y'), ev('b', '2026-10-13', 'y')], NOW);
    expect(out.map((e) => e.id)).toEqual(['b']);
  });
});

import { describe, it, expect } from 'vitest';
import { inListOrder, type EventView } from '../../web/data';

// The order itself — upcoming then past, one card per series — is the shared
// helpers' and is tested in packages/shared. This pins that the read site uses it.

function ev(id: string, start: string, seriesId: string | null = null, end: string | null = null): EventView {
  return {
    id,
    title: id,
    description: null,
    start: new Date(start),
    end: end ? new Date(end) : null,
    locationName: null,
    imageUrl: null,
    cancelled: false,
    private: false,
    visibilityOrgId: null,
    municipalityId: 'm',
    seriesId,
  };
}

describe('inListOrder', () => {
  it('keeps a single-day event that started earlier today at the top, ahead of later ones', () => {
    // 18:00 Madrid; the procession began at 10:00 the same day.
    const now = new Date('2026-08-15T16:00:00Z');
    const out = inListOrder(
      [ev('yesterday', '2026-08-14T20:00:00Z'), ev('procession', '2026-08-15T08:00:00Z'), ev('tomorrow', '2026-08-16T19:00:00Z')],
      now,
    );
    expect(out.map((e) => e.id)).toEqual(['procession', 'tomorrow', 'yesterday']);
  });

  it('shows a weekly series once, at its next date', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    const out = inListOrder([ev('y-past', '2026-10-13', 'y'), ev('y-next', '2026-10-27', 'y'), ev('solo', '2026-10-30')], now);
    expect(out.map((e) => e.id)).toEqual(['y-next', 'solo']);
  });

  it('never lists an event with no start date', () => {
    const undated = { ...ev('undated', '2026-10-01'), start: null };
    expect(inListOrder([undated], new Date('2026-10-20T12:00:00Z'))).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDayKey,
  formatPrice,
  formatCompactRelativeTime,
  formatRelativeTime,
  monthLongLabels,
  monthShortLabels,
} from '../../src/utils/format';

describe('formatDate', () => {
  const d = new Date('2026-05-19T15:30:00.000Z');

  it('formats short (numeric date)', () => {
    expect(formatDate(d, 'short')).toMatch(/19\/05\/2026|19\/5\/2026/);
  });

  it('formats long (with weekday + month name)', () => {
    const out = formatDate(d, 'long');
    expect(out).toMatch(/martes/i);
    expect(out).toMatch(/mayo/i);
    expect(out).toMatch(/2026/);
  });

  it('formats time-only', () => {
    // Output depends on the host TZ; assert the shape, not the wall clock.
    expect(formatDate(d, 'time')).toMatch(/\d{1,2}:\d{2}/);
  });

  it('formats datetime (date + time)', () => {
    expect(formatDate(d, 'datetime')).toMatch(/2026/);
    expect(formatDate(d, 'datetime')).toMatch(/\d{1,2}:\d{2}/);
  });

  // Cloud Functions run in UTC, so callers there must pass the event's zone
  // explicitly or the rendered time drifts an hour or two off the wall clock.
  it('renders the given IANA zone rather than the ambient one', () => {
    const summerNoonUtc = new Date('2026-07-15T12:00:00Z');
    expect(formatDate(summerNoonUtc, 'time', 'UTC')).toMatch(/12:00/);
    // Europe/Madrid is UTC+2 in July.
    expect(formatDate(summerNoonUtc, 'time', 'Europe/Madrid')).toMatch(/14:00/);
  });

  it('crosses the calendar day when the zone demands it', () => {
    const lateUtc = new Date('2026-07-15T23:30:00Z');
    expect(formatDate(lateUtc, 'short', 'UTC')).toContain('15');
    expect(formatDate(lateUtc, 'short', 'Europe/Madrid')).toContain('16');
  });
});

describe('formatPrice', () => {
  it('formats EUR by default with the Spanish thousands separator', () => {
    expect(formatPrice(1234.5)).toMatch(/1\.234,50/);
    expect(formatPrice(1234.5)).toMatch(/€/);
  });

  it('treats zero as a real value, not a missing one', () => {
    expect(formatPrice(0)).toMatch(/0,00/);
  });

  it('honors a custom currency', () => {
    expect(formatPrice(10, 'USD')).toMatch(/10,00/);
  });
});

describe('monthShortLabels', () => {
  it('returns 12 capitalized es-ES abbreviations with no trailing period', () => {
    const labels = monthShortLabels();
    expect(labels).toHaveLength(12);
    expect(labels[0]).toBe('Ene');
    expect(labels[7]).toBe('Ago');
    for (const label of labels) {
      expect(label).not.toMatch(/\.$/);
      expect(label.charAt(0)).toBe(label.charAt(0).toUpperCase());
    }
  });
});

describe('monthLongLabels', () => {
  it('returns 12 capitalized es-ES full month names', () => {
    const labels = monthLongLabels();
    expect(labels).toHaveLength(12);
    expect(labels[0]).toBe('Enero');
    expect(labels[4]).toBe('Mayo');
    expect(labels[11]).toBe('Diciembre');
    for (const label of labels) {
      expect(label.charAt(0)).toBe(label.charAt(0).toUpperCase());
    }
  });
});

describe('formatRelativeTime', () => {
  const NOW = new Date('2026-05-19T12:00:00.000Z');

  it('says "hace 5 minutos" when 5 minutes in the past', () => {
    const past = new Date(NOW.getTime() - 5 * 60 * 1000);
    expect(formatRelativeTime(past, NOW)).toMatch(/hace\s+5\s+minuto/i);
  });

  it('says "en 2 horas" / "dentro de 2 horas" when 2 hours in the future', () => {
    const future = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
    // ICU ≥78 uses "dentro de", older uses "en" — accept both
    expect(formatRelativeTime(future, NOW)).toMatch(/(?:en|dentro\s+de)\s+2\s+hora/i);
  });

  it('says "ayer" when ~1 day in the past', () => {
    const yesterday = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(yesterday, NOW)).toMatch(/ayer/i);
  });

  it('says "mañana" when ~1 day in the future', () => {
    const tomorrow = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(tomorrow, NOW)).toMatch(/mañana/i);
  });
});

describe('formatCompactRelativeTime', () => {
  const NOW = new Date('2026-05-19T12:00:00.000Z');
  const ago = (ms: number) => new Date(NOW.getTime() - ms);
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it.each([
    [500, 'ahora'],
    [5 * SECOND, '5s'],
    [3 * MINUTE, '3min'],
    [4 * HOUR, '4h'],
    [3 * DAY, '3d'],
    [8 * DAY, '1sem'],
    [40 * DAY, '1mes'],
    [400 * DAY, '1a'],
  ])('renders %i ms ago as "%s"', (elapsed, expected) => {
    expect(formatCompactRelativeTime(ago(elapsed), NOW)).toBe(expected);
  });

  it('truncates rather than rounds up, so nothing ages early', () => {
    expect(formatCompactRelativeTime(ago(119 * MINUTE), NOW)).toBe('1h');
  });

  it('formats future dates by magnitude, without a direction prefix', () => {
    expect(formatCompactRelativeTime(new Date(NOW.getTime() + 2 * HOUR), NOW)).toBe('2h');
  });
});

describe('formatDayKey', () => {
  it('formats a calendar day the same in every zone', () => {
    expect(formatDayKey('2026-03-01')).toBe('01/03/2026');
    expect(formatDayKey('2026-03-01', 'long')).toBe('domingo, 1 de marzo de 2026');
  });
});

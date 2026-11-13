/**
 * Locale-formatted display helpers. All preset to `es-ES`. Whenever you
 * find yourself reaching for `Intl.DateTimeFormat` or
 * `Intl.NumberFormat` in a screen, write a helper here instead —
 * formatting drift across the app reads as bugs.
 */
import type { PartialDate } from '../models/person';

const LOCALE = 'es-ES';

export type DateStyle = 'short' | 'dayMonth' | 'dayMonthShort' | 'monthYear' | 'long' | 'time' | 'datetime';

/**
 * `timeZone` is an IANA zone (e.g. `Europe/Madrid`). Omit it in client code —
 * the device zone is already the user's. Pass it explicitly from Cloud
 * Functions, which run in UTC and would otherwise print event times shifted
 * one or two hours off the Spanish wall clock.
 */
export function formatDate(date: Date, style: DateStyle = 'short', timeZone?: string): string {
  const tz = timeZone ? { timeZone } : {};
  switch (style) {
    case 'short':
      return new Intl.DateTimeFormat(LOCALE, { ...tz,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(date);
    // Day + month name, no year: "2 de Julio". The month is capitalised (Intl
    // gives lowercase "julio") for the app's display style.
    case 'dayMonth': {
      const parts = new Intl.DateTimeFormat(LOCALE, { ...tz,
        day: 'numeric',
        month: 'long',
      }).formatToParts(date);
      return parts
        .map((p) => (p.type === 'month' ? p.value.charAt(0).toUpperCase() + p.value.slice(1) : p.value))
        .join('');
    }
    // Day + abbreviated month, for a card's date: "6 dic". Some ICU builds
    // end the abbreviation with a period ("dic."); the card has no room for it.
    case 'dayMonthShort':
      return new Intl.DateTimeFormat(LOCALE, { ...tz, day: 'numeric', month: 'short' })
        .format(date)
        .replace(/\.$/, '');
    // Month + year, no "de": "Agosto 2025". Intl's { month: 'long', year:
    // 'numeric' } inserts a literal " de " between them (es-ES grammar); we
    // drop literals and join with a single space for the poster's display style.
    case 'monthYear': {
      const parts = new Intl.DateTimeFormat(LOCALE, { ...tz, month: 'long', year: 'numeric' }).formatToParts(date);
      return parts
        .filter((p) => p.type !== 'literal')
        .map((p) => (p.type === 'month' ? p.value.charAt(0).toUpperCase() + p.value.slice(1) : p.value))
        .join(' ');
    }
    case 'long':
      return new Intl.DateTimeFormat(LOCALE, { ...tz,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(date);
    case 'time':
      return new Intl.DateTimeFormat(LOCALE, { ...tz,
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    case 'datetime':
      return new Intl.DateTimeFormat(LOCALE, { ...tz,
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
  }
}

/**
 * A calendar day held as a `YYYY-MM-DD` key (a due date, a payment day). It
 * names a day, not an instant, so it is formatted in UTC and reads the same on
 * every phone and in Cloud Functions.
 */
export function formatDayKey(day: string, style: DateStyle = 'short'): string {
  return formatDate(new Date(`${day}T12:00:00Z`), style, 'UTC');
}

/**
 * Whole-calendar-day offset of `date` from `now`: 0 = today, 1 = tomorrow,
 * -1 = yesterday. Compares calendar days (local time), not 24h spans, so a
 * time later today is still 0 and any time tomorrow is 1. Callers map the
 * result to relative labels ("Hoy"/"Mañana").
 */
export function calendarDayOffset(date: Date, now: Date = new Date()): number {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
}

/**
 * The 12 capitalized es-ES abbreviated month names ("Ene".."Dic"), derived
 * from Intl rather than hardcoded, so the locale stays the single source
 * of truth for month labels (month chip pickers, etc.).
 */
export function monthShortLabels(): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const raw = new Intl.DateTimeFormat(LOCALE, { month: 'short' }).format(new Date(2000, i, 1));
    const trimmed = raw.replace(/\.$/, '');
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  });
}

export function monthLongLabels(): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const raw = new Intl.DateTimeFormat(LOCALE, { month: 'long' }).format(new Date(2000, i, 1));
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  });
}

export function formatPartialDate(date: PartialDate | null): string | null {
  if (!date?.year) return null;
  if (date.month != null && date.day != null) {
    return formatDate(new Date(date.year, date.month - 1, date.day), 'short');
  }
  if (date.month != null) {
    const month = monthLongLabels()[date.month - 1];
    return month ? `${month} ${String(date.year)}` : String(date.year);
  }
  return String(date.year);
}

export function formatPrice(amount: number, currency: string = 'EUR'): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    useGrouping: true,
  }).format(amount);
}

type RTFUnit =
  | 'year'
  | 'month'
  | 'week'
  | 'day'
  | 'hour'
  | 'minute'
  | 'second';

interface TimeUnit {
  unit: RTFUnit;
  ms: number;
}

const UNITS: TimeUnit[] = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
  { unit: 'second', ms: 1000 },
];

type RelativeTimeFormatter = { format: (value: number, unit: RTFUnit) => string };

let rtfCache: RelativeTimeFormatter | undefined;

const ES_UNIT_LABELS: Record<RTFUnit, [string, string]> = {
  year: ['año', 'años'],
  month: ['mes', 'meses'],
  week: ['semana', 'semanas'],
  day: ['día', 'días'],
  hour: ['hora', 'horas'],
  minute: ['minuto', 'minutos'],
  second: ['segundo', 'segundos'],
};

function fallbackRTF(): RelativeTimeFormatter {
  return {
    format(value, unit) {
      const abs = Math.abs(value);
      const [singular, plural] = ES_UNIT_LABELS[unit];
      const label = abs === 1 ? singular : plural;
      if (value === 0) return unit === 'second' ? 'ahora' : `en 0 ${label}`;
      return value < 0 ? `hace ${String(abs)} ${label}` : `en ${String(abs)} ${label}`;
    },
  };
}

function getRTF(): RelativeTimeFormatter {
  if (rtfCache) return rtfCache;
  const Ctor = (Intl as unknown as { RelativeTimeFormat?: typeof Intl.RelativeTimeFormat })
    .RelativeTimeFormat;
  rtfCache = Ctor
    ? (new Ctor(LOCALE, { numeric: 'auto' }))
    : fallbackRTF();
  return rtfCache;
}

const ES_COMPACT_UNITS: Record<RTFUnit, string> = {
  year: 'a',
  month: 'mes',
  week: 'sem',
  day: 'd',
  hour: 'h',
  minute: 'min',
  second: 's',
};

/**
 * Age of a timestamp in the shortest form that still reads: `5s`, `3d`, `1sem`.
 * Social-feed style — used where the timestamp sits inline next to a name and
 * must not compete with it. Anything under a second is `ahora`. Future dates
 * are formatted by magnitude too (no "en"/"hace" prefix — there is no room).
 */
export function formatCompactRelativeTime(date: Date, now: Date = new Date()): string {
  const diff = Math.abs(date.getTime() - now.getTime());
  for (const { unit, ms } of UNITS) {
    if (diff >= ms) return `${String(Math.floor(diff / ms))}${ES_COMPACT_UNITS[unit]}`;
  }
  return 'ahora';
}

export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diff = date.getTime() - now.getTime();
  const rtf = getRTF();
  for (const { unit, ms } of UNITS) {
    if (Math.abs(diff) >= ms) {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return rtf.format(0, 'second');
}

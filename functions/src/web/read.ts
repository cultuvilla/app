/**
 * Narrowing helpers for raw Firestore data.
 *
 * Why raw reads and not the shared converters: the read site is best-effort,
 * like the share previews it replaces. A doc with a stale or partial shape
 * should render a thinner page, not take the page down — the strict Zod
 * converters throw on any mismatch.
 */
export type Raw = Record<string, unknown>;

export function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function bool(value: unknown): boolean {
  return value === true;
}

export function obj(value: unknown): Raw | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : null;
}

export function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function strArr(value: unknown): string[] {
  return arr(value).flatMap((v) => {
    const s = str(v);
    return s ? [s] : [];
  });
}

/** Firestore Timestamp, Date, or ISO string → Date. */
export function date(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const withToDate = value as { toDate?: () => Date } | null;
  if (withToDate && typeof withToDate.toDate === 'function') return withToDate.toDate();
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

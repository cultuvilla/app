import { madridDayKey } from '@cultuvilla/shared/models/event';
import type { CuotaStatus } from '@cultuvilla/shared/models/organization';
import { formatPrice } from '@cultuvilla/shared/utils';

/** Today as a Madrid day key — the cuota's calendar is the village's. */
export function todayKey(now: Date = new Date()): string {
  return madridDayKey(now);
}

/** The calendar day a date picker returned (local midnight), as a day key. */
export function dayKeyOfPickedDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A day key as the local-midnight Date a date picker shows. */
export function pickedDateOfDayKey(day: string): Date {
  return new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
}

export function centsLabel(cents: number): string {
  return formatPrice(cents / 100);
}

/** "30" or "12,50" — how an amount is shown back in an input. */
export function centsInputValue(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace('.', ',');
}

export const CUOTA_STATUS_TONE: Record<CuotaStatus, 'success' | 'muted' | 'danger'> = {
  al_dia: 'success',
  pendiente: 'muted',
  vencida: 'danger',
};

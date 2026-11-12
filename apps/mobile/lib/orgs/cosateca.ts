import { cosaAvailability, type CosaData, type CosaRequestData } from '@cultuvilla/shared/models/organization';
import { firebaseErrorCode } from '@cultuvilla/shared/firebase/sdk/errors';
import { formatDate, formatDayKey } from '@cultuvilla/shared/utils';
import type { I18n } from '../i18n';

type T = I18n['t'];

/** "Disponible", "La tiene Ana hasta el 3 ago 2026", "En pausa". */
export function cosaAvailabilityLabel(t: T, cosa: Pick<CosaData, 'status' | 'heldBy'>): string {
  const state = cosaAvailability(cosa);
  if (state === 'lent' && cosa.heldBy) {
    return cosa.heldBy.untilOn
      ? t('groups.cosateca.availability.lentUntil', { name: cosa.heldBy.name, date: formatDayKey(cosa.heldBy.untilOn) })
      : t('groups.cosateca.availability.lent', { name: cosa.heldBy.name });
  }
  return t(`groups.cosateca.availability.${state}`);
}

/** "Lo tiene Ana desde el 3 de octubre de 2026": who has it now, and since when. */
export function cosaHeldSinceLabel(t: T, heldBy: Pick<NonNullable<CosaData['heldBy']>, 'name' | 'since'>): string {
  return t('groups.cosateca.detail.heldSince', { name: heldBy.name, date: formatDate(heldBy.since, 'long') });
}

/** Who offers it: its owner's name, or "Del grupo". */
export function cosaOwnerLabel(t: T, cosa: Pick<CosaData, 'ownerUid' | 'ownerName'>): string {
  return cosa.ownerUid === null ? t('groups.cosateca.ofGroup') : cosa.ownerName;
}

/** A booking's slot: "12 nov 2026 · 18:00–19:00". */
export function reservaSlotLabel(req: Pick<CosaRequestData, 'fromOn' | 'startAt' | 'endAt'>): string {
  if (!req.fromOn || !req.startAt || !req.endAt) return '';
  return `${formatDayKey(req.fromOn)} · ${formatDate(req.startAt, 'time')}–${formatDate(req.endAt, 'time')}`;
}

/** "Del 1 jul 2026 al 3 jul 2026", "Desde el …", "Hasta el …", "Sin fechas"; a booking's slot. */
export function cosaRequestDatesLabel(
  t: T,
  req: Pick<CosaRequestData, 'fromOn' | 'untilOn'> & Partial<Pick<CosaRequestData, 'startAt' | 'endAt'>>,
): string {
  if (req.startAt && req.endAt) return reservaSlotLabel({ fromOn: req.fromOn, startAt: req.startAt, endAt: req.endAt });
  if (req.fromOn && req.untilOn) {
    return t('groups.cosateca.request.range', { from: formatDayKey(req.fromOn), until: formatDayKey(req.untilOn) });
  }
  if (req.fromOn) return t('groups.cosateca.request.fromOnly', { from: formatDayKey(req.fromOn) });
  if (req.untilOn) return t('groups.cosateca.request.untilOnly', { until: formatDayKey(req.untilOn) });
  return t('groups.cosateca.request.noDates');
}

/**
 * What to tell the user when `respondToCosaRequest` (or a write) refuses. A
 * `failed-precondition` carries the callable's own Spanish reason ("Ya está
 * prestada o comprometida en esas fechas"), which says more than any generic
 * line could; the rest map to the catalogue.
 */
export function cosatecaErrorMessage(t: T, error: unknown): string {
  const code = firebaseErrorCode(error);
  // The booking callable's refusals ("Esa hora ya está reservada", the per-person cap) speak for themselves too.
  if ((code === 'failed-precondition' || code === 'already-exists' || code === 'resource-exhausted') && error instanceof Error && error.message) {
    return error.message;
  }
  if (code === 'permission-denied') return t('groups.cosateca.errors.permission');
  return t('groups.cosateca.errors.generic');
}

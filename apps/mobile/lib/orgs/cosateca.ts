import { cosaAvailability, type CosaData, type CosaRequestData } from '@cultuvilla/shared/models/organization';
import { firebaseErrorCode } from '@cultuvilla/shared/firebase/sdk/errors';
import { formatDayKey } from '@cultuvilla/shared/utils';
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

/** Who offers it: its owner's name, or "Del grupo". */
export function cosaOwnerLabel(t: T, cosa: Pick<CosaData, 'ownerUid' | 'ownerName'>): string {
  return cosa.ownerUid === null ? t('groups.cosateca.ofGroup') : cosa.ownerName;
}

/** "Del 1 jul 2026 al 3 jul 2026", "Desde el …", "Hasta el …", "Sin fechas". */
export function cosaRequestDatesLabel(t: T, req: Pick<CosaRequestData, 'fromOn' | 'untilOn'>): string {
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
  if (code === 'failed-precondition' && error instanceof Error && error.message) return error.message;
  if (code === 'permission-denied') return t('groups.cosateca.errors.permission');
  return t('groups.cosateca.errors.generic');
}

import type { EventSeries } from '@cultuvilla/shared/models/event/EventSeriesModel';
import { formatDate } from '@cultuvilla/shared/utils/format';

type Translate = (key: string, values?: Record<string, string>) => string;

/** "lunes", "martes y jueves", "lunes, miércoles y viernes". */
export function weekdayList(weekdays: readonly number[], t: Translate): string {
  const names = [...weekdays].sort((a, b) => a - b).map((d) => t(`event.weekdayLong.${String(d)}`));
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]!}`;
}

/**
 * "Cada martes y jueves · hasta el 15 de Diciembre", or for a monthly series
 * "El día 15 de cada mes · hasta …" — the day read off `startDate`, this
 * occurrence's own date.
 */
export function seriesSummary(
  series: Pick<EventSeries, 'frequency' | 'weekdays' | 'until'>,
  startDate: Date,
  t: Translate,
): string {
  if (series.frequency === 'monthly') {
    return t('event.seriesSummaryMonthly', {
      day: String(startDate.getDate()),
      until: formatDate(series.until, 'dayMonth'),
    });
  }
  return t('event.seriesSummary', {
    days: weekdayList(series.weekdays, t),
    until: formatDate(series.until, 'dayMonth'),
  });
}

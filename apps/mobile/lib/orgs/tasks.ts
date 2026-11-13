import type { GroupTaskData, TaskRecurrence } from '@cultuvilla/shared/models/organization';
import { formatDayKey } from '@cultuvilla/shared/utils';
import type { I18n } from '../i18n';

type T = I18n['t'];

/** "Para el 10 may 2026", "14 ago 2026 a las 10:00", or "Sin fecha". */
export function taskWhenLabel(t: T, task: Pick<GroupTaskData, 'dueOn' | 'time'>): string {
  if (!task.dueOn) return t('groups.tasks.noDate');
  const date = formatDayKey(task.dueOn);
  return task.time ? t('groups.tasks.dueAt', { date, time: task.time }) : t('groups.tasks.due', { date });
}

/** "Cada año", "12 meses después de hacerla". */
export function recurrenceLabel(t: T, r: TaskRecurrence): string {
  return t(`groups.tasks.recurs.${r.kind}.${r.unit}`, { n: r.interval });
}

/** "60 días antes", "El mismo día", "3 días después". */
export function offsetLabel(t: T, offsetDays: number): string {
  if (offsetDays === 0) return t('groups.tasks.templates.offsetSame');
  return offsetDays < 0
    ? t('groups.tasks.templates.offsetBefore', { n: -offsetDays })
    : t('groups.tasks.templates.offsetAfter', { n: offsetDays });
}

/** `HH:MM`, or null for a blank or malformed entry. */
export function parseTimeOfDay(text: string): string | null {
  const m = /^(\d{1,2})[:.h](\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** A whole number in [min, max] typed by hand, or null. Accepts a leading minus. */
export function parseIntIn(text: string, min: number, max: number): number | null {
  const trimmed = text.trim().replace('−', '-');
  if (!/^-?\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= min && n <= max ? n : null;
}

import { z } from 'zod';
import { formatPrice } from '../../utils/format';
import type { SocioCuotaStatus } from './cuotaStatus';

/**
 * Per-recipient placeholders in a group message's title and body. The admin
 * writes `{nombre}`, `{nº socio}` or `{cuota pendiente}` (the composer's chips
 * insert them); every channel that reaches one person — the email, the push,
 * a per-person WhatsApp link, the member's own view in the app — puts that
 * person's value in its place. A household (a member and their personas a
 * cargo) gets the account holder's own name and number, and what the whole
 * household still owes.
 *
 * Where there is no value — the share to the group's own WhatsApp chat, or a
 * socio without a number — the text is rendered neutrally: a missing name is
 * dropped from its sentence ("Hola {nombre}," → "Hola,"), and a line that needs
 * a missing number or cuota is left out entirely, since it only makes sense
 * for one person ("Tu nº de socio es el {nº socio}.").
 *
 * Typed by hand the tokens are forgiving: case, accents and spaces aside,
 * `{numero}`, `{n socio}`… and `{cuota}` work too. Any other `{…}` is left alone.
 */

export const GroupMessagePlaceholderSchema = z.enum(['nombre', 'numero', 'cuota']);
export type GroupMessagePlaceholder = z.infer<typeof GroupMessagePlaceholderSchema>;
export const GROUP_MESSAGE_PLACEHOLDERS: readonly GroupMessagePlaceholder[] = GroupMessagePlaceholderSchema.options;

/** What the composer's chips insert. */
export const GROUP_MESSAGE_PLACEHOLDER_TOKEN: Record<GroupMessagePlaceholder, string> = {
  nombre: '{nombre}',
  numero: '{nº socio}',
  cuota: '{cuota pendiente}',
};

const ALIASES: Record<string, GroupMessagePlaceholder> = {
  nombre: 'nombre',
  nosocio: 'numero',
  nsocio: 'numero',
  numsocio: 'numero',
  numero: 'numero',
  numerosocio: 'numero',
  numerodesocio: 'numero',
  ndesocio: 'numero',
  nodesocio: 'numero',
  cuota: 'cuota',
  cuotapendiente: 'cuota',
};

/** One recipient's values; null = none, rendered neutrally. */
export const GroupMessagePersonalValuesSchema = z.object({
  nombre: z.string().nullable(),
  numero: z.number().int().nullable(),
  /** What the recipient's household owes for the current period, in cents; null when nothing. */
  cuotaCents: z.number().int().min(0).nullable(),
});
export type GroupMessagePersonalValues = z.infer<typeof GroupMessagePersonalValuesSchema>;

export const NEUTRAL_PERSONAL_VALUES: GroupMessagePersonalValues = { nombre: null, numero: null, cuotaCents: null };

const TOKEN = /\{([^{}\n]{1,30})\}/g;

function placeholderOf(inner: string | undefined): GroupMessagePlaceholder | null {
  const key = (inner ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return ALIASES[key] ?? null;
}

/** Which placeholders a text uses. */
export function groupMessagePlaceholdersIn(text: string): Set<GroupMessagePlaceholder> {
  const found = new Set<GroupMessagePlaceholder>();
  for (const m of text.matchAll(TOKEN)) {
    const p = placeholderOf(m[1]);
    if (p) found.add(p);
  }
  return found;
}

function valueText(p: GroupMessagePlaceholder, v: GroupMessagePersonalValues): string | null {
  if (p === 'nombre') return v.nombre?.trim() || null;
  if (p === 'numero') return v.numero === null ? null : String(v.numero);
  return v.cuotaCents === null || v.cuotaCents <= 0 ? null : formatPrice(v.cuotaCents / 100);
}

/** After a token came out: no space before punctuation, no doubled spaces, no leading comma. */
function tidy(line: string): string {
  return line
    .replace(/[ \t]+([,.;:!?)])/g, '$1')
    .replace(/[,;:](?=[.!?:;,])/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]*[,;:][ \t]*/, '')
    .trim();
}

function renderLine(line: string, v: GroupMessagePersonalValues, dropLines: boolean): string | null {
  const used = [...line.matchAll(TOKEN)].flatMap((m) => placeholderOf(m[1]) ?? []);
  if (used.length === 0) return line;
  const missing = used.filter((p) => valueText(p, v) === null);
  if (dropLines && missing.some((p) => p !== 'nombre')) return null;
  const out = line.replace(TOKEN, (whole: string, inner: string) => {
    const p = placeholderOf(inner);
    return p ? (valueText(p, v) ?? '') : whole;
  });
  return missing.length > 0 ? tidy(out) : out;
}

/**
 * A message's text for one recipient (`values`) or for no one in particular
 * (`NEUTRAL_PERSONAL_VALUES`). A `title` is one line and never dropped.
 */
export function renderGroupMessageText(
  text: string,
  values: GroupMessagePersonalValues,
  kind: 'title' | 'body' = 'body',
): string {
  if (kind === 'title') return renderLine(text, values, false) ?? '';
  const kept: string[] = [];
  let droppedAny = false;
  for (const line of text.split('\n')) {
    const rendered = renderLine(line, values, true);
    if (rendered === null) droppedAny = true;
    else kept.push(rendered);
  }
  // A dropped line must not leave two blank lines behind.
  return droppedAny ? kept.join('\n').replace(/\n{3,}/g, '\n\n').trim() : kept.join('\n');
}

/** Title and body of a message, for one recipient. */
export function personalizeGroupMessage<T extends { title: string; body: string }>(
  message: T,
  values: GroupMessagePersonalValues,
): T {
  return { ...message, title: renderGroupMessageText(message.title, values, 'title'), body: renderGroupMessageText(message.body, values) };
}

/**
 * One recipient's values: the account holder's own name and socio number, and
 * what the rows they answer for still owe this period (a row covered by the
 * household owes nothing of its own).
 */
export function groupMessageRecipientValues(input: {
  holderName: string | null;
  holderNumber: number | null;
  socioIds: readonly string[];
  /** The current period's statuses, or null when the group keeps no cuota. */
  statuses: readonly Pick<SocioCuotaStatus, 'socioId' | 'owedCents' | 'paidCents' | 'status'>[] | null;
}): GroupMessagePersonalValues {
  const ids = new Set(input.socioIds);
  const owed = (input.statuses ?? [])
    .filter((s) => ids.has(s.socioId) && s.status !== 'al_dia')
    .reduce((sum, s) => sum + Math.max(0, s.owedCents - s.paidCents), 0);
  return {
    nombre: input.holderName?.trim() || null,
    numero: input.holderNumber,
    cuotaCents: owed > 0 ? owed : null,
  };
}

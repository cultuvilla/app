import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import {
  cosaAvailability,
  cosaRequestFlow,
  isCosaRequestAnsweredBy,
  isCosaRequestOverdue,
  isOpenCosaRequest,
  isSharedCosa,
  type CosaCategory,
  type CosaData,
  type CosaKind,
  type CosaRequestAction,
  type CosaRequestData,
} from '@cultuvilla/shared/models/organization';
import { formatDayKey } from '@cultuvilla/shared/utils';
import type { I18n } from '../../../../lib/i18n';

type T = I18n['t'];
type IconName = ComponentProps<typeof Ionicons>['name'];

/** The tile a cosa without a photo shows: its category's icon on the category's colour. */
export const COSA_CATEGORY_TILES: Record<CosaCategory, { icon: IconName; className: string }> = {
  herramientas: { icon: 'hammer-outline', className: 'bg-secondary-subtle/40' },
  cocina: { icon: 'restaurant-outline', className: 'bg-accent-subtle/30' },
  fiestas: { icon: 'balloon-outline', className: 'bg-subtle/50' },
  deporte: { icon: 'football-outline', className: 'bg-secondary-subtle/25' },
  ninos: { icon: 'happy-outline', className: 'bg-accent-subtle/20' },
  jardin: { icon: 'leaf-outline', className: 'bg-secondary-subtle/50' },
  libros: { icon: 'book-outline', className: 'bg-subtle/30' },
  otros: { icon: 'cube-outline', className: 'bg-accent-subtle/40' },
};

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** The cosas whose name, description or owner holds every word of `query`, accents and case aside. */
export function searchCosas<C extends Pick<CosaData, 'title' | 'description' | 'ownerName'>>(cosas: readonly C[], query: string): C[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...cosas];
  return cosas.filter((c) => {
    const haystack = fold(`${c.title} ${c.description ?? ''} ${c.ownerName}`);
    return words.every((w) => haystack.includes(w));
  });
}

/** The one chip on a cosa's photo: "Libre", "hasta 18 nov", "Prestada", "En pausa". */
export function cosaStatusChip(t: T, cosa: Pick<CosaData, 'status' | 'heldBy'>): { label: string; free: boolean } {
  const state = cosaAvailability(cosa);
  if (state === 'available') return { label: t('groups.cosateca.chip.free'), free: true };
  if (state === 'lent') {
    const until = cosa.heldBy?.untilOn;
    return {
      label: until ? t('groups.cosateca.chip.until', { date: formatDayKey(until, 'dayMonthShort') }) : t('groups.cosateca.chip.lent'),
      free: false,
    };
  }
  return { label: t(`groups.cosateca.availability.${state}`), free: false };
}

/** How a cosa is shared, in words for its card ("se reserva", "servicio"); a préstamo says nothing. */
export function cosaKindWord(t: T, kind: CosaKind): string | null {
  return kind === 'prestamo' ? null : t(`groups.cosateca.kindWords.${kind}`);
}

/** A card's second line: who offers it, then how it is shared, or else where it is kept. */
export function cosaCardSubtitle(t: T, cosa: Pick<CosaData, 'ownerUid' | 'ownerName' | 'kind' | 'locationNote'>): string {
  const owner = cosa.ownerUid === null ? t('groups.cosateca.ofGroup') : cosa.ownerName;
  const second = cosaKindWord(t, cosa.kind) ?? cosa.locationNote;
  return second ? `${owner} · ${second}` : owner;
}

type Req = CosaRequestData & { id: string };

/**
 * Something in the cosateca waiting on the viewer, and why: a request to
 * answer, something to hand over or finish, or a loan whose date has passed.
 * `primary` is the one-tap move its card offers (none for something you hold
 * past its date: that one is talked over in its chat).
 */
export type TocaItem = {
  request: Req;
  reason: 'answer' | 'handOver' | 'give' | 'finish' | 'overdueLent' | 'overdueHeld';
  late: boolean;
  primary: CosaRequestAction | null;
};

/** Something under way that waits on someone else, or on a date. */
export type CursoItem = {
  request: Req;
  reason: 'holding' | 'lentOut' | 'waiting' | 'accepted' | 'booked';
};

export type EnMarcha = { toca: TocaItem[]; curso: CursoItem[] };

function asManager(r: Req, today: string): TocaItem | CursoItem | null {
  const flow = cosaRequestFlow(r.cosaKind, r.ownerUid);
  if (r.status === 'pending') return { request: r, reason: 'answer', late: false, primary: 'accept' };
  if (r.status === 'accepted') {
    if (flow === 'reserva') return { request: r, reason: 'booked' };
    if (flow === 'servicio') return { request: r, reason: 'finish', late: false, primary: 'done' };
    if (flow === 'regalo') return { request: r, reason: 'give', late: false, primary: 'give' };
    return { request: r, reason: 'handOver', late: false, primary: 'lend' };
  }
  // A shared cosa handed on is its new holder's to pass along, not the giver's.
  if (r.status === 'lent' && flow === 'prestamo') {
    return isCosaRequestOverdue(r, today)
      ? { request: r, reason: 'overdueLent', late: true, primary: 'return' }
      : { request: r, reason: 'lentOut' };
  }
  return null;
}

function asRequester(r: Req, today: string): TocaItem | CursoItem | null {
  if (r.status === 'pending') return { request: r, reason: 'waiting' };
  if (r.status === 'accepted') return { request: r, reason: r.cosaKind === 'reserva' ? 'booked' : 'accepted' };
  if (r.status === 'lent') {
    return isCosaRequestOverdue(r, today)
      ? { request: r, reason: 'overdueHeld', late: true, primary: null }
      : { request: r, reason: 'holding' };
  }
  return null;
}

/** The day a curso row is about: when it goes back, or when it starts. */
function cursoDay(r: Req): string {
  return r.untilOn ?? r.fromOn ?? '9999-12-31';
}

/**
 * What is going on for the viewer right now, split by who moves next. "Te
 * toca" is everything waiting on them, overdue first, then the oldest; "En
 * curso" waits on someone else or on a date, the soonest first. A request the
 * viewer made is always theirs as requester, and a shared cosa someone else
 * holds is that holder's to answer, not every admin's.
 */
export function enMarcha(incoming: readonly Req[], mine: readonly Req[], uid: string, today: string): EnMarcha {
  const toca: TocaItem[] = [];
  const curso: CursoItem[] = [];
  const place = (item: TocaItem | CursoItem | null) => {
    if (!item) return;
    if ('primary' in item) toca.push(item);
    else curso.push(item);
  };
  const seen = new Set<string>();
  for (const r of mine) {
    if (r.requesterUid !== uid || seen.has(r.id)) continue;
    seen.add(r.id);
    place(asRequester(r, today));
  }
  for (const r of incoming) {
    if (r.requesterUid === uid || seen.has(r.id) || !isCosaRequestAnsweredBy(r, uid)) continue;
    seen.add(r.id);
    place(asManager(r, today));
  }
  toca.sort((a, b) => Number(b.late) - Number(a.late) || a.request.createdAt.getTime() - b.request.createdAt.getTime());
  curso.sort((a, b) => cursoDay(a.request).localeCompare(cursoDay(b.request)) || b.request.createdAt.getTime() - a.request.createdAt.getTime());
  return { toca, curso };
}

/** When what you hold goes back: its date, unless it is a group's cosa that travels on. */
export function holdingUntil(req: Pick<CosaRequestData, 'untilOn' | 'cosaKind' | 'ownerUid'>): string | null {
  if (isSharedCosa({ kind: req.cosaKind, ownerUid: req.ownerUid })) return null;
  return req.untilOn;
}

/** Every request in this group, asked by or of the viewer, in one list: open ones first, then newest. */
export function cosatecaInbox(incoming: readonly Req[], mine: readonly Req[]): Req[] {
  const rows = new Map<string, Req>();
  for (const r of [...mine, ...incoming]) rows.set(r.id, r);
  return [...rows.values()].sort(
    (a, b) =>
      Number(isOpenCosaRequest(b.status)) - Number(isOpenCosaRequest(a.status)) || b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

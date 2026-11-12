import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import {
  cosaAvailability,
  isOpenCosaRequest,
  isSharedCosa,
  type CosaCategory,
  type CosaData,
  type CosaKind,
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

/** One card of the "En marcha" strip: something asked of you, or something you hold. */
export type EnMarchaItem = { type: 'asked'; request: Req } | { type: 'holding'; request: Req };

/**
 * What is going on for the viewer right now: requests to answer (pending
 * first), then what they hold, the soonest back first.
 */
export function enMarcha(incoming: readonly Req[], mine: readonly Req[]): EnMarchaItem[] {
  const asked = incoming
    .filter((r) => r.status === 'pending' || r.status === 'accepted')
    .sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || b.createdAt.getTime() - a.createdAt.getTime())
    .map((request): EnMarchaItem => ({ type: 'asked', request }));
  const holding = mine
    .filter((r) => r.status === 'lent')
    .sort((a, b) => (a.untilOn ?? '9999').localeCompare(b.untilOn ?? '9999'))
    .map((request): EnMarchaItem => ({ type: 'holding', request }));
  return [...asked, ...holding];
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

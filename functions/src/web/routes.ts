import {
  EDIT_SEGMENT,
  ENTITY_SEGMENT,
  JOIN_SEGMENT,
  NEW_WORD_SEGMENT,
  SEAT_CLAIM_SEGMENT,
  VILLAGE_SECTIONS,
  WORD_SEGMENT,
  WRAPPED_SEGMENT,
  isReservedRootSegment,
  parseEntityRef,
  type UrlEntityKind,
  type VillageSection,
} from '@cultuvilla/shared/utils';

/** Village sections an anonymous reader may see; the rest are member/admin screens. */
export const PUBLIC_SECTIONS = [
  'barrios',
  'carteles',
  'entidades',
  'historia',
  'lugares',
  'vocabulario',
] as const satisfies readonly VillageSection[];

export type PublicSection = (typeof PUBLIC_SECTIONS)[number];

export const LEGAL_PAGES = ['privacidad', 'terminos', 'eliminar-cuenta'] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];

export type WebRoute =
  | { type: 'home' }
  | { type: 'download' }
  /** The directory of every active pueblo, with one shown in full. */
  | { type: 'villages' }
  | { type: 'legal'; page: LegalPage }
  | { type: 'village'; villageSlug: string }
  | { type: 'section'; villageSlug: string; section: PublicSection }
  | { type: 'entity'; kind: UrlEntityKind; villageSlug: string; ref: string; id: string }
  | { type: 'invite'; villageSlug: string; ref: string; id: string }
  | { type: 'word'; villageSlug: string; termSlug: string }
  | { type: 'wrapped'; villageSlug: string; year: number }
  /** A screen that exists only in the app: forms, account, member/admin views. */
  | { type: 'appOnly' }
  | { type: 'notFound' };

const SEGMENT_TO_ENTITY = new Map<string, UrlEntityKind>(
  (Object.keys(ENTITY_SEGMENT) as UrlEntityKind[]).map((kind) => [ENTITY_SEGMENT[kind], kind]),
);
const NOT_FOUND: WebRoute = { type: 'notFound' };
const APP_ONLY: WebRoute = { type: 'appOnly' };

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function includes<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

export function matchRoute(pathname: string): WebRoute {
  const decoded = pathname.split('/').filter(Boolean).map(decode);
  if (decoded.some((s) => s === null)) return NOT_FOUND;
  const segments = decoded as string[];
  const [first, second, third, fourth] = segments;

  if (!first) return { type: 'home' };
  if (first === 'descarga') return segments.length === 1 ? { type: 'download' } : NOT_FOUND;
  if (first === 'pueblos') return segments.length === 1 ? { type: 'villages' } : NOT_FOUND;
  if (first === 'legal') {
    return segments.length === 2 && second && includes(LEGAL_PAGES, second)
      ? { type: 'legal', page: second }
      : NOT_FOUND;
  }
  // Every other reserved root is an app screen (account, inbox, forms…), so a
  // link to one is answered with the app, not a 404.
  if (isReservedRootSegment(first)) return APP_ONLY;

  const villageSlug = first;
  if (!second) return { type: 'village', villageSlug };

  if (segments.length === 2) {
    if (includes(PUBLIC_SECTIONS, second)) return { type: 'section', villageSlug, section: second };
    if (includes(VILLAGE_SECTIONS, second)) return APP_ONLY;
    return NOT_FOUND;
  }

  if (second === WRAPPED_SEGMENT) {
    return segments.length === 3 && third && /^\d{4}$/.test(third)
      ? { type: 'wrapped', villageSlug, year: Number(third) }
      : NOT_FOUND;
  }

  if (second === WORD_SEGMENT && third) {
    if (third === NEW_WORD_SEGMENT || segments.length > 3) return APP_ONLY;
    return { type: 'word', villageSlug, termSlug: third };
  }

  const kind = SEGMENT_TO_ENTITY.get(second);
  if (!kind || !third) return NOT_FOUND;
  // `/acontecimiento/nuevo` is the create form, not a ref.
  if (kind === 'historyEntry' && third === 'nuevo' && segments.length === 3) return APP_ONLY;
  const id = parseEntityRef(third);
  if (!id) return NOT_FOUND;

  if (segments.length === 3) return { type: 'entity', kind, villageSlug, ref: third, id };
  if (segments.length === 4 && kind === 'organization' && fourth === JOIN_SEGMENT) {
    return { type: 'invite', villageSlug, ref: third, id };
  }
  if (segments.length === 4 && fourth === EDIT_SEGMENT) return APP_ONLY;
  if (segments.length === 5 && kind === 'event' && fourth === SEAT_CLAIM_SEGMENT) return APP_ONLY;
  return NOT_FOUND;
}

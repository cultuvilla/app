/**
 * The shape of every public Cultuvilla URL. Pure — no Expo, no Firebase — so the
 * mobile app, the Cloud Functions (share previews, sitemap, emails) and vitest
 * all build and parse paths from the same table.
 *
 * Paths are Spanish and village-first: `/matabuena/evento/fiestas_<id>`. See
 * docs/decisions/spanish-village-urls.md.
 */

/**
 * Lowercase, fold accents (ñ → n), and collapse every run of anything that is
 * not a letter or digit into one dash. A slug is a key, not a rendering: `ñ`
 * would be percent-encoded in a shared link, which reads worse than `n`.
 */
export function slugify(text: string): string {
  return text
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * First path segments that belong to the app, so no pueblo may take them as its
 * slug. Every top-level static route under `apps/mobile/app/` must be listed —
 * a test there fails otherwise — plus the paths Hosting serves itself.
 */
export const RESERVED_ROOT_SEGMENTS = [
  'admin',
  'ajustes',
  'buzon',
  'completar-perfil',
  'crear',
  'descarga',
  'descubrir',
  'embajadores',
  'entrar',
  'estudio',
  'grupos',
  'legal',
  'mi-pueblo',
  'mis-inscripciones',
  'mis-pueblos',
  'perfil',
  'persona',
  'pueblos',
  'usuario',
  // Served by Hosting / the web export, never by a route file.
  '_expo',
  'brand',
  'favicon.ico',
  'assets',
  'index.html',
  'robots.txt',
  'sitemap.xml',
  '.well-known',
] as const;

const RESERVED = new Set<string>(RESERVED_ROOT_SEGMENTS);

export function isReservedRootSegment(segment: string): boolean {
  return RESERVED.has(segment);
}

/** Village-scoped entities that open a detail screen of their own. */
export const ENTITY_SEGMENT = {
  event: 'evento',
  news: 'noticia',
  organization: 'entidad',
  place: 'lugar',
  barrio: 'barrio',
  festivalPoster: 'cartel',
  historyEntry: 'acontecimiento',
} as const;

export type UrlEntityKind = keyof typeof ENTITY_SEGMENT;

const SEGMENT_TO_ENTITY: { readonly [segment: string]: UrlEntityKind | undefined } = Object.fromEntries(
  (Object.keys(ENTITY_SEGMENT) as UrlEntityKind[]).map((kind) => [ENTITY_SEGMENT[kind], kind]),
);

/** Listing and admin screens under a pueblo — `/<pueblo>/<section>`. */
export const VILLAGE_SECTIONS = [
  'barrios',
  'carteles',
  'censo',
  'comunidad',
  'denuncias',
  'editar',
  'entidades',
  'historia',
  'lugares',
  'miembros',
  'resumen',
  'vocabulario',
] as const;

export type VillageSection = (typeof VILLAGE_SECTIONS)[number];

export const EDIT_SEGMENT = 'editar';
export const JOIN_SEGMENT = 'unirse';
export const SEAT_CLAIM_SEGMENT = 'plaza';
export const WORD_SEGMENT = 'palabra';
export const NEW_WORD_SEGMENT = 'nueva';
export const WRAPPED_SEGMENT = 'fiestas';
/** The web studio, a separate app Hosting serves under this segment. */
export const STUDIO_SEGMENT = 'estudio';
export const STUDIO_PAIRING_SEGMENT = 'vincular';

/**
 * The first `_` splits a ref: slugs only ever contain `[a-z0-9-]`, while ids may
 * contain `-` (seed ids do), so `_` is the one separator that is unambiguous.
 */
const REF_SEPARATOR = '_';

/**
 * `<slug of the title>_<id>`. The id is authoritative; the slug is decoration and
 * may go stale when the title is edited — `parseEntityRef` ignores it, and the
 * share-preview server redirects a stale one to the current form.
 */
export function entityRef(title: string, id: string): string {
  if (!id) throw new Error('entityRef: id is required');
  return `${slugify(title)}${REF_SEPARATOR}${id}`;
}

/** The id inside a ref. A ref without a separator is taken as a bare id. */
export function parseEntityRef(ref: string): string | null {
  const at = ref.indexOf(REF_SEPARATOR);
  const id = at === -1 ? ref : ref.slice(at + 1);
  return id.length > 0 ? id : null;
}

/** What a link needs to know about an entity to build its path. */
export interface EntityLinkTarget {
  id: string;
  /** Title or name — only its slug reaches the URL. */
  title: string;
  villageSlug: string;
}

function requireVillageSlug(villageSlug: string): string {
  if (!villageSlug) throw new Error('urls: villageSlug is required');
  return villageSlug;
}

export function villagePath(villageSlug: string): string {
  return `/${requireVillageSlug(villageSlug)}`;
}

export function villageSectionPath(villageSlug: string, section: VillageSection): string {
  return `${villagePath(villageSlug)}/${section}`;
}

export function entityPath(kind: UrlEntityKind, target: EntityLinkTarget): string {
  return `${villagePath(target.villageSlug)}/${ENTITY_SEGMENT[kind]}/${entityRef(target.title, target.id)}`;
}

export function entityEditPath(
  kind: Extract<UrlEntityKind, 'organization' | 'place' | 'barrio' | 'festivalPoster' | 'historyEntry'>,
  target: EntityLinkTarget,
): string {
  return `${entityPath(kind, target)}/${EDIT_SEGMENT}`;
}

export function orgJoinPath(target: EntityLinkTarget): string {
  return `${entityPath('organization', target)}/${JOIN_SEGMENT}`;
}

export function seatClaimPath(target: EntityLinkTarget, token: string): string {
  if (!token) throw new Error('urls: token is required for a seat claim');
  return `${entityPath('event', target)}/${SEAT_CLAIM_SEGMENT}/${token}`;
}

export function wordPath(villageSlug: string, termSlug: string): string {
  return `${villagePath(villageSlug)}/${WORD_SEGMENT}/${termSlug}`;
}

export function newWordPath(villageSlug: string): string {
  return `${villagePath(villageSlug)}/${WORD_SEGMENT}/${NEW_WORD_SEGMENT}`;
}

/** A village's fiestas Wrapped for one year — `/matabuena/fiestas/2026`. */
export function wrappedPath(villageSlug: string, year: number): string {
  return `${villagePath(villageSlug)}/${WRAPPED_SEGMENT}/${String(year)}`;
}

export function personPath(personId: string): string {
  return `/persona/${personId}`;
}

/** The Grupos tab, opened on one group (the private side: cuota, socios). */
export function groupPath(orgId: string): string {
  return `/grupos?grupo=${encodeURIComponent(orgId)}`;
}

/** The screens of a group's private side, each opened from the group home. */
export const GROUP_SECTIONS = [
  'avisos',
  'charla',
  'eventos',
  'tareas',
  'cuota',
  'actas',
  'mis-datos',
  'socios',
  'cobros',
  'mensajes',
  'registros',
  'miembros',
  'ajustes',
] as const;

export type GroupSection = (typeof GROUP_SECTIONS)[number];

export function isGroupSection(value: string): value is GroupSection {
  return (GROUP_SECTIONS as readonly string[]).includes(value);
}

/** One screen of a group — `/grupos/<orgId>/cuota`. */
export function groupSectionPath(orgId: string, section: GroupSection): string {
  return `/grupos/${encodeURIComponent(orgId)}/${section}`;
}

/** One aviso and its chat, inside the app — `/grupos/<orgId>/aviso/<messageId>`. */
export function groupAvisoPath(orgId: string, messageId: string): string {
  return `/grupos/${encodeURIComponent(orgId)}/aviso/${encodeURIComponent(messageId)}`;
}

/**
 * The link an aviso's WhatsApp text and email carry. A query on the tab rather
 * than `groupAvisoPath`: those messages outlive app versions, and a binary with
 * no aviso route still opens the group from this one.
 */
export function groupAvisoLinkPath(orgId: string, messageId: string): string {
  return `${groupPath(orgId)}&aviso=${encodeURIComponent(messageId)}`;
}

export function userPath(uid: string): string {
  return `/usuario/${uid}`;
}

/**
 * Where the studio's QR code points: the app opens it to approve a studio
 * sign-in, and the studio answers it on a phone without the app.
 */
export function studioPairingPath(pairingId: string): string {
  if (!pairingId) throw new Error('urls: pairingId is required for a studio pairing');
  return `/${STUDIO_SEGMENT}/${STUDIO_PAIRING_SEGMENT}/${pairingId}`;
}

export type ParsedAppPath =
  | { type: 'village'; villageSlug: string }
  | {
      type: 'entity';
      kind: UrlEntityKind;
      villageSlug: string;
      /** The ref segment as it appeared — compare with `entityRef` to detect a stale slug. */
      ref: string;
      id: string;
      /** `unirse` on an organization — the invite form of its link. */
      join?: true;
    }
  | { type: 'seatClaim'; villageSlug: string; ref: string; id: string; token: string }
  | { type: 'wrapped'; villageSlug: string; year: number }
  | { type: 'user'; uid: string }
  | { type: 'studioPairing'; pairingId: string };

/**
 * Recognises the shareable paths — the ones a link from outside the app may
 * carry. Screens reachable only by navigating inside the app (edit forms,
 * listings) return null.
 */
export function parseAppPath(pathname: string): ParsedAppPath | null {
  const segments = pathname.split('/').filter(Boolean).map(safeDecode);
  if (segments.some((s) => s === null)) return null;
  const [first, second, third, fourth, fifth] = segments as string[];
  if (!first) return null;

  if (first === 'usuario') {
    return segments.length === 2 && second ? { type: 'user', uid: second } : null;
  }
  if (first === STUDIO_SEGMENT) {
    return segments.length === 3 && second === STUDIO_PAIRING_SEGMENT && third
      ? { type: 'studioPairing', pairingId: third }
      : null;
  }
  if (isReservedRootSegment(first)) return null;

  if (segments.length === 1) return { type: 'village', villageSlug: first };

  if (second === WRAPPED_SEGMENT) {
    return segments.length === 3 && third && /^\d{4}$/.test(third)
      ? { type: 'wrapped', villageSlug: first, year: Number(third) }
      : null;
  }

  const kind = second ? SEGMENT_TO_ENTITY[second] : undefined;
  if (!kind || !third) return null;
  const id = parseEntityRef(third);
  if (!id) return null;
  const entity = { type: 'entity' as const, kind, villageSlug: first, ref: third, id };

  if (segments.length === 3) return entity;
  if (segments.length === 4 && kind === 'organization' && fourth === JOIN_SEGMENT) {
    return { ...entity, join: true };
  }
  if (segments.length === 5 && kind === 'event' && fourth === SEAT_CLAIM_SEGMENT && fifth) {
    return { type: 'seatClaim', villageSlug: first, ref: third, id, token: fifth };
  }
  return null;
}

function safeDecode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * The link target of an event. A private event's URL must not carry its title:
 * the share preview withholds it from anyone outside the org, and a slug in the
 * link itself would hand it to every chat the link is pasted into.
 */
export function eventLinkTarget(event: {
  id: string;
  title: string;
  villageSlug: string;
  visibilityOrgId?: string | null;
}): EntityLinkTarget {
  return {
    id: event.id,
    title: event.visibilityOrgId ? 'evento privado' : event.title,
    villageSlug: event.villageSlug,
  };
}

/** A cartel may have no title; the year is what people search for. */
export function festivalPosterLinkTarget(poster: {
  id: string;
  title: string | null;
  year: number;
  villageSlug: string;
}): EntityLinkTarget {
  return {
    id: poster.id,
    title: poster.title ?? `cartel ${String(poster.year)}`,
    villageSlug: poster.villageSlug,
  };
}

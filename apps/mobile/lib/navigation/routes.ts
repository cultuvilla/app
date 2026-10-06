import type { Href } from 'expo-router';
import {
  ENTITY_SEGMENT,
  entityEditPath,
  entityPath,
  eventLinkTarget,
  festivalPosterLinkTarget,
  newWordPath,
  orgJoinPath,
  personPath,
  seatClaimPath,
  userPath,
  villagePath,
  villageSectionPath,
  wordPath,
  wrappedPath,
  type EntityLinkTarget,
  type UrlEntityKind,
  type VillageSection,
} from '@cultuvilla/shared/utils';

/**
 * Every in-app destination, in one place. Paths are built by the shared URL
 * module so a screen, a share link and the server's sitemap can never disagree
 * about where something lives. Screens navigate through these helpers — never a
 * hand-written path string.
 */

/**
 * Typed-route paths are a string union; `Href` also admits an object form. We
 * always build strings, and keeping that in the type lets a path be passed to
 * APIs that take a plain string (the guest register gate) as well as to router
 * navigation.
 */
type HrefPath = Extract<Href, string>;

const href = (path: string): HrefPath => path as HrefPath;

export const routes = {
  home: href('/(tabs)'),
  myVillage: href('/(tabs)/mi-pueblo'),
  profile: href('/(tabs)/perfil'),
  login: href('/(auth)/entrar'),
  completeProfile: href('/(onboarding)/completar-perfil'),
  inbox: href('/buzon'),
  settings: href('/ajustes'),
  blockedUsers: href('/ajustes/bloqueados'),
  changeEmail: href('/ajustes/cambiar-email'),
  deleteAccount: href('/ajustes/eliminar-cuenta'),
  notificationSettings: href('/ajustes/notificaciones'),
  myRegistrations: href('/mis-inscripciones'),
  myVillages: href('/mis-pueblos'),
  discover: href('/descubrir'),
  terms: href('/legal/terminos'),
  privacy: href('/legal/privacidad'),
  admin: href('/admin'),
  adminOrganizerRequests: href('/admin/solicitudes-organizador'),
  adminReports: href('/admin/denuncias'),
} as const;

/** The transient `villageId` param lets the pueblo tab show a village without making it home. */
export function myVillageHref(villageId?: string): HrefPath {
  return villageId ? href(`/(tabs)/mi-pueblo?villageId=${encodeURIComponent(villageId)}`) : routes.myVillage;
}

export const villageHref = (villageSlug: string): HrefPath => href(villagePath(villageSlug));

export const villageSectionHref = (villageSlug: string, section: VillageSection, query?: string): HrefPath =>
  href(`${villageSectionPath(villageSlug, section)}${query ? `?${query}` : ''}`);

export const wrappedHref = (villageSlug: string, year: number): HrefPath => href(wrappedPath(villageSlug, year));

export const eventHref = (event: Parameters<typeof eventLinkTarget>[0]): HrefPath =>
  href(entityPath('event', eventLinkTarget(event)));

export const seatClaimHref = (event: Parameters<typeof eventLinkTarget>[0], token: string): HrefPath =>
  href(seatClaimPath(eventLinkTarget(event), token));

export const newsHref = (post: { id: string; title: string; villageSlug: string }): HrefPath =>
  href(entityPath('news', post));

export const orgHref = (org: { id: string; name: string; villageSlug: string }, query?: string): HrefPath =>
  href(`${entityPath('organization', orgTarget(org))}${query ? `?${query}` : ''}`);

export const orgEditHref = (org: { id: string; name: string; villageSlug: string }): HrefPath =>
  href(entityEditPath('organization', orgTarget(org)));

export const orgJoinHref = (org: { id: string; name: string; villageSlug: string }): HrefPath =>
  href(orgJoinPath(orgTarget(org)));

export const placeHref = (villageSlug: string, place: { id: string; name: string }): HrefPath =>
  href(entityPath('place', { id: place.id, title: place.name, villageSlug }));

export const placeEditHref = (villageSlug: string, place: { id: string; name: string }): HrefPath =>
  href(entityEditPath('place', { id: place.id, title: place.name, villageSlug }));

export const barrioHref = (villageSlug: string, barrio: { id: string; name: string }): HrefPath =>
  href(entityPath('barrio', { id: barrio.id, title: barrio.name, villageSlug }));

export const barrioEditHref = (villageSlug: string, barrio: { id: string; name: string }): HrefPath =>
  href(entityEditPath('barrio', { id: barrio.id, title: barrio.name, villageSlug }));

export const festivalPosterHref = (poster: Parameters<typeof festivalPosterLinkTarget>[0]): HrefPath =>
  href(entityPath('festivalPoster', festivalPosterLinkTarget(poster)));

export const festivalPosterEditHref = (poster: Parameters<typeof festivalPosterLinkTarget>[0]): HrefPath =>
  href(entityEditPath('festivalPoster', festivalPosterLinkTarget(poster)));

export const wordHref = (villageSlug: string, termSlug: string): HrefPath => href(wordPath(villageSlug, termSlug));

/** Adding a meaning to an existing word. */
export const defineWordHref = (villageSlug: string, termSlug: string): HrefPath =>
  href(`${wordPath(villageSlug, termSlug)}/definir`);

export const newWordHref = (villageSlug: string, query?: string): HrefPath =>
  href(`${newWordPath(villageSlug)}${query ? `?${query}` : ''}`);

export const personHref = (personId: string, query?: string): HrefPath =>
  href(`${personPath(personId)}${query ? `?${query}` : ''}`);

export const userHref = (uid: string): HrefPath => href(userPath(uid));

/** Create-or-edit screens take their subject as query params, not a path. */
export function createEventHref(params: { villageId?: string; eventId?: string } = {}): HrefPath {
  return href(`/crear/evento${toQuery(params)}`);
}

export function createNewsHref(params: { villageId?: string; newsId?: string } = {}): HrefPath {
  return href(`/crear/noticia${toQuery(params)}`);
}

export const discoverOrganizeHref = (municipalityId: string): HrefPath =>
  href(`/descubrir/organizar/${municipalityId}`);

export const discoverStartHref = (municipalityId: string): HrefPath =>
  href(`/descubrir/empezar/${municipalityId}`);

function orgTarget(org: { id: string; name: string; villageSlug: string }): EntityLinkTarget {
  return { id: org.id, title: org.name, villageSlug: org.villageSlug };
}

function toQuery(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter((e): e is [string, string] => typeof e[1] === 'string');
  if (entries.length === 0) return '';
  return `?${entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

export const historyEntryHref = (entry: { id: string; title: string; villageSlug: string }): HrefPath =>
  href(entityPath('historyEntry', { id: entry.id, title: entry.title, villageSlug: entry.villageSlug }));

export const historyEntryEditHref = (entry: { id: string; title: string; villageSlug: string }): HrefPath =>
  href(entityEditPath('historyEntry', { id: entry.id, title: entry.title, villageSlug: entry.villageSlug }));

export const newHistoryEntryHref = (villageSlug: string): HrefPath =>
  href(`${villagePath(villageSlug)}/${ENTITY_SEGMENT.historyEntry}/nuevo`);

/**
 * The path of the entity whose ref this screen was opened with. A screen that
 * only holds the incoming ref — an edit form bouncing back to its subject —
 * rebuilds the URL it came from rather than inventing a title slug it would
 * have to load the doc to know.
 */
export const entityRefHref = (kind: UrlEntityKind, villageSlug: string, ref: string): HrefPath =>
  href(`${villagePath(villageSlug)}/${ENTITY_SEGMENT[kind]}/${ref}`);

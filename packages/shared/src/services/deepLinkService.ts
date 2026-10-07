import Constants from 'expo-constants';
import {
  entityPath,
  eventLinkTarget,
  orgJoinPath,
  parseAppPath,
  seatClaimPath,
  userPath,
  villagePath,
  wrappedPath,
  type EntityLinkTarget,
  type UrlEntityKind,
} from '../utils/urls';

export type LinkKind = 'content' | 'invite';
export type DeepLinkResource = UrlEntityKind | 'village' | 'user' | 'wrapped';

export interface DeepLink {
  url: string;
  /** The in-app route — the URL's path, which expo-router resolves as-is. */
  path: string;
  kind: LinkKind;
  resource: DeepLinkResource;
}

export function getDeepLinkHost(): string {
  const extra = Constants.expoConfig?.extra ?? {};
  const host: unknown = (extra as Record<string, unknown>)['deepLinkHost'];
  if (typeof host !== 'string' || host.length === 0) {
    throw new Error(
      'deepLinkService: extra.deepLinkHost is not configured. Set DEEP_LINK_HOST_<ENV> env vars or app.config.ts extra.deepLinkHost.',
    );
  }
  return host;
}

function link(resource: DeepLinkResource, path: string, kind: LinkKind = 'content'): DeepLink {
  return { url: `https://${getDeepLinkHost()}${path}`, path, kind, resource };
}

export const getVillageViewLink = (villageSlug: string): DeepLink =>
  link('village', villagePath(villageSlug));

export const getWrappedLink = (villageSlug: string, year: number): DeepLink =>
  link('wrapped', wrappedPath(villageSlug, year));

export const getUserViewLink = (uid: string): DeepLink => {
  if (!uid) throw new Error('deepLinkService: uid is required');
  return link('user', userPath(uid));
};

export const getEntityLink = (kind: UrlEntityKind, target: EntityLinkTarget): DeepLink =>
  link(kind, entityPath(kind, target));

/**
 * Event links go through `eventLinkTarget`, never straight to `getEntityLink`:
 * a private event's URL must not carry its title, and taking the rule out of
 * the caller's hands is what keeps a share sheet from leaking it.
 */
export const getEventLink = (event: Parameters<typeof eventLinkTarget>[0]): DeepLink =>
  getEntityLink('event', eventLinkTarget(event));
export const getNewsLink = (target: EntityLinkTarget): DeepLink => getEntityLink('news', target);
export const getOrgViewLink = (target: EntityLinkTarget): DeepLink =>
  getEntityLink('organization', target);
export const getPlaceViewLink = (target: EntityLinkTarget): DeepLink => getEntityLink('place', target);
export const getBarrioViewLink = (target: EntityLinkTarget): DeepLink =>
  getEntityLink('barrio', target);
export const getHistoryEntryViewLink = (target: EntityLinkTarget): DeepLink =>
  getEntityLink('historyEntry', target);

/** Same page as the view link; `unirse` makes the destination open its join flow. */
export const getOrgInviteLink = (target: EntityLinkTarget): DeepLink =>
  link('organization', orgJoinPath(target), 'invite');

/**
 * The link that hands one held open seat to whoever opens it. The token is a
 * secret, not an id — it rides only in this link, never in the view link that
 * share sheets and previews are built from.
 */
export const getSeatClaimLink = (
  event: Parameters<typeof eventLinkTarget>[0],
  token: string,
): DeepLink => link('event', seatClaimPath(eventLinkTarget(event), token), 'invite');

export interface ParsedDeepLink {
  path: string;
  kind: LinkKind;
  resource: DeepLinkResource;
}

const SCHEME = 'cultuvilla';

function interpret(pathname: string): ParsedDeepLink | null {
  const parsed = parseAppPath(pathname);
  if (!parsed) return null;
  const path = `/${pathname.split('/').filter(Boolean).join('/')}`;
  switch (parsed.type) {
    case 'village':
      return { path, kind: 'content', resource: 'village' };
    case 'user':
      return { path, kind: 'content', resource: 'user' };
    case 'wrapped':
      return { path, kind: 'content', resource: 'wrapped' };
    case 'seatClaim':
      return { path, kind: 'invite', resource: 'event' };
    case 'entity':
      return { path, kind: parsed.join ? 'invite' : 'content', resource: parsed.kind };
  }
}

/**
 * Accepts an https link on this env's host or a `cultuvilla://` scheme link.
 * Returns null for anything else — callers treat null as "let the OS open the
 * browser".
 */
export function parseLink(input: string): ParsedDeepLink | null {
  if (input.startsWith(`${SCHEME}://`)) {
    return interpret(input.slice(`${SCHEME}://`.length).split(/[?#]/)[0] ?? '');
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.hostname !== getDeepLinkHost()) return null;
  return interpret(url.pathname);
}

export type DeepLinkTranslate = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

export function buildShareMessage(
  deepLink: DeepLink,
  t: DeepLinkTranslate,
  name: string,
): string {
  const kindKey = deepLink.kind === 'invite' ? 'invite' : 'view';
  return t(`deeplink.share.${deepLink.resource}.${kindKey}`, {
    url: deepLink.url,
    name,
  });
}

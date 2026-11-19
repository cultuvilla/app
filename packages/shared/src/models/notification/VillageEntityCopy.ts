import type { EntityKind } from '../interaction/EntityKind';

/**
 * The kinds that broadcast to a village when they appear. This is the entity
 * family from AGENTS.md — `vocabularyTerm` is excluded because it is not an
 * entity (no card scroll, no hero detail) and a village would be pushed at
 * every word someone adds to the dictionary.
 */
export const BROADCAST_ENTITY_KINDS = [
  'event',
  'news',
  'place',
  'barrio',
  'organization',
  'festivalPoster',
  'historyEntry',
] as const;
export type BroadcastEntityKind = (typeof BROADCAST_ENTITY_KINDS)[number];

export function isBroadcastEntityKind(kind: EntityKind): kind is BroadcastEntityKind {
  return (BROADCAST_ENTITY_KINDS as readonly string[]).includes(kind);
}

const HEADLINE: Record<BroadcastEntityKind, string> = {
  event: 'Nuevo evento',
  news: 'Nueva publicación',
  historyEntry: 'Nueva entrada de historia',
  place: 'Nuevo lugar',
  barrio: 'Nuevo barrio',
  organization: 'Nuevo grupo',
  festivalPoster: 'Nuevo cartel de fiestas',
};

/** Shown when the entity has no name of its own (a poster is title-optional). */
const UNNAMED: Record<BroadcastEntityKind, string> = {
  event: 'Un evento nuevo',
  news: 'Una publicación nueva',
  historyEntry: 'Una entrada de historia nueva',
  place: 'Un lugar nuevo',
  barrio: 'Un barrio nuevo',
  organization: 'Un grupo nuevo',
  festivalPoster: 'Un cartel de fiestas nuevo',
};

export interface VillageEntityCopy {
  title: string;
  body: string;
}

/**
 * Copy is resolved at write time and stored on the notification doc, matching
 * every other producer — the Buzón renders `title`/`body` verbatim and does not
 * route them through i18n. See NotificationRow.
 */
export function villageEntityPublishedCopy(
  kind: BroadcastEntityKind,
  entityLabel: string | null,
  villageName: string,
): VillageEntityCopy {
  const label = entityLabel?.trim();
  return {
    title: `${HEADLINE[kind]} en ${villageName}`,
    body: label ? `«${label}»` : `${UNNAMED[kind]} en tu pueblo.`,
  };
}

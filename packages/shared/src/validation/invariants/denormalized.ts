import type { CollectionKey } from '../../firebase/refs/collections';
import type { EntityKind } from '../../models/interaction/EntityKind';
import { countInvariant, parentPathOf, referenceInvariant } from '../factories';
import { docPath, docsOf, idValue, type Invariant, type SnapshotDoc, type Violation } from '../types';
import { isDeceasedDoc, personLinks } from './person';

// ── Function-owned counters (docs/architecture/denormalized-read-models.md) ──

export const villagePeopleCountMatches = countInvariant({
  id: 'municipalities.peopleCount.matches',
  description: 'peopleCount equals the village roster rows (syncVillagePeopleCount)',
  parent: 'municipalities',
  field: 'peopleCount',
  child: 'municipalityPeople',
  countsToward: (row) => {
    const municipalityId = idValue(row.data['municipalityId']);
    return municipalityId === null ? [] : [docPath('municipalities', [], municipalityId)];
  },
});

export const orgMemberCountMatches = countInvariant({
  id: 'organizations.memberCount.matches',
  description: 'memberCount equals the integrantes (syncOrgMemberCount)',
  parent: 'organizations',
  field: 'memberCount',
  child: 'organizationMembers',
  countsToward: (member) => [parentPathOf(member)],
});

export const barrioResidentCountMatches = countInvariant({
  id: 'municipalityBarrios.residentCount.matches',
  description: 'residentCount equals the living persons linked to the barrio (syncBarrioResidentCount)',
  parent: 'municipalityBarrios',
  field: 'residentCount',
  child: 'persons',
  countsToward: (person) =>
    isDeceasedDoc(person)
      ? []
      : personLinks(person).flatMap((link) =>
          link.barrioId === null ? [] : [docPath('municipalityBarrios', [link.municipalityId], link.barrioId)],
        ),
});

export const placeBurialCountMatches = countInvariant({
  id: 'municipalityPlaces.burialCount.matches',
  description: 'burialCount equals the persons buried there (syncPlaceBurialCount)',
  parent: 'municipalityPlaces',
  field: 'burialCount',
  child: 'persons',
  countsToward: (person) => {
    const raw = person.data['burialPlace'];
    if (raw === null || typeof raw !== 'object') return [];
    const place = raw as Record<string, unknown>;
    const municipalityId = idValue(place['municipalityId']);
    const placeId = idValue(place['placeId']);
    return municipalityId === null || placeId === null ? [] : [docPath('municipalityPlaces', [municipalityId], placeId)];
  },
});

export const eventConfirmedCountMatches = countInvariant({
  id: 'events.confirmedCount.matches',
  description: 'confirmedCount equals the confirmed registrations (registerToEvent, waitlistPromotion)',
  parent: 'events',
  field: 'confirmedCount',
  child: 'eventRegistrations',
  countsToward: (registration) => (registration.data['status'] === 'confirmed' ? [parentPathOf(registration)] : []),
});

export const eventTotalCountMatches = countInvariant({
  id: 'events.totalCount.matches',
  description: 'totalCount equals every registration, waitlist included',
  parent: 'events',
  field: 'totalCount',
  child: 'eventRegistrations',
  countsToward: (registration) => [parentPathOf(registration)],
});

// ── Comments ────────────────────────────────────────────────────────────────

/** Where a comment's `entityKind` lives, as the comment trigger routes it (applyToParent). */
export const COMMENT_TARGETS: Readonly<Record<EntityKind, CollectionKey>> = {
  event: 'events',
  festivalPoster: 'festivalPosters',
  place: 'municipalityPlaces',
  barrio: 'municipalityBarrios',
  organization: 'organizations',
  news: 'news',
  vocabularyTerm: 'vocabularyTerms',
  historyEntry: 'historyEntries',
};

function commentTarget(comment: SnapshotDoc): { key: CollectionKey; path: string } | null {
  const kind = comment.data['entityKind'];
  if (typeof kind !== 'string' || !(kind in COMMENT_TARGETS)) return null;
  const key = COMMENT_TARGETS[kind as EntityKind];
  const entityId = idValue(comment.data['entityId']);
  if (entityId === null) return null;
  const nested = key === 'municipalityPlaces' || key === 'municipalityBarrios';
  const municipalityId = idValue(comment.data['municipalityId']);
  if (nested && municipalityId === null) return null;
  return { key, path: docPath(key, nested && municipalityId !== null ? [municipalityId] : [], entityId) };
}

const COMMENT_TARGET_KEYS = [...new Set(Object.values(COMMENT_TARGETS))];

export const commentEntityExists: Invariant = {
  id: 'comments.entity.exists',
  description: 'Every comment hangs off an existing entity of its entityKind',
  reads: ['comments', ...COMMENT_TARGET_KEYS],
  check: (snap) => {
    const id = 'comments.entity.exists';
    const out: Violation[] = [];
    for (const comment of docsOf(snap, 'comments').values()) {
      const target = commentTarget(comment);
      if (target === null) {
        out.push({ invariant: id, path: comment.path, field: 'entityKind', value: String(comment.data['entityKind']), message: `${comment.path} names no known entity` });
      } else if (!docsOf(snap, target.key).has(target.path)) {
        out.push({ invariant: id, path: comment.path, field: 'entityId', value: target.path, message: `${comment.path} -> missing ${target.path}` });
      }
    }
    return out;
  },
};

export const commentParentExists = referenceInvariant({
  id: 'comments.parentCommentId.exists',
  description: 'A reply names an existing comment (deleting a comment cascades its replies)',
  collection: 'comments',
  targets: ['comments'],
  refs: (doc) => [{ field: 'parentCommentId', value: doc.data['parentCommentId'], target: 'comments', optional: true }],
});

/** Every comment, reply or not, counts toward its entity's `commentCount` (syncEntityCommentCount). */
export const commentCountInvariants: Invariant[] = COMMENT_TARGET_KEYS.map((key) =>
  countInvariant({
    id: `${key}.commentCount.matches`,
    description: `${key}.commentCount equals the comments on it`,
    parent: key,
    field: 'commentCount',
    child: 'comments',
    countsToward: (comment) => {
      const target = commentTarget(comment);
      return target !== null && target.key === key ? [target.path] : [];
    },
  }),
);

export const replyCountMatches = countInvariant({
  id: 'comments.replyCount.matches',
  description: 'A top-level comment’s replyCount equals its replies',
  parent: 'comments',
  field: 'replyCount',
  child: 'comments',
  countsToward: (comment) => {
    const parentId = idValue(comment.data['parentCommentId']);
    return parentId === null ? [] : [docPath('comments', [], parentId)];
  },
});

// ── Copied fields ───────────────────────────────────────────────────────────

/**
 * Fields copied from `municipalities/{id}` onto village content: `villageSlug`
 * builds every share URL, `villageName` is what the feed shows
 * (syncVillageDenormalization keeps the event copies fresh).
 */
function copiedFromMunicipality(key: CollectionKey, field: string, source: string): Invariant {
  const id = `${key}.${field}.matches`;
  return {
    id,
    description: `${key}.${field} equals its municipality's ${source}`,
    reads: [key, 'municipalities'],
    check: (snap) => {
      const municipalities = docsOf(snap, 'municipalities');
      const out: Violation[] = [];
      for (const doc of docsOf(snap, key).values()) {
        const municipalityId = idValue(doc.data['municipalityId']);
        const municipality = municipalityId === null ? undefined : municipalities.get(docPath('municipalities', [], municipalityId));
        // A missing municipality is the municipalityId.exists invariant's finding, not this one.
        if (!municipality) continue;
        const want = municipality.data[source];
        const have = doc.data[field];
        if (have !== want) {
          out.push({ invariant: id, path: doc.path, field, value: String(have), expected: String(want), message: `${doc.path}.${field} = ${String(have)}, municipality ${source} ${String(want)}` });
        }
      }
      return out;
    },
  };
}

export const copiedVillageFieldInvariants: Invariant[] = [
  ...(['events', 'organizations', 'news', 'festivalPosters', 'fiestaEditions', 'historyEntries'] as const).map((key) =>
    copiedFromMunicipality(key, 'villageSlug', 'slug'),
  ),
  copiedFromMunicipality('events', 'villageName', 'name'),
];

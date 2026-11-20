/**
 * Who may edit or delete a piece of village content — the client's copy of the
 * `allow update` / `allow delete` clauses in `firestore.rules` (and, for news,
 * of the `deleteNewsPost` callable). Rules are a DSL and cannot share code with
 * the app, so this table is checked against the real rules in the emulator by
 * `test/e2e/contentPolicyParity.test.ts`: a button the server would refuse, or
 * a missing button the server would allow, fails that test.
 */

export type PolicyKind =
  | 'event'
  | 'news'
  | 'place'
  | 'barrio'
  | 'festivalPoster'
  | 'historyEntry'
  | 'organization'
  | 'vocabularyTerm'
  | 'vocabularyDefinition';

export type PolicyAction = 'edit' | 'delete';

/**
 * The viewer, resolved against the doc's pueblo (and, for an organization, the
 * org itself). `uid: null` is signed out.
 */
export interface Actor {
  uid: string | null;
  isAppAdmin: boolean;
  /** Admin of the doc's municipality (`municipalities/{id}/members/{uid}.role == 'admin'`). */
  isVillageAdmin: boolean;
  /** Admin of the organization itself — only the `organization` kind reads it. */
  isOrgAdmin?: boolean;
}

/** The fields of a doc the policy reads. Pass the doc itself; extra fields are ignored. */
export interface PolicyDoc {
  createdBy?: string | null;
  proposedBy?: string | null;
  organizerUserIds?: readonly string[] | null;
  /** `active | hidden` for moderated content; other kinds' statuses are never read. */
  status?: string | null;
  definitionCount?: number | null;
}

/**
 * Which server surface answers a kind's delete. `rules` is a client
 * `deleteDoc`; news goes through a callable (its rule is `delete: if false`);
 * an event is cancelled with an update rather than deleted.
 */
export type DeleteSurface = 'rules' | 'callable:deleteNewsPost' | 'update:cancel';

type Predicate = (actor: Actor, doc: PolicyDoc) => boolean;

interface KindPolicy {
  edit: Predicate;
  delete: Predicate;
  deleteSurface: DeleteSurface;
}

const isAdmin = (a: Actor) => a.isAppAdmin || a.isVillageAdmin;
const is = (a: Actor, id: string | null | undefined) => a.uid != null && id === a.uid;
const named = (a: Actor, ids: readonly string[] | null | undefined) =>
  a.uid != null && ids != null && ids.includes(a.uid);
const active = (d: PolicyDoc) => d.status === 'active';

// Author, a named organizer, or an admin of the pueblo — the events and news
// update rules.
const organized: Predicate = (a, d) =>
  isAdmin(a) || is(a, d.createdBy) || named(a, d.organizerUserIds);

// An admin, or the author of a doc moderation has not hidden: withdrawing a
// hidden doc would undo the moderation.
const authorWhileActive =
  (author: 'createdBy' | 'proposedBy'): Predicate =>
  (a, d) =>
    isAdmin(a) || (is(a, d[author]) && active(d));

const authored =
  (author: 'createdBy' | 'proposedBy'): Predicate =>
  (a, d) =>
    isAdmin(a) || is(a, d[author]);

export const CONTENT_POLICY: Readonly<Record<PolicyKind, KindPolicy>> = {
  event: { edit: organized, delete: organized, deleteSurface: 'update:cancel' },
  news: {
    edit: organized,
    // Narrower than the callable, which lets the author delete at any status —
    // see KNOWN_DIVERGENCES.
    delete: authorWhileActive('createdBy'),
    deleteSurface: 'callable:deleteNewsPost',
  },
  place: { edit: authored('proposedBy'), delete: authorWhileActive('proposedBy'), deleteSurface: 'rules' },
  barrio: { edit: authored('proposedBy'), delete: authorWhileActive('proposedBy'), deleteSurface: 'rules' },
  festivalPoster: {
    edit: authored('proposedBy'),
    delete: authorWhileActive('proposedBy'),
    deleteSurface: 'rules',
  },
  historyEntry: {
    edit: authored('createdBy'),
    delete: authorWhileActive('createdBy'),
    deleteSurface: 'rules',
  },
  organization: {
    edit: (a) => isAdmin(a) || a.isOrgAdmin === true,
    // An org admin may run the group but not delete it.
    delete: isAdmin,
    deleteSurface: 'rules',
  },
  vocabularyTerm: {
    // Nothing on a term is client-editable: a wrong headword is replaced, not fixed.
    edit: () => false,
    // A term with meanings on it must not vanish under them.
    delete: (a, d) =>
      isAdmin(a) || (is(a, d.createdBy) && active(d) && (d.definitionCount ?? 0) === 0),
    deleteSurface: 'rules',
  },
  vocabularyDefinition: {
    // Only the author rewrites what they said a word means; admins hide or delete.
    edit: (a, d) => is(a, d.createdBy),
    delete: authored('createdBy'),
    deleteSurface: 'rules',
  },
};

/**
 * Where the client deliberately answers differently from the server. Each one
 * is a product rule awaiting its own decision, not a bug to fix silently; the
 * parity test asserts the server side of each so a change on either side
 * surfaces.
 */
export interface KnownDivergence {
  kind: PolicyKind;
  action: PolicyAction;
  note: string;
}

export const KNOWN_DIVERGENCES: readonly KnownDivergence[] = [
  {
    kind: 'news',
    action: 'delete',
    note:
      'The deleteNewsPost callable lets the author delete a hidden post; the client offers it only while active. ' +
      'See docs/plans/ongoing/shared-entity-capability-policy.md.',
  },
];

export function can(action: PolicyAction, kind: PolicyKind, actor: Actor, doc: PolicyDoc): boolean {
  return CONTENT_POLICY[kind][action](actor, doc);
}

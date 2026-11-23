import { COSA_CATEGORIES, isSharedCosa, type CosaCategory, type CosaData, type CosaKind } from './CosaDataModel';
import type { CosaRequestData, CosaRequestStatus } from './CosaRequestDataModel';

/**
 * The cosateca's request lifecycle, shared by the `respondToCosaRequest`
 * callable (which enforces it) and the screens (which offer only the moves it
 * allows).
 *
 * | kind     | path                                                  |
 * |----------|-------------------------------------------------------|
 * | prestamo | pending → accepted \| declined → lent → returned     |
 * | shared (a group's prestamo) | pending → accepted \| declined → lent (handed over) → passed (handed on) \| returned (left in its place) |
 * | servicio | pending → accepted \| declined → done                 |
 * | regalo   | pending → accepted \| declined → given                |
 * | reserva  | pending → accepted \| declined (a free slot books itself as accepted) |
 *
 * The requester cancels until it is lent, done or given. The manager is the
 * cosa's owner, or for a group's cosa its admins; a group's admins act as
 * manager on every cosa of the group, the backstop for a forgotten return.
 * A shared cosa someone holds is answered by its holder instead of the group
 * (the group's admins stay the backstop); `passed` is set by the callable on
 * the previous holder's request when the cosa is handed on. Its holder alone
 * leaves it back in its place (`return`), and only where it has one.
 */

export const COSA_REQUEST_ACTIONS = ['accept', 'decline', 'cancel', 'lend', 'return', 'done', 'give'] as const;
export type CosaRequestAction = (typeof COSA_REQUEST_ACTIONS)[number];

export function isCosaRequestAction(value: unknown): value is CosaRequestAction {
  return typeof value === 'string' && (COSA_REQUEST_ACTIONS as readonly string[]).includes(value);
}

export type CosaRequestRole = 'manager' | 'requester';

interface Transition {
  from: readonly CosaRequestStatus[];
  to: CosaRequestStatus;
  by: readonly CosaRequestRole[];
}

const ANSWER: Record<'accept' | 'decline' | 'cancel', Transition> = {
  accept: { from: ['pending'], to: 'accepted', by: ['manager'] },
  decline: { from: ['pending', 'accepted'], to: 'declined', by: ['manager'] },
  cancel: { from: ['pending', 'accepted'], to: 'cancelled', by: ['requester'] },
};

/** The lifecycle a request follows: its cosa's kind, or `shared` for a group's prestamo, which travels. */
export type CosaRequestFlow = CosaKind | 'shared';

export function cosaRequestFlow(kind: CosaKind, ownerUid: string | null): CosaRequestFlow {
  return isSharedCosa({ kind, ownerUid }) ? 'shared' : kind;
}

export const COSA_REQUEST_TRANSITIONS: Record<CosaRequestFlow, Partial<Record<CosaRequestAction, Transition>>> = {
  prestamo: {
    ...ANSWER,
    lend: { from: ['accepted'], to: 'lent', by: ['manager'] },
    return: { from: ['lent'], to: 'returned', by: ['manager'] },
  },
  // Handing it over is the end of the road for this request's holder: the
  // next handover closes it as `passed`. Nobody gives it back to anyone; its
  // holder may leave it back in its place, which frees it.
  shared: {
    ...ANSWER,
    lend: { from: ['accepted'], to: 'lent', by: ['manager'] },
    return: { from: ['lent'], to: 'returned', by: ['requester'] },
  },
  servicio: {
    ...ANSWER,
    done: { from: ['accepted'], to: 'done', by: ['manager', 'requester'] },
  },
  regalo: {
    ...ANSWER,
    give: { from: ['accepted'], to: 'given', by: ['manager'] },
  },
  // A booking ends when its slot passes; the callable refuses moves on a past one.
  reserva: { ...ANSWER },
};

/** A request still in play: it holds the cosa's dates or is waiting for an answer. */
export const OPEN_COSA_REQUEST_STATUSES: readonly CosaRequestStatus[] = ['pending', 'accepted', 'lent'];

export function isOpenCosaRequest(status: CosaRequestStatus): boolean {
  return OPEN_COSA_REQUEST_STATUSES.includes(status);
}

/** The states that end a request. */
export function isFinalCosaRequestStatus(status: CosaRequestStatus): boolean {
  return !isOpenCosaRequest(status);
}

/**
 * How long a request's chat stays open to new messages once the request has
 * ended (decided 2026-11-10, user): long enough to sort out a forgotten
 * charger, short enough that a declined requester cannot keep pushing the
 * owner for months. Old messages stay readable. firestore.rules holds the same
 * number.
 */
export const COSA_CHAT_CLOSE_DAYS = 14;

/** When a request ended: its `closedAt`, else when it was answered, else when it was made. */
export function cosaRequestEndedAt(
  req: Pick<CosaRequestData, 'status' | 'closedAt' | 'respondedAt' | 'createdAt'>,
): Date | null {
  if (!isFinalCosaRequestStatus(req.status)) return null;
  return req.closedAt ?? req.respondedAt ?? req.createdAt;
}

/** Whether a request's chat still takes new messages at `now`. */
export function isCosaChatOpen(
  req: Pick<CosaRequestData, 'status' | 'closedAt' | 'respondedAt' | 'createdAt'>,
  now: Date,
): boolean {
  const ended = cosaRequestEndedAt(req);
  if (!ended) return true;
  return now.getTime() <= ended.getTime() + COSA_CHAT_CLOSE_DAYS * 24 * 60 * 60 * 1000;
}

export type CosaTransitionResult =
  | { ok: true; to: CosaRequestStatus }
  | { ok: false; reason: 'not-allowed' | 'wrong-state' | 'not-your-role' };

/** Where `action` takes a request in `status`, for someone holding `roles`. */
export function nextCosaRequestStatus(
  kind: CosaKind,
  status: CosaRequestStatus,
  action: CosaRequestAction,
  roles: readonly CosaRequestRole[],
  ownerUid: string | null,
): CosaTransitionResult {
  const t = COSA_REQUEST_TRANSITIONS[cosaRequestFlow(kind, ownerUid)][action];
  if (!t) return { ok: false, reason: 'not-allowed' };
  if (!t.by.some((r) => roles.includes(r))) return { ok: false, reason: 'not-your-role' };
  if (!t.from.includes(status)) return { ok: false, reason: 'wrong-state' };
  return { ok: true, to: t.to };
}

/** The moves a viewer may make on a request now — what the screen offers. */
export function availableCosaRequestActions(
  kind: CosaKind,
  status: CosaRequestStatus,
  roles: readonly CosaRequestRole[],
  ownerUid: string | null,
): CosaRequestAction[] {
  return COSA_REQUEST_ACTIONS.filter((a) => nextCosaRequestStatus(kind, status, a, roles, ownerUid).ok);
}

type Dates = Pick<CosaRequestData, 'fromOn' | 'untilOn'>;

/**
 * Whether two requests want the cosa on a common day. A missing `fromOn` is
 * "from any time", a missing `untilOn` "until it comes back", so two undated
 * requests always overlap: one loan at a time.
 */
export function cosaDatesOverlap(a: Dates, b: Dates): boolean {
  if (a.untilOn !== null && b.fromOn !== null && a.untilOn < b.fromOn) return false;
  if (b.untilOn !== null && a.fromOn !== null && b.untilOn < a.fromOn) return false;
  return true;
}

/** A lent cosa that should be back by now (`todayKey` is Madrid's day). A shared one never comes back. */
export function isCosaRequestOverdue(
  req: Pick<CosaRequestData, 'status' | 'untilOn' | 'cosaKind' | 'ownerUid'>,
  todayKey: string,
): boolean {
  return (
    !isSharedCosa({ kind: req.cosaKind, ownerUid: req.ownerUid }) &&
    req.status === 'lent' &&
    req.untilOn !== null &&
    req.untilOn < todayKey
  );
}

/**
 * Whoever answers a request first-hand: a shared cosa's current holder,
 * else the cosa's owner (null owner: the group's admins). Admins of the group
 * manage every request too, as the backstop.
 */
function isFirstHandManager(req: Pick<CosaRequestData, 'ownerUid' | 'holderUid'>, uid: string): boolean {
  return req.holderUid !== null ? req.holderUid === uid : req.ownerUid !== null && req.ownerUid === uid;
}

/**
 * The roles a viewer holds on a request: its requester asks — and only asks,
 * so nobody answers their own request; otherwise the cosa's holder (a
 * shared cosa someone has), its owner, and any admin of the group
 * manage it. The same rule `respondToCosaRequest` applies, so a screen offers
 * exactly the moves the callable accepts.
 */
export function cosaRequestRoles(
  req: Pick<CosaRequestData, 'ownerUid' | 'requesterUid' | 'holderUid'>,
  viewer: { uid: string; isGroupAdmin: boolean },
): CosaRequestRole[] {
  if (req.requesterUid === viewer.uid) return ['requester'];
  return viewer.isGroupAdmin || isFirstHandManager(req, viewer.uid) ? ['manager'] : [];
}

/**
 * Who answers a new request for this cosa first-hand, when it is not its
 * owner: the holder of a shared cosa someone has. What a request copies as
 * `holderUid`; the rules hold the same.
 */
export function cosaHolderUid(cosa: Pick<CosaData, 'kind' | 'ownerUid' | 'heldBy'>): string | null {
  return isSharedCosa(cosa) && cosa.heldBy !== null ? cosa.heldBy.uid : null;
}

/**
 * Whether `uid` is who should answer the request in their Buzón: for a
 * shared cosa someone holds, only its holder; otherwise its owner or
 * the group's admins (the queries that found it say which).
 */
export function isCosaRequestAnsweredBy(req: Pick<CosaRequestData, 'holderUid'>, uid: string): boolean {
  return req.holderUid === null || req.holderUid === uid;
}

/** What a cosa's card says about it: free to ask for, out with someone, paused, or gone. */
export type CosaAvailability = 'available' | 'lent' | 'paused' | 'given';

export function cosaAvailability(cosa: Pick<CosaData, 'status' | 'heldBy'>): CosaAvailability {
  if (cosa.status === 'given') return 'given';
  if (cosa.heldBy !== null) return 'lent';
  return cosa.status === 'paused' ? 'paused' : 'available';
}

/**
 * A cosateca's catalogue as shown: a regalo that has gone drops out, the rest
 * sorted by title; `category` null is every category.
 */
export function cosatecaCatalogue<T extends Pick<CosaData, 'status' | 'title' | 'category'>>(
  cosas: readonly T[],
  category: CosaCategory | null,
): T[] {
  return cosas
    .filter((c) => c.status !== 'given' && (category === null || c.category === category))
    .sort((a, b) => a.title.localeCompare(b.title, 'es'));
}

/** The categories that have something in them, in the catalogue's fixed order. */
export function usedCosaCategories(cosas: readonly Pick<CosaData, 'status' | 'category'>[]): CosaCategory[] {
  const used = new Set(cosas.filter((c) => c.status !== 'given').map((c) => c.category));
  return COSA_CATEGORIES.filter((c) => used.has(c));
}

/**
 * Who a request chat message is pushed to: the requester and the cosa's
 * managers (its owner, or for a group's cosa the group's admins), never its
 * author. A group's admins read a personal cosa's chat as the backstop but are
 * not pushed it.
 */
export function cosaChatPushUids(
  req: Pick<CosaRequestData, 'requesterUid'>,
  managerUids: readonly string[],
  authorUid: string,
): string[] {
  return [...new Set([req.requesterUid, ...managerUids])].filter((uid) => uid !== authorUid);
}

/**
 * Who the overdue nudge goes to: the holder (the requester), and the managers
 * so they know to ask for it back.
 */
export function cosaOverdueRecipients(
  req: Pick<CosaRequestData, 'requesterUid'>,
  managerUids: readonly string[],
): { holder: string; managers: string[] } {
  return { holder: req.requesterUid, managers: [...new Set(managerUids)].filter((uid) => uid !== req.requesterUid) };
}

import type { CosaKind } from './CosaDataModel';
import type { CosaRequestData, CosaRequestStatus } from './CosaRequestDataModel';

/**
 * The cosateca's request lifecycle, shared by the `respondToCosaRequest`
 * callable (which enforces it) and the screens (which offer only the moves it
 * allows).
 *
 * | kind     | path                                                  |
 * |----------|-------------------------------------------------------|
 * | prestamo | pending → accepted \| declined → lent → returned     |
 * | servicio | pending → accepted \| declined → done                 |
 * | regalo   | pending → accepted \| declined → given                |
 *
 * The requester cancels until it is lent, done or given. The manager is the
 * cosa's owner, or for a group's cosa its admins; a group's admins act as
 * manager on every cosa of the group, the backstop for a forgotten return.
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

export const COSA_REQUEST_TRANSITIONS: Record<CosaKind, Partial<Record<CosaRequestAction, Transition>>> = {
  prestamo: {
    ...ANSWER,
    lend: { from: ['accepted'], to: 'lent', by: ['manager'] },
    return: { from: ['lent'], to: 'returned', by: ['manager'] },
  },
  servicio: {
    ...ANSWER,
    done: { from: ['accepted'], to: 'done', by: ['manager', 'requester'] },
  },
  regalo: {
    ...ANSWER,
    give: { from: ['accepted'], to: 'given', by: ['manager'] },
  },
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

export type CosaTransitionResult =
  | { ok: true; to: CosaRequestStatus }
  | { ok: false; reason: 'not-allowed' | 'wrong-state' | 'not-your-role' };

/** Where `action` takes a request in `status`, for someone holding `roles`. */
export function nextCosaRequestStatus(
  kind: CosaKind,
  status: CosaRequestStatus,
  action: CosaRequestAction,
  roles: readonly CosaRequestRole[],
): CosaTransitionResult {
  const t = COSA_REQUEST_TRANSITIONS[kind][action];
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
): CosaRequestAction[] {
  return COSA_REQUEST_ACTIONS.filter((a) => nextCosaRequestStatus(kind, status, a, roles).ok);
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

/** A lent cosa that should be back by now (`todayKey` is Madrid's day). */
export function isCosaRequestOverdue(req: Pick<CosaRequestData, 'status' | 'untilOn'>, todayKey: string): boolean {
  return req.status === 'lent' && req.untilOn !== null && req.untilOn < todayKey;
}

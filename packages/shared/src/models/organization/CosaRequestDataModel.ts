import { z } from 'zod';
import { DayKeySchema } from '../municipality/FiestaBlockModel';
import { CosaKindSchema } from './CosaDataModel';

/**
 * A request for a cosa, at `cosaRequests/{requestId}` — top-level and scoped by
 * `municipalityId`, so a user's requests read across groups and villages
 * without a collection-group query.
 *
 * The requester creates it (`pending`); every later move goes through the
 * `respondToCosaRequest` callable, which holds the transition table in
 * cosatecaLogic.ts. `ownerUid` is the cosa's, copied so the owner's inbox needs
 * no join; null means the group's own cosa, answered by its admins.
 *
 * Dates are optional Madrid calendar days (`YYYY-MM-DD`): no `fromOn` means
 * "from now", no `untilOn` "until it comes back".
 *
 * A reserva booking carries its slot as instants (`startAt`/`endAt`, null on
 * every other kind) and its Madrid day as both `fromOn` and `untilOn`. It is
 * created only by the `bookReservaSlot` callable, never by a client.
 */

export const CosaRequestStatusSchema = z.enum([
  'pending',
  'accepted',
  'declined',
  'cancelled',
  'lent',
  'returned',
  'done',
  'given',
]);
export type CosaRequestStatus = z.infer<typeof CosaRequestStatusSchema>;

export const MAX_COSA_REQUEST_MESSAGE = 500;

export const CosaRequestDataSchema = z
  .object({
    municipalityId: z.string().min(1),
    orgId: z.string().min(1),
    cosaId: z.string().min(1),
    cosaTitle: z.string(),
    cosaKind: CosaKindSchema,
    ownerUid: z.string().min(1).nullable(),
    requesterUid: z.string().min(1),
    /** The requester's public name when they asked. */
    requesterName: z.string(),
    message: z.string().max(MAX_COSA_REQUEST_MESSAGE).nullable(),
    fromOn: DayKeySchema.nullable(),
    untilOn: DayKeySchema.nullable(),
    status: CosaRequestStatusSchema,
    createdAt: z.date(),
    /** When the manager accepted or declined it. */
    respondedAt: z.date().nullable(),
    /** When it reached a final state. */
    closedAt: z.date().nullable(),
    /** The day the overdue nudge went out (Phase 3), so it goes once. */
    overdueNotifiedOn: DayKeySchema.nullable(),
    /** A reserva booking's slot; null on every other kind. */
    startAt: z.date().nullable(),
    endAt: z.date().nullable(),
  })
  .refine((r) => r.fromOn === null || r.untilOn === null || r.fromOn <= r.untilOn, 'fromOn is after untilOn');
export type CosaRequestData = z.infer<typeof CosaRequestDataSchema>;

export interface CosaRequestInput {
  municipalityId: string;
  orgId: string;
  cosaId: string;
  cosaTitle: string;
  cosaKind: CosaRequestData['cosaKind'];
  ownerUid: string | null;
  requesterUid: string;
  requesterName: string;
  message?: string | null;
  fromOn?: string | null;
  untilOn?: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
  status?: 'pending' | 'accepted';
  createdAt?: Date;
}

export function buildCosaRequestData(input: CosaRequestInput): CosaRequestData {
  return {
    municipalityId: input.municipalityId,
    orgId: input.orgId,
    cosaId: input.cosaId,
    cosaTitle: input.cosaTitle,
    cosaKind: input.cosaKind,
    ownerUid: input.ownerUid,
    requesterUid: input.requesterUid,
    requesterName: input.requesterName,
    message: input.message?.trim() ? input.message.trim() : null,
    fromOn: input.fromOn ?? null,
    untilOn: input.untilOn ?? null,
    status: input.status ?? 'pending',
    createdAt: input.createdAt ?? new Date(),
    respondedAt: null,
    closedAt: null,
    overdueNotifiedOn: null,
    startAt: input.startAt ?? null,
    endAt: input.endAt ?? null,
  };
}

/**
 * A request's chat, at `cosaRequests/{requestId}/chat/{chatId}`: where the
 * requester and the manager arrange the handover without sharing a phone. Its
 * messages are group chat messages (GroupChatMessageDataSchema). Read and
 * written by the request's parties — its requester, the cosa's owner and the
 * group's admins.
 */
export function cosaRequestChatMessagePath(requestId: string, chatId: string): string {
  return `cosaRequests/${requestId}/chat/${chatId}`;
}

/** Reads a report's target back into a request chat message, or null for a report of anything else. */
export function parseCosaRequestChatMessagePath(path: string): { requestId: string; chatId: string } | null {
  const match = /^cosaRequests\/([^/]+)\/chat\/([^/]+)$/.exec(path);
  return match?.[1] && match[2] ? { requestId: match[1], chatId: match[2] } : null;
}

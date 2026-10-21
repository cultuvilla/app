import { z } from 'zod';
import { ORG_ADMIN_TITLE_SIGNATURE, OrgAdminTitleSchema, type OrgAdminTitle } from './SocioDataModel';

/**
 * A group's messages: composed once by an admin in Gestionar, fanned out by the
 * `sendGroupMessage` callable to push (in-app notification), email and
 * hand-sent WhatsApp links, and kept as the group's history.
 *
 * - `messages/{messageId}` — the message, its audience and channels, the
 *   accounts it reached (`recipientUids`, which is what lets a recipient read
 *   it) and the send counts. Function-written; an admin only (un)pins it.
 * - `messages/{messageId}/deliveries/{recipientKey}` — per recipient: who, by
 *   which channel, and the WhatsApp tick. Admins only — it names socios.
 * - `messages/{messageId}/reads/{uid}` — a recipient opened it.
 * - `messages/{messageId}/votes/{uid}` — one vote per account on its poll.
 *   Admins read every vote; a member reads only their own.
 */

export const GROUP_MESSAGE_TITLE_MAX = 120;
export const GROUP_MESSAGE_BODY_MAX = 4000;
export const GROUP_POLL_QUESTION_MAX = 200;
export const GROUP_POLL_OPTION_MAX = 80;
export const GROUP_POLL_MAX_OPTIONS = 10;
/** An admin may push the unread again at most this often per message. */
export const GROUP_MESSAGE_NUDGE_INTERVAL_MS = 12 * 60 * 60 * 1000;

/**
 * Who a message goes to: every active socio, the junta (the group's admins),
 * the socios whose cuota of the current period is pendiente or vencida, or the
 * people signed up to one of the group's events.
 */
export const GroupMessageAudienceKindSchema = z.enum(['all', 'junta', 'cuota', 'event']);
export type GroupMessageAudienceKind = z.infer<typeof GroupMessageAudienceKindSchema>;
export const GROUP_MESSAGE_AUDIENCE_KINDS: readonly GroupMessageAudienceKind[] = GroupMessageAudienceKindSchema.options;

export const GroupMessageAudienceSchema = z.object({
  kind: GroupMessageAudienceKindSchema,
  /** Set only for `event`. */
  eventId: z.string().nullable(),
  /** The event's title when sent — a point-in-time copy for the history. */
  eventTitle: z.string().nullable(),
});
export type GroupMessageAudience = z.infer<typeof GroupMessageAudienceSchema>;

/**
 * WhatsApp is never sent by Cultuvilla: the admin taps one `wa.me` link after
 * another from their own phone. `fallback` lists only the recipients neither
 * push nor email reaches.
 */
export const GroupWhatsappModeSchema = z.enum(['none', 'fallback', 'all']);
export type GroupWhatsappMode = z.infer<typeof GroupWhatsappModeSchema>;
export const GROUP_WHATSAPP_MODES: readonly GroupWhatsappMode[] = GroupWhatsappModeSchema.options;

export const GroupMessageChannelsSchema = z.object({
  push: z.boolean(),
  email: z.boolean(),
  whatsapp: GroupWhatsappModeSchema,
});
export type GroupMessageChannels = z.infer<typeof GroupMessageChannelsSchema>;

export const GroupPollKindSchema = z.enum(['yes_no', 'choice']);
export type GroupPollKind = z.infer<typeof GroupPollKindSchema>;

/** A question attached to a message. A vote is the index of one option. */
export const GroupPollSchema = z.object({
  question: z.string().trim().min(1).max(GROUP_POLL_QUESTION_MAX),
  kind: GroupPollKindSchema,
  options: z.array(z.string().trim().min(1).max(GROUP_POLL_OPTION_MAX)).min(2).max(GROUP_POLL_MAX_OPTIONS),
});
export type GroupPoll = z.infer<typeof GroupPollSchema>;

const CountSchema = z.number().int().min(0);

export const GroupMessageDataSchema = z.object({
  title: z.string(),
  body: z.string(),
  audience: GroupMessageAudienceSchema,
  channels: GroupMessageChannelsSchema,
  /** Shown on the group home of every recipient with the app. */
  pinned: z.boolean(),
  poll: GroupPollSchema.nullable(),
  /** The accounts the message reached in the app (members, a persona's responsible member, registrants). */
  recipientUids: z.array(z.string()),
  /** Recipients of every kind, typed socios included. */
  recipientCount: CountSchema,
  pushCount: CountSchema,
  emailCount: CountSchema,
  /** WhatsApp links offered to the admin (sent ones are ticked on the deliveries). */
  whatsappCount: CountSchema,
  sentBy: z.string(),
  signerName: z.string(),
  signerTitle: OrgAdminTitleSchema.nullable(),
  sentAt: z.date(),
  nudgeCount: CountSchema,
  lastNudgedAt: z.date().nullable(),
});
export type GroupMessageData = z.infer<typeof GroupMessageDataSchema>;

/** `sent` / `failed` / `skipped` (emulator) once tried; `pending` while the fan-out runs; null = no email. */
export const GroupMessageEmailStateSchema = z.enum(['pending', 'sent', 'failed', 'skipped']);
export type GroupMessageEmailState = z.infer<typeof GroupMessageEmailStateSchema>;

/**
 * One recipient of a message. The key is the account's uid, or `typed_<socioId>`
 * for a socio without the app. A member's personas a cargo share their row.
 */
export const GroupMessageDeliveryDataSchema = z.object({
  uid: z.string().nullable(),
  socioIds: z.array(z.string()),
  names: z.array(z.string()),
  /** An in-app notification was written (and pushed, under the account's preferences). */
  push: z.boolean(),
  email: GroupMessageEmailStateSchema.nullable(),
  /** The socio row whose shared phone the WhatsApp link uses; null = no WhatsApp for this recipient. */
  whatsappSocioId: z.string().nullable(),
  whatsappSentAt: z.date().nullable(),
  whatsappSentBy: z.string().nullable(),
});
export type GroupMessageDeliveryData = z.infer<typeof GroupMessageDeliveryDataSchema>;

export function typedRecipientKey(socioId: string): string {
  return `typed_${socioId}`;
}

export const GroupMessageReadDataSchema = z.object({
  readAt: z.date(),
});
export type GroupMessageReadData = z.infer<typeof GroupMessageReadDataSchema>;

export const GroupPollVoteDataSchema = z.object({
  option: z.number().int().min(0).max(GROUP_POLL_MAX_OPTIONS - 1),
  votedAt: z.date(),
});
export type GroupPollVoteData = z.infer<typeof GroupPollVoteDataSchema>;

/** What the composer sends to `sendGroupMessage`. The id is the client's, so a retried call sends nothing twice. */
export const SendGroupMessageInputSchema = z.object({
  orgId: z.string().min(1),
  messageId: z.string().regex(/^[A-Za-z0-9]{10,40}$/),
  title: z.string().trim().min(1).max(GROUP_MESSAGE_TITLE_MAX),
  body: z.string().trim().min(1).max(GROUP_MESSAGE_BODY_MAX),
  audience: z.object({ kind: GroupMessageAudienceKindSchema, eventId: z.string().min(1).nullable() }),
  channels: GroupMessageChannelsSchema,
  pinned: z.boolean(),
  poll: GroupPollSchema.nullable(),
}).refine((d) => (d.audience.kind === 'event') === (d.audience.eventId !== null), {
  message: 'an event audience names its event, and only it',
  path: ['audience', 'eventId'],
}).refine((d) => d.poll === null || d.poll.kind === 'choice' || d.poll.options.length === 2, {
  message: 'a yes/no poll has two options',
  path: ['poll', 'options'],
});
export type SendGroupMessageInput = z.infer<typeof SendGroupMessageInputSchema>;

export interface SendGroupMessageResult {
  messageId: string;
  recipientCount: number;
  pushCount: number;
  emailCount: number;
  whatsappCount: number;
}

export interface NudgeGroupMessageResult {
  nudged: number;
}

// ── Pure helpers ────────────────────────────────────────────────────────────

/** The recipients with the app who have not opened the message, the sender aside. */
export function unreadRecipientUids(
  message: Pick<GroupMessageData, 'recipientUids' | 'sentBy'>,
  readUids: Iterable<string>,
): string[] {
  const read = new Set(readUids);
  return message.recipientUids.filter((uid) => uid !== message.sentBy && !read.has(uid));
}

/** Whether the admin may push the unread again now. */
export function canNudgeGroupMessage(message: Pick<GroupMessageData, 'lastNudgedAt'>, now: Date): boolean {
  return message.lastNudgedAt === null || now.getTime() - message.lastNudgedAt.getTime() >= GROUP_MESSAGE_NUDGE_INTERVAL_MS;
}

/** Votes per option, in the poll's order. Out-of-range votes are ignored. */
export function tallyGroupPoll(poll: Pick<GroupPoll, 'options'>, votes: Iterable<Pick<GroupPollVoteData, 'option'>>): number[] {
  const counts = poll.options.map(() => 0);
  for (const v of votes) if (v.option >= 0 && v.option < counts.length) counts[v.option] = (counts[v.option] ?? 0) + 1;
  return counts;
}

export interface GroupMessageSignature {
  signerName: string;
  signerTitle: OrgAdminTitle | null;
  orgName: string;
}

/** "Ana Pérez" + "Tesorería · La Anduela", the two lines every channel signs with. */
export function groupMessageSignatureLines(s: GroupMessageSignature): [string, string] {
  const title = s.signerTitle ? ORG_ADMIN_TITLE_SIGNATURE[s.signerTitle] : null;
  return [s.signerName, title ? `${title} · ${s.orgName}` : s.orgName];
}

/**
 * The text of a WhatsApp message, as the admin will send it: WhatsApp's own
 * bold for the title, the body, the poll question pointing at the app, and the
 * signature.
 */
export function groupMessageWhatsappText(
  m: Pick<GroupMessageData, 'title' | 'body' | 'poll'> & GroupMessageSignature,
  appUrl: string,
): string {
  const [name, line] = groupMessageSignatureLines(m);
  return [
    `*${m.title.trim()}*`,
    '',
    m.body.trim(),
    ...(m.poll ? ['', `${m.poll.question} Responde en la app: ${appUrl}`] : []),
    '',
    `— ${name}`,
    line,
  ].join('\n');
}

/** A click-to-chat link: `wa.me` takes the number in international form without the `+`. */
export function whatsappLink(phoneE164: string, text: string): string {
  return `https://wa.me/${phoneE164.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

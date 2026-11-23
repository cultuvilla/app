import { z } from 'zod';

/**
 * The message Cultuvilla sends to the homelab notify-gateway, which posts it in
 * the "Cultuvilla Overview" Telegram group. The gateway owns delivery, dedupe
 * and rate limit; Cultuvilla owns what is said. The shape mirrors the gateway's
 * pydantic model (homelab `services/notify-gateway/src/envelope.py`) field for
 * field, so an envelope that passes here passes there.
 *
 * One writer: `publishNotify` (functions/src/notify/publishNotify.ts).
 */

/** Pub/Sub topic, one per project. Only production's has the gateway's subscription. */
export const NOTIFY_TOPIC = 'notify';
export const NOTIFY_CHANNEL = 'cultuvilla';
export const NOTIFY_SOURCE = 'cultuvilla-app';

export const NOTIFY_TITLE_MAX = 200;
export const NOTIFY_BODY_MAX = 3000;
export const NOTIFY_DEDUPE_KEY_MAX = 120;

export const NotifyEnvelopeSchema = z.strictObject({
  channel: z.literal(NOTIFY_CHANNEL),
  severity: z.enum(['info', 'warn', 'critical', 'recovered']),
  title: z.string().min(1).max(NOTIFY_TITLE_MAX),
  body: z.string().max(NOTIFY_BODY_MAX),
  link: z.string().regex(/^https?:\/\/\S+$/).optional(),
  // The gateway suppresses a repeat of an open key for 6 h, so a retried
  // trigger posts once.
  dedupe_key: z.string().min(1).max(NOTIFY_DEDUPE_KEY_MAX).optional(),
  source: z.literal(NOTIFY_SOURCE),
});
export type NotifyEnvelope = z.infer<typeof NotifyEnvelopeSchema>;
export type NotifySeverity = NotifyEnvelope['severity'];

export interface NotifyMessage {
  severity: NotifySeverity;
  title: string;
  body?: string;
  link?: string;
  dedupeKey?: string;
}

const PROJECT_TAG: Partial<Record<string, string>> = { 'villa-events': 'dev', 'cultuvilla-beta': 'beta' };

const clamp = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

/**
 * The validated envelope for one message. Outside production the title carries
 * the environment (`[beta] …`), so a non-production topic wired up by mistake
 * cannot pass for a production alert. Title and body are clamped to the
 * gateway's limits; anything clamping cannot repair (an empty title, a bad
 * link) throws.
 */
export function notifyEnvelope(projectId: string | undefined, message: NotifyMessage): NotifyEnvelope {
  const tag = projectId === 'cultuvilla-prod' ? null : (PROJECT_TAG[projectId ?? ''] ?? projectId ?? 'local');
  const title = tag ? `[${tag}] ${message.title}` : message.title;
  return NotifyEnvelopeSchema.parse({
    channel: NOTIFY_CHANNEL,
    source: NOTIFY_SOURCE,
    severity: message.severity,
    title: clamp(title, NOTIFY_TITLE_MAX),
    body: clamp(message.body ?? '', NOTIFY_BODY_MAX),
    ...(message.link ? { link: message.link } : {}),
    ...(message.dedupeKey ? { dedupe_key: message.dedupeKey } : {}),
  });
}

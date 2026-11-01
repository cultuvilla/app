import { z } from 'zod';
import { EntityKindSchema } from '../interaction/EntityKind';

export const NotificationTypeSchema = z.enum([
  'waitlist_promoted',
  // Group sign-up: somebody took an open seat the recipient booked, or gave
  // one back. Both go to the group owner, who stays accountable for the seat.
  'seat_claimed',
  'seat_released',
  'event_cancelled',
  'event_updated',
  // The organizer turned in-app sign-ups off on an event that already had
  // them, which deletes every registration on it (see onEventUpdated). Sent to
  // each person who was signed up.
  'signups_disabled',
  // An organizer, village admin, or the group's own owner removed the
  // recipient's seat. The email in sendCancellationEmail is best-effort; this
  // is the durable record that the seat is gone.
  'registration_removed',
  'org_approved',
  'org_rejected',
  'organizer_request_created',
  'organizer_request_approved',
  'organizer_request_rejected',
  // Joining an org: `created` goes to its
  // admins, `approved` / `rejected` to the requester. All carry
  // entityKind 'organization' + entityId so they open the org.
  'org_join_request_created',
  'org_join_request_approved',
  'org_join_request_rejected',
  'comment_reply',
  // A T-24h nudge for an event the recipient is signed up to. Written by the
  // scheduled `sendEventReminders`, keyed so a re-run cannot send it twice.
  'event_reminder',
  // Something new appeared in the recipient's village. ONE type for the whole
  // entity family (event, news, place, barrio, organization, festivalPoster) —
  // `entityKind` says which. Six near-identical types would have meant six
  // places to update every time the family grows.
  'village_entity_published',
  // The month after a village's last fiestas: a nudge to its admins to pick
  // the year's dates and create the Wrapped. A Wrapped is not an EntityKind, so
  // it rides in `entityId` as its `wrappedId` with `entityKind` null — the year
  // it names is the one `/<pueblo>/resumen` opens.
  'village_wrapped_reminder',
  // A village's Wrapped went public, by an admin or by the grace timer. Sent to
  // every member; carries its `wrappedId` the same way and opens the viewer.
  'village_wrapped_published',
  // The cuota de socios is about to fall due, or is vencida. Written by the
  // scheduled `sendCuotaReminders` in the treasurer's name, to the member (or a
  // persona's responsible member). Carries entityKind 'organization' +
  // entityId (the org), so a client that predates the type still opens the group.
  'cuota_reminder',
  // A group task or volunteer shift: due soon, overdue, a shift still short of
  // people within 48 h (sendGroupTaskReminders, 10:00 Madrid), or a slot freed
  // up for someone on its waiting list (respondToTaskShift). Carries
  // entityKind 'organization' + entityId (the org), routed to the Grupos tab.
  'group_task',
  // A message the junta of a group sent through `sendGroupMessage` (or pushed
  // again to the unread by `nudgeGroupMessage`). entityKind 'organization' +
  // entityId (the org), like cuota_reminder; muted per group.
  'group_message',
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationDataSchema = z.object({
  type: NotificationTypeSchema,
  title: z.string(),
  body: z.string(),
  eventId: z.string().nullable(),
  municipalityId: z.string().nullable(),
  // Set on request-flow notifications (join_request_*, organizer_request_*);
  // null on the event/org notification types that don't carry a requester.
  requesterUid: z.string().nullable(),
  // Set on comment_reply notifications to deep-link to the commented entity;
  // null on notification types that don't reference an entity. The two
  // village_wrapped_* types set entityId alone, to the wrappedId.
  entityKind: EntityKindSchema.nullable(),
  entityId: z.string().nullable(),
  // On a chat message's `group_message`: the thread it opens (an aviso's id, or
  // `general`). A binary that predates it drops the field and opens the avisos.
  chatThreadId: z.string().nullable().default(null),
  read: z.boolean(),
  createdAt: z.date(),
});
export type NotificationData = z.infer<typeof NotificationDataSchema>;

export interface NotificationDataInput {
  type: NotificationType;
  title: string;
  body: string;
  eventId?: string | null;
  municipalityId?: string | null;
  requesterUid?: string | null;
  entityKind?: z.infer<typeof EntityKindSchema> | null;
  entityId?: string | null;
  chatThreadId?: string | null;
  read?: boolean;
  createdAt?: Date;
}

export function buildNotificationData(input: NotificationDataInput): NotificationData {
  return {
    type: input.type,
    title: input.title,
    body: input.body,
    eventId: input.eventId ?? null,
    municipalityId: input.municipalityId ?? null,
    requesterUid: input.requesterUid ?? null,
    entityKind: input.entityKind ?? null,
    entityId: input.entityId ?? null,
    chatThreadId: input.chatThreadId ?? null,
    read: input.read ?? false,
    createdAt: input.createdAt ?? new Date(),
  };
}

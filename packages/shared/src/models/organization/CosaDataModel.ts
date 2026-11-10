import { z } from 'zod';
import { DayKeySchema } from '../municipality/FiestaBlockModel';
import { TimeOfDaySchema } from './GroupTaskDataModel';

/**
 * The cosateca: what a group's people lend, offer and give to each other. See
 * docs/plans/ongoing/cosateca.md.
 *
 * `cosas/{cosaId}` is top-level and scoped by `municipalityId` (invariant 3): a
 * cosateca open to the pueblo is read across groups, by `municipalityId` and
 * `audience`. A cosa belongs to one group (`orgId`). Its owner is an integrante
 * (`ownerUid`) or the group itself (`ownerUid: null`, managed by its admins).
 *
 * Two fields are function-owned:
 * - `audience`, the group's effective audience, rewritten by `syncCosaAudience`
 *   when the group changes its cosateca setting. The rules read it, so a cosa of
 *   an integrantes-only group is never visible to the rest of the pueblo.
 * - `heldBy`, who has it now: set when a request is lent, cleared when it comes
 *   back (`respondToCosaRequest`).
 *
 * A `reserva` (the pádel court) is booked by time slot: `reserva` holds its
 * weekly hours and booking limits, and its `blackouts` are set only through
 * `setReservaBlackouts`, which cancels the bookings on those days.
 */

export const CosaKindSchema = z.enum(['prestamo', 'servicio', 'regalo', 'reserva']);
export type CosaKind = z.infer<typeof CosaKindSchema>;

export const COSA_CATEGORIES = ['herramientas', 'cocina', 'fiestas', 'deporte', 'ninos', 'jardin', 'libros', 'otros'] as const;
export const CosaCategorySchema = z.enum(COSA_CATEGORIES);
export type CosaCategory = z.infer<typeof CosaCategorySchema>;

export const CosatecaAudienceSchema = z.enum(['integrantes', 'pueblo']);
export type CosatecaAudience = z.infer<typeof CosatecaAudienceSchema>;

/** `organizations.cosateca`: the admin's switch and who the cosateca is for. */
export const CosatecaSettingsSchema = z.object({
  enabled: z.boolean(),
  audience: CosatecaAudienceSchema,
});
export type CosatecaSettings = z.infer<typeof CosatecaSettingsSchema>;

export const DEFAULT_COSATECA_SETTINGS: CosatecaSettings = { enabled: false, audience: 'integrantes' };

/** The audience a group's cosas carry: the pueblo only while the cosateca is on and open to it. */
export function effectiveCosaAudience(settings: CosatecaSettings): CosatecaAudience {
  return settings.enabled && settings.audience === 'pueblo' ? 'pueblo' : 'integrantes';
}

/** `available` takes requests; `paused` keeps it listed but closed; `given` is a regalo that has gone. */
export const CosaStatusSchema = z.enum(['available', 'paused', 'given']);
export type CosaStatus = z.infer<typeof CosaStatusSchema>;

export const CosaHeldBySchema = z.object({
  requestId: z.string().min(1),
  uid: z.string().min(1),
  /** The holder's name when it was lent. */
  name: z.string(),
  untilOn: DayKeySchema.nullable(),
});
export type CosaHeldBy = z.infer<typeof CosaHeldBySchema>;

/** One weekday's opening hours, Madrid wall time; a slot must end by `closesAt`. */
export const ReservaDayHoursSchema = z
  .object({ opensAt: TimeOfDaySchema, closesAt: TimeOfDaySchema })
  .refine((h) => h.opensAt < h.closesAt, 'opens after it closes');
export type ReservaDayHours = z.infer<typeof ReservaDayHoursSchema>;

/** ISO weekdays, Monday `1` to Sunday `7`, as the keys of `ReservaConfig.hours`. */
export const RESERVA_WEEKDAYS = ['1', '2', '3', '4', '5', '6', '7'] as const;
export type ReservaWeekday = (typeof RESERVA_WEEKDAYS)[number];

export const MIN_RESERVA_SLOT_MINUTES = 15;
export const MAX_RESERVA_SLOT_MINUTES = 240;
export const MAX_RESERVA_ACTIVE = 20;
export const MAX_RESERVA_HORIZON_DAYS = 90;
export const MAX_RESERVA_BLACKOUTS = 100;

/**
 * A reserva's one availability config. The grid of slots is computed from it
 * (reservaLogic.ts), never stored; only bookings are documents. A fixed map of
 * weekdays (null = closed) rather than a list, so the rules can check every
 * entry and a malformed one can never reach a reader's strict converter.
 */
export const ReservaConfigSchema = z.object({
  hours: z.object({
    '1': ReservaDayHoursSchema.nullable(),
    '2': ReservaDayHoursSchema.nullable(),
    '3': ReservaDayHoursSchema.nullable(),
    '4': ReservaDayHoursSchema.nullable(),
    '5': ReservaDayHoursSchema.nullable(),
    '6': ReservaDayHoursSchema.nullable(),
    '7': ReservaDayHoursSchema.nullable(),
  }),
  slotMinutes: z.number().int().min(MIN_RESERVA_SLOT_MINUTES).max(MAX_RESERVA_SLOT_MINUTES),
  /** Off: a free slot confirms itself. On: the manager accepts each booking. */
  requiresApproval: z.boolean(),
  /** Upcoming bookings one person may hold on this cosa at once. */
  maxActiveReservations: z.number().int().min(1).max(MAX_RESERVA_ACTIVE),
  /** How many days ahead a slot may be booked (today is day 0). */
  bookingHorizonDays: z.number().int().min(1).max(MAX_RESERVA_HORIZON_DAYS),
  /** Closed days (a fiesta, a flooded court). Function-owned: `setReservaBlackouts`. */
  blackouts: z.array(DayKeySchema).max(MAX_RESERVA_BLACKOUTS),
});
export type ReservaConfig = z.infer<typeof ReservaConfigSchema>;

const EVERY_DAY_9_TO_22: ReservaDayHours = { opensAt: '09:00', closesAt: '22:00' };

export const DEFAULT_RESERVA_CONFIG: ReservaConfig = {
  hours: {
    '1': EVERY_DAY_9_TO_22, '2': EVERY_DAY_9_TO_22, '3': EVERY_DAY_9_TO_22, '4': EVERY_DAY_9_TO_22,
    '5': EVERY_DAY_9_TO_22, '6': EVERY_DAY_9_TO_22, '7': EVERY_DAY_9_TO_22,
  },
  slotMinutes: 60,
  requiresApproval: false,
  maxActiveReservations: 2,
  bookingHorizonDays: 14,
  blackouts: [],
};

/**
 * A booked slot of a reserva, at `cosas/{cosaId}/slots/{slotKey}` where the key
 * is the slot's start as an ISO instant. The deterministic id is the lock: the
 * booking callable claims it in a transaction, so two taps on the same slot
 * leave one booking. It names no one — it is what lets every viewer of the cosa
 * see which slots are taken; the booking itself (`cosaRequests`) stays private
 * to its parties. Function-owned.
 */
export const CosaSlotDataSchema = z.object({
  requestId: z.string().min(1),
  startAt: z.date(),
  endAt: z.date(),
  status: z.enum(['pending', 'accepted']),
});
export type CosaSlotData = z.infer<typeof CosaSlotDataSchema>;

export const MAX_COSA_TITLE = 80;
export const MAX_COSA_DESCRIPTION = 1000;
export const MAX_COSA_CONDITIONS = 300;

export const CosaDataSchema = z.object({
  municipalityId: z.string().min(1),
  orgId: z.string().min(1),
  audience: CosatecaAudienceSchema,
  ownerUid: z.string().min(1).nullable(),
  /** The owner's public name (or the group's) when it was offered. */
  ownerName: z.string(),
  kind: CosaKindSchema,
  title: z.string().min(1).max(MAX_COSA_TITLE),
  description: z.string().max(MAX_COSA_DESCRIPTION).nullable(),
  category: CosaCategorySchema,
  imageURL: z.string().nullable(),
  /** Free text: "devolver limpia". No money, ever. */
  conditions: z.string().max(MAX_COSA_CONDITIONS).nullable(),
  status: CosaStatusSchema,
  heldBy: CosaHeldBySchema.nullable(),
  /** Set exactly when `kind` is `reserva`. */
  reserva: ReservaConfigSchema.nullable(),
  createdBy: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type CosaData = z.infer<typeof CosaDataSchema>;

/** What an integrante (or an admin, for the group) fills in. */
export const CosaEditSchema = CosaDataSchema.pick({
  kind: true,
  title: true,
  description: true,
  category: true,
  imageURL: true,
  conditions: true,
  status: true,
  reserva: true,
});
export type CosaEdit = z.infer<typeof CosaEditSchema>;

export interface CosaInput {
  municipalityId: string;
  orgId: string;
  audience: CosatecaAudience;
  ownerUid: string | null;
  ownerName: string;
  kind: CosaKind;
  title: string;
  description?: string | null;
  category: CosaCategory;
  imageURL?: string | null;
  conditions?: string | null;
  /** A reserva's config; ignored for every other kind. Blackouts always start empty. */
  reserva?: ReservaConfig | null;
  createdBy: string;
  createdAt?: Date;
}

export function buildCosaData(input: CosaInput): CosaData {
  const now = input.createdAt ?? new Date();
  return {
    municipalityId: input.municipalityId,
    orgId: input.orgId,
    audience: input.audience,
    ownerUid: input.ownerUid,
    ownerName: input.ownerName,
    kind: input.kind,
    title: input.title.trim(),
    description: input.description?.trim() ? input.description.trim() : null,
    category: input.category,
    imageURL: input.imageURL ?? null,
    conditions: input.conditions?.trim() ? input.conditions.trim() : null,
    status: 'available',
    heldBy: null,
    reserva: input.kind === 'reserva' ? { ...(input.reserva ?? DEFAULT_RESERVA_CONFIG), blackouts: [] } : null,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

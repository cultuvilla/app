import { z } from 'zod';

/**
 * A village's summary of one year's fiestas — every block of that year in one
 * Wrapped (Santiago in July and the Carmen in August, together).
 *
 * Stored at `villageWrapped/{municipalityId}_{year}` — the id is deterministic
 * so regenerating overwrites in place rather than duplicating.
 *
 * The exact dates live HERE, not on the village profile: a profile block is
 * only a name and a month, and the days of one year are chosen by the admin
 * who creates that year's Wrapped.
 *
 * The doc holds STATS and the rendered image paths, never the raw people or
 * event lists it was built from. Those are inputs to rendering; copying them
 * here would duplicate `municipalityPeople` and go stale the moment someone
 * changes their photo.
 */

/**
 * In the order they are shown, and the ONLY definition of that order — the
 * review screen walks this array to lay the cards out, so changing it re-orders
 * a Wrapped that was rendered long ago without re-rendering a thing.
 *
 * What the pueblo did comes before the count of it: "Lo que se hizo" is the
 * story and "En números" is the evidence, so the numbers land as a payoff
 * rather than as a preamble to cards the reader has not seen yet. Carteles
 * close the set: this year added to the pueblo's long history.
 */
export const WRAPPED_CARDS = ['cover', 'events', 'stats', 'news', 'people', 'organizers', 'posters'] as const;
export const WrappedCardSchema = z.enum([...WRAPPED_CARDS]);
export type WrappedCard = z.infer<typeof WrappedCardSchema>;

export const WRAPPED_STATUSES = ['draft', 'published', 'discarded'] as const;
export const WrappedStatusSchema = z.enum([...WRAPPED_STATUSES]);
export type WrappedStatus = z.infer<typeof WrappedStatusSchema>;

export const WrappedStatsSchema = z.object({
  /** Live events inside the window — cancelled ones never count. */
  eventCount: z.number().int(),
  /** Sign-ups, never attendance: `checkedInAt` is unused, so nothing here can claim who turned up. */
  confirmedCount: z.number().int(),
  waitlistedCount: z.number().int(),
  /** Distinct personas. The headline participation figure — families sign up
   *  several personas each, so summing registrations overstates it badly. */
  uniquePersonCount: z.number().int(),
  /** Distinct accounts behind those personas — a household, not a participant. */
  uniqueAccountCount: z.number().int(),
  commentCount: z.number().int(),
  /** People in the censo. */
  censoCount: z.number().int(),
  /** Participants who are IN the censo — the only figure that may be read
   *  against `censoCount`. `uniquePersonCount` also includes personas with no
   *  village link and people from elsewhere, so "N of censoCount" using it is
   *  a false ratio. */
  censoParticipantCount: z.number().int(),
  posterCount: z.number().int(),
});
export type WrappedStats = z.infer<typeof WrappedStatsSchema>;

/** Bounds for the credits card. Big enough that a real village's organizers
 *  all appear (Matabuena's August had 3 orgs and 10 people), small enough to lay out. */
export const MAX_ORG_CREDITS = 6;
export const MAX_PERSON_CREDITS = 12;

export const WrappedEventHighlightSchema = z.object({
  eventId: z.string(),
  title: z.string(),
  count: z.number().int(),
  capacity: z.number().int().nullable(),
});

export const WrappedOrgCreditSchema = z.object({
  organizationId: z.string(),
  name: z.string(),
  eventCount: z.number().int(),
  imageURL: z.string().nullable(),
});

export const WrappedPersonCreditSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  eventCount: z.number().int(),
  photoURL: z.string().nullable(),
});

/** One fiesta block as it happened in this Wrapped's year. Name snapshotted, so a later rename does not rewrite history. */
export const WrappedBlockSchema = z.object({
  blockId: z.string(),
  name: z.string(),
  start: z.date(),
  end: z.date(),
});
export type WrappedBlock = z.infer<typeof WrappedBlockSchema>;

export const WrappedDataSchema = z.object({
  municipalityId: z.string(),
  villageName: z.string(),
  year: z.number().int(),
  /** In date order; shown on the cover. */
  blocks: z.array(WrappedBlockSchema).min(1),
  /** Everything counted — events, sign-ups, comments, articles — falls inside
   *  this range. Always contains every block, and may reach beyond them (the
   *  articles written the week before the fiestas). */
  rangeStart: z.date(),
  rangeEnd: z.date(),

  status: WrappedStatusSchema,
  /** When the timer publishes a draft nobody acted on. Null once terminal, and
   *  null while the quality floor holds a thin Wrapped back from auto-publishing. */
  autoPublishAt: z.date().nullable(),
  computedAt: z.date(),

  stats: WrappedStatsSchema,
  fullestEvent: WrappedEventHighlightSchema.nullable(),
  mostCommentedEvent: WrappedEventHighlightSchema.nullable(),
  topOrganizations: z.array(WrappedOrgCreditSchema).max(MAX_ORG_CREDITS),
  topOrganizers: z.array(WrappedPersonCreditSchema).max(MAX_PERSON_CREDITS),

  /** Download URL of each rendered card. A URL rather than a storage path
   *  because a Wrapped is made to be forwarded: the recipient may not be a
   *  member, or signed in at all, and the link has to still resolve.
   *  Partial: a card with nothing to show (a year with no articles) is left
   *  out rather than shipped blank. */
  images: z.partialRecord(WrappedCardSchema, z.string()),
});
export type WrappedData = z.infer<typeof WrappedDataSchema>;

export function wrappedId(municipalityId: string, year: number): string {
  return `${municipalityId}_${String(year)}`;
}

/** The year inside a `wrappedId` — the last segment, since a municipality id may itself contain `_`. */
export function yearOfWrappedId(id: string | null): number | null {
  const match = id ? /_(\d{4})$/.exec(id) : null;
  return match ? Number(match[1]) : null;
}

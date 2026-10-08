import { z } from 'zod';

export const AmbassadorLeadStatusSchema = z.enum(['new', 'contacted', 'closed']);
export type AmbassadorLeadStatus = z.infer<typeof AmbassadorLeadStatusSchema>;

/**
 * Someone who asked, from the /embajadores page of the read site, to be the
 * Embajador of their pueblo. A lead, not an `organizerRequests` doc: the web
 * has no accounts, so the team calls them back and walks them through the app.
 * Stored top-level at `ambassadorLeads/{leadId}`. Written ONLY by the readSite
 * function (admin SDK); firestore.rules denies every client write, and only app
 * admins may read, because it holds a name and a phone number.
 *
 * `municipalityId` is null when what they typed matched no municipality — the
 * typed name is still kept, since a person reads it.
 */
export const AmbassadorLeadDataSchema = z.object({
  municipalityId: z.string().nullable(),
  municipalityName: z.string(),
  name: z.string(),
  phone: z.string(),
  status: AmbassadorLeadStatusSchema,
  createdAt: z.date(),
});
export type AmbassadorLeadData = z.infer<typeof AmbassadorLeadDataSchema>;

export interface AmbassadorLeadDataInput {
  municipalityId: string | null;
  municipalityName: string;
  name: string;
  phone: string;
  createdAt: Date;
}

export function buildAmbassadorLeadData(input: AmbassadorLeadDataInput): AmbassadorLeadData {
  return { ...input, status: 'new' };
}

/**
 * A phone number in E.164, or null when it cannot be one. A bare Spanish
 * number (9 digits, starting 6–9) gets +34; a leading 00 becomes +. Spaces,
 * dots, dashes and brackets are ignored.
 */
export function normalizeLeadPhone(raw: string): string | null {
  const compact = raw.trim().replace(/[\s.\-()]/g, '');
  const international = compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
  if (/^[6-9]\d{8}$/.test(international)) return `+34${international}`;
  if (/^\+\d{8,15}$/.test(international)) return international;
  return null;
}

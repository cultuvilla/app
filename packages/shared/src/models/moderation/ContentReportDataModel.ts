import { z } from 'zod';
import { ENTITY_KINDS } from '../interaction/EntityKind';

/**
 * What a person can report. `comment` and `person` are not entity kinds (they
 * have no hero-detail screen), but they are the two surfaces most likely to
 * carry abuse, so the report target is deliberately wider than `EntityKind`.
 */
export const REPORT_TARGET_KINDS = [...ENTITY_KINDS, 'comment', 'person'] as const;
export const ReportTargetKindSchema = z.enum(REPORT_TARGET_KINDS);
export type ReportTargetKind = z.infer<typeof ReportTargetKindSchema>;

/** Fixed reasons — free text is the optional `note`, never the taxonomy. */
export const REPORT_REASONS = [
  'spam',
  'harassment',
  'hate',
  'sexual',
  'violence',
  'falseInfo',
  'other',
] as const;
export const ReportReasonSchema = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof ReportReasonSchema>;

export const ReportStatusSchema = z.enum(['open', 'reviewed', 'dismissed']);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

/**
 * A report filed by a person against user-generated content. Stored top-level
 * at `contentReports/{reportId}`, scoped by `municipalityId` so the village's
 * admins can read what was reported in their own pueblo.
 *
 * Both stores require an in-app reporting path for UGC (Play's content-rating
 * questionnaire, App Store guideline 1.2); this collection is that path.
 */
export const ContentReportDataSchema = z.object({
  municipalityId: z.string(),
  targetKind: ReportTargetKindSchema,
  targetId: z.string(),
  /** Author of the reported content, when the reporting screen knows it. */
  targetAuthorUserId: z.string().nullable(),
  reporterUserId: z.string(),
  reason: ReportReasonSchema,
  note: z.string().max(500).nullable(),
  /**
   * A copy of the reported words, for content its moderators cannot open: a
   * group chat message is private to the group, so its report (`comment`, with
   * the message's path as `targetId`) carries the text. The reporter supplies it.
   */
  targetText: z.string().max(2000).nullable().default(null),
  status: ReportStatusSchema,
  createdAt: z.date(),
});
export type ContentReportData = z.infer<typeof ContentReportDataSchema>;

export interface ContentReportDataInput {
  municipalityId: string;
  targetKind: ReportTargetKind;
  targetId: string;
  targetAuthorUserId?: string | null;
  reporterUserId: string;
  reason: ReportReason;
  note?: string | null;
  targetText?: string | null;
  createdAt?: Date;
}

export function buildContentReportData(input: ContentReportDataInput): ContentReportData {
  return {
    municipalityId: input.municipalityId,
    targetKind: input.targetKind,
    targetId: input.targetId,
    targetAuthorUserId: input.targetAuthorUserId ?? null,
    reporterUserId: input.reporterUserId,
    reason: input.reason,
    note: input.note?.trim() ? input.note.trim() : null,
    targetText: input.targetText ?? null,
    // A report always lands unreviewed: `status` is the moderator's field, and
    // the create rule pins it to 'open' so a reporter cannot self-resolve.
    status: 'open',
    createdAt: input.createdAt ?? new Date(),
  };
}

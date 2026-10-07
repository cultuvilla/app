import { z } from 'zod';
import { ProfileAnswersSchema, type ProfileAnswers } from './CensoTypes';

/**
 * A villager's answers to their village's censo (residency, household, minors,
 * origin, …). Stored at `censoAnswers/{municipalityId}_{userId}`, readable by
 * that villager, the village's admins and app admins only — deliberately NOT on
 * the world-readable member doc. Completion (`profileCompletedAt`) stays on the
 * member doc: that it is complete is not private, what it says is.
 */
export const CensoAnswersDataSchema = z.object({
  municipalityId: z.string(),
  userId: z.string(),
  profileAnswers: ProfileAnswersSchema,
  updatedAt: z.date(),
});
export type CensoAnswersData = z.infer<typeof CensoAnswersDataSchema>;

export function censoAnswersId(municipalityId: string, userId: string): string {
  return `${municipalityId}_${userId}`;
}

export function buildCensoAnswersData(input: {
  municipalityId: string;
  userId: string;
  profileAnswers: ProfileAnswers;
  updatedAt?: Date;
}): CensoAnswersData {
  return {
    municipalityId: input.municipalityId,
    userId: input.userId,
    profileAnswers: input.profileAnswers,
    updatedAt: input.updatedAt ?? new Date(),
  };
}

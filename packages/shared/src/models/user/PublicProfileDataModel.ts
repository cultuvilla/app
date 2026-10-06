import { z } from 'zod';
import type { UserData } from './UserDataModel';

/**
 * What other people may see of an account: `publicProfiles/{uid}`, a
 * function-owned projection of `users/{uid}` kept in sync by
 * functions/src/users/syncPublicProfile.ts. The account doc itself carries
 * private contact fields (email, telephone) and is readable only by its owner,
 * so every read of *someone else's* account goes through this doc instead.
 * Add a field here only if it is safe for anyone, signed in or not, to read.
 */
export const PublicProfileDataSchema = z.object({
  displayName: z.string(),
  activeMunicipalityId: z.string().nullable(),
});
export type PublicProfileData = z.infer<typeof PublicProfileDataSchema>;

export function buildPublicProfileData(
  user: Pick<UserData, 'displayName' | 'activeMunicipalityId'>,
): PublicProfileData {
  return {
    displayName: user.displayName,
    activeMunicipalityId: user.activeMunicipalityId,
  };
}

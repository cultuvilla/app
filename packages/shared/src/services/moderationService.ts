// packages/shared/src/services/moderationService.ts
import { httpsCallable } from '../firebase/sdk/functions';
import { getFirebaseFunctions } from '../firebase';
import type { ModeratedCollection } from '../models/moderation/ModerationEventDataModel';

export interface SetVisibilityInput {
  collection: ModeratedCollection;
  docId: string;
  /** Required for nested collections (`barrios`, `places`) — those docs live
   *  under `municipalities/{id}/...` and carry no `municipalityId` field of
   *  their own. Ignored for `news`/`festivalPosters`, whose municipalityId
   *  is derived server-side from the target doc. */
  municipalityId?: string;
  reason?: string;
}

interface SetContentVisibilityPayload {
  collection: ModeratedCollection;
  docId: string;
  hidden: boolean;
  reason?: string;
  municipalityId?: string;
}

interface SetContentVisibilityResult {
  status: 'active' | 'hidden';
}

function setContentVisibilityCallable() {
  return httpsCallable<SetContentVisibilityPayload, SetContentVisibilityResult>(
    getFirebaseFunctions(),
    'setContentVisibility',
  );
}

/** Hide a piece of moderated content (village/app admin only — enforced server-side). */
export async function hideContent(input: SetVisibilityInput): Promise<void> {
  await setContentVisibilityCallable()({
    collection: input.collection,
    docId: input.docId,
    hidden: true,
    reason: input.reason,
    municipalityId: input.municipalityId,
  });
}

/** Unhide previously-hidden content (village/app admin only — enforced server-side). */
export async function unhideContent(
  input: Omit<SetVisibilityInput, 'reason'>,
): Promise<void> {
  await setContentVisibilityCallable()({
    collection: input.collection,
    docId: input.docId,
    hidden: false,
    municipalityId: input.municipalityId,
  });
}

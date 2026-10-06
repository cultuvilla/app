import { httpsCallable } from '../firebase/sdk/functions';
import { getFirebaseFunctions } from '../firebase';

/**
 * A village/org where the caller is the sole admin — must be resolved
 * (promote another admin) before the account can be deleted. Mirrors
 * `DeletionBlocker` in functions/src/account/blockers.ts.
 */
export interface Blocker {
  scopeType: 'village' | 'org';
  scopeId: string;
  name: string;
}

interface CheckAccountDeletableResult {
  blockers: Blocker[];
}

interface DeleteAccountResult {
  ok: true;
}

/**
 * Read-only preview for the account-deletion flow (Task 6's callable):
 * reports the villages/orgs where the caller is the sole admin.
 */
export async function checkAccountDeletable(): Promise<CheckAccountDeletableResult> {
  const fn = httpsCallable<undefined, CheckAccountDeletableResult>(
    getFirebaseFunctions(),
    'checkAccountDeletable',
  );
  const result = await fn();
  return result.data;
}

/**
 * Irreversible RGPD/GDPR account erasure (Task 7's callable). The server
 * re-runs the sole-admin blocker check and aborts before deleting anything
 * if the caller still has one — the client's `checkAccountDeletable` preview
 * is never trusted for the actual deletion decision.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const fn = httpsCallable<undefined, DeleteAccountResult>(getFirebaseFunctions(), 'deleteAccount');
  const result = await fn();
  return result.data;
}

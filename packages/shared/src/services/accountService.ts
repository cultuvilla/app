import { getCallable } from './callableTransport';

import { firebaseErrorCode } from '../firebase/sdk/errors';
import { REAUTH_REQUIRED_REASON, type DeleteAccountRequest } from '../models/user/accountDeletion';

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
  const fn = getCallable<undefined, CheckAccountDeletableResult>('checkAccountDeletable');
  const result = await fn();
  return result.data;
}

/**
 * Irreversible RGPD/GDPR account erasure (Task 7's callable). The server
 * re-runs the sole-admin blocker check and aborts before deleting anything
 * if the caller still has one — the client's `checkAccountDeletable` preview
 * is never trusted for the actual deletion decision.
 *
 * `reauth: true` tells the server this client can sign in again, so it holds
 * the call to a recent sign-in: a stale one rejects with an error
 * `isReauthRequiredError` recognises, and the caller reauthenticates and retries.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const fn = getCallable<DeleteAccountRequest, DeleteAccountResult>('deleteAccount');
  const result = await fn({ reauth: true });
  return result.data;
}

/** True when `deleteAccount` refused because the sign-in is too old. */
export function isReauthRequiredError(error: unknown): boolean {
  if (firebaseErrorCode(error) !== 'failed-precondition') return false;
  const details = (error as { details?: unknown }).details;
  return (
    typeof details === 'object' &&
    details !== null &&
    (details as { reason?: unknown }).reason === REAUTH_REQUIRED_REASON
  );
}

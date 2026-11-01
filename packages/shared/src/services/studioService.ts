import { httpsCallable } from '../firebase/sdk/functions';
import { getFirebaseFunctions } from '../firebase';
import type {
  ApproveStudioPairingInput,
  ClaimStudioPairingInput,
  ClaimStudioPairingResult,
  CreateStudioPairingResult,
  InspectStudioPairingResult,
} from '../models/studio/studioPairing';

// Web studio sign-in by pairing with the app — see models/studio/studioPairing.ts.

/** Studio: ask for a pairing to show as a QR code. */
export async function createStudioPairing(): Promise<CreateStudioPairingResult> {
  const fn = httpsCallable<undefined, CreateStudioPairingResult>(getFirebaseFunctions(), 'createStudioPairing');
  return (await fn()).data;
}

/** Studio: poll for the approval; `approved` carries a custom token to sign in with. */
export async function claimStudioPairing(input: ClaimStudioPairingInput): Promise<ClaimStudioPairingResult> {
  const fn = httpsCallable<ClaimStudioPairingInput, ClaimStudioPairingResult>(
    getFirebaseFunctions(),
    'claimStudioPairing',
  );
  return (await fn(input)).data;
}

/** App: the code the studio shows, for the user to compare before approving. */
export async function inspectStudioPairing(pairingId: string): Promise<InspectStudioPairingResult> {
  const fn = httpsCallable<ApproveStudioPairingInput, InspectStudioPairingResult>(
    getFirebaseFunctions(),
    'inspectStudioPairing',
  );
  return (await fn({ pairingId })).data;
}

/** App: sign the studio in as the current user. */
export async function approveStudioPairing(pairingId: string): Promise<void> {
  const fn = httpsCallable<ApproveStudioPairingInput, { ok: true }>(getFirebaseFunctions(), 'approveStudioPairing');
  await fn({ pairingId });
}

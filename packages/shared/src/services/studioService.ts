import { getCallable } from './callableTransport';

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
  const fn = getCallable<undefined, CreateStudioPairingResult>('createStudioPairing');
  return (await fn()).data;
}

/** Studio: poll for the approval; `approved` carries a custom token to sign in with. */
export async function claimStudioPairing(input: ClaimStudioPairingInput): Promise<ClaimStudioPairingResult> {
  const fn = getCallable<ClaimStudioPairingInput, ClaimStudioPairingResult>('claimStudioPairing');
  return (await fn(input)).data;
}

/** App: the code the studio shows, for the user to compare before approving. */
export async function inspectStudioPairing(pairingId: string): Promise<InspectStudioPairingResult> {
  const fn = getCallable<ApproveStudioPairingInput, InspectStudioPairingResult>('inspectStudioPairing');
  return (await fn({ pairingId })).data;
}

/** App: sign the studio in as the current user. */
export async function approveStudioPairing(pairingId: string): Promise<void> {
  const fn = getCallable<ApproveStudioPairingInput, { ok: true }>('approveStudioPairing');
  await fn({ pairingId });
}

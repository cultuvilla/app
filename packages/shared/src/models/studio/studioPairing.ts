/**
 * Sign-in to the web studio by pairing with the app: the contract between the
 * pairing callables (functions/src/studio/studioPairing.ts), the studio that
 * asks for a pairing, and the app that approves it.
 *
 * Pairings are stored at `studioPairings/{pairingId}`, written and read only by
 * those callables (firestore.rules denies every client). The doc is single-use
 * and lives for `STUDIO_PAIRING_TTL_MS`.
 */
export const STUDIO_PAIRING_COLLECTION = 'studioPairings';
export const STUDIO_PAIRING_TTL_MS = 5 * 60 * 1000;

export interface CreateStudioPairingResult {
  /** Public: rides in the QR code the app scans. */
  pairingId: string;
  /** Private to the studio tab that asked: redeems the approved pairing. */
  claimSecret: string;
  /** Shown on both screens, so the user can check they approve their own. */
  code: string;
  /** Epoch millis. */
  expiresAt: number;
}

export interface ClaimStudioPairingInput {
  pairingId: string;
  claimSecret: string;
}

export type ClaimStudioPairingResult = { status: 'pending' } | { status: 'approved'; token: string };

export interface ApproveStudioPairingInput {
  pairingId: string;
}

export interface InspectStudioPairingResult {
  code: string;
  /** Epoch millis. */
  expiresAt: number;
}

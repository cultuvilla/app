import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import {
  STUDIO_PAIRING_COLLECTION,
  STUDIO_PAIRING_TTL_MS,
  type ApproveStudioPairingInput,
  type ClaimStudioPairingInput,
  type ClaimStudioPairingResult,
  type CreateStudioPairingResult,
  type InspectStudioPairingResult,
} from '@cultuvilla/shared/models';
import { callerIpOf, checkRateLimit, ipBucketIdFor } from '../auth/rateLimit';

// Sign-in to the web studio by pairing with the signed-in app
// (docs/plans/ongoing/web-studio.md). The studio asks for a pairing and shows
// its id as a QR code; the app scans it and binds the id to its user; the
// studio, polling with a secret only it holds, receives a custom token for that
// user. Accounts are never created here: only someone already signed in to the
// app can open a studio session.
//
// The QR code is public (anyone near the screen can photograph it), so it
// carries only the pairing id. Redeeming the token takes the claim secret,
// which never leaves the studio tab that asked for the pairing.

const PAIRINGS_PER_IP = 20;
const EXPIRED_SWEEP_LIMIT = 50;
// No 0/O, 1/I/L: the code is read off one screen and compared with another.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;

interface StudioPairingDoc {
  claimSecretHash: string;
  code: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  uid: string | null;
  approvedAt: Timestamp | null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function pairingCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

function requirePairingId(data: { pairingId?: unknown } | undefined): string {
  const id = data?.pairingId;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
    throw new HttpsError('invalid-argument', 'Código de vinculación no válido.');
  }
  return id;
}

function pairings() {
  return getFirestore().collection(STUDIO_PAIRING_COLLECTION);
}

/** Pairings nobody claimed are deleted by the next request for a new one. */
async function sweepExpiredPairings(): Promise<void> {
  const expired = await pairings().where('expiresAt', '<', Timestamp.now()).limit(EXPIRED_SWEEP_LIMIT).get();
  if (expired.empty) return;
  const batch = getFirestore().batch();
  expired.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export async function runCreateStudioPairing(callerIp: string | null): Promise<CreateStudioPairingResult> {
  if (callerIp && !(await checkRateLimit(`studio_${ipBucketIdFor(callerIp)}`, PAIRINGS_PER_IP))) {
    throw new HttpsError('resource-exhausted', 'Demasiados intentos. Espera unos minutos.');
  }

  const pairingId = randomBytes(18).toString('base64url');
  const claimSecret = randomBytes(32).toString('base64url');
  const code = pairingCode();
  const now = Date.now();
  const expiresAt = now + STUDIO_PAIRING_TTL_MS;
  const doc: StudioPairingDoc = {
    claimSecretHash: sha256(claimSecret),
    code,
    createdAt: Timestamp.fromMillis(now),
    expiresAt: Timestamp.fromMillis(expiresAt),
    uid: null,
    approvedAt: null,
  };
  await pairings().doc(pairingId).create(doc);

  await sweepExpiredPairings().catch((err: unknown) => {
    logger.warn('studio pairing sweep failed', {
      handler: 'createStudioPairing',
      error: err instanceof Error ? err.message : String(err),
    });
  });
  return { pairingId, claimSecret, code, expiresAt };
}

async function livePairing(pairingId: string): Promise<StudioPairingDoc> {
  const snap = await pairings().doc(pairingId).get();
  const pairing = snap.data() as StudioPairingDoc | undefined;
  if (!pairing || pairing.expiresAt.toMillis() < Date.now()) {
    throw new HttpsError('not-found', 'Este código ha caducado. Recarga el estudio para ver uno nuevo.');
  }
  return pairing;
}

export async function runInspectStudioPairing(
  uid: string | undefined,
  data: { pairingId?: unknown } | undefined,
): Promise<InspectStudioPairingResult> {
  if (!uid) throw new HttpsError('unauthenticated', 'Inicia sesión en la app para vincular el estudio.');
  const pairing = await livePairing(requirePairingId(data));
  if (pairing.uid) throw new HttpsError('failed-precondition', 'Este código ya se ha usado.');
  return { code: pairing.code, expiresAt: pairing.expiresAt.toMillis() };
}

export async function runApproveStudioPairing(
  uid: string | undefined,
  data: ApproveStudioPairingInput | undefined,
): Promise<{ ok: true }> {
  if (!uid) throw new HttpsError('unauthenticated', 'Inicia sesión en la app para vincular el estudio.');
  const pairingId = requirePairingId(data);
  const ref = pairings().doc(pairingId);
  await getFirestore().runTransaction(async (tx) => {
    const pairing = (await tx.get(ref)).data() as StudioPairingDoc | undefined;
    if (!pairing || pairing.expiresAt.toMillis() < Date.now()) {
      throw new HttpsError('not-found', 'Este código ha caducado. Recarga el estudio para ver uno nuevo.');
    }
    if (pairing.uid) throw new HttpsError('failed-precondition', 'Este código ya se ha usado.');
    tx.update(ref, { uid, approvedAt: Timestamp.now() });
  });
  logger.info('studio pairing approved', { handler: 'approveStudioPairing', uid });
  return { ok: true };
}

export async function runClaimStudioPairing(
  data: ClaimStudioPairingInput | undefined,
): Promise<ClaimStudioPairingResult> {
  const pairingId = requirePairingId(data);
  const claimSecret = data?.claimSecret;
  if (typeof claimSecret !== 'string' || claimSecret.length === 0) {
    throw new HttpsError('invalid-argument', 'Código de vinculación no válido.');
  }

  const ref = pairings().doc(pairingId);
  const outcome = await getFirestore().runTransaction(async (tx) => {
    const pairing = (await tx.get(ref)).data() as StudioPairingDoc | undefined;
    // A wrong secret answers exactly like a missing pairing: it must not reveal
    // that the id exists.
    if (!pairing || !sameHash(pairing.claimSecretHash, sha256(claimSecret))) return { kind: 'gone' } as const;
    if (pairing.expiresAt.toMillis() < Date.now()) {
      tx.delete(ref);
      return { kind: 'gone' } as const;
    }
    if (!pairing.uid) return { kind: 'pending' } as const;
    // Single use: the token is minted once, and the pairing goes with it.
    tx.delete(ref);
    return { kind: 'approved', uid: pairing.uid } as const;
  });

  if (outcome.kind === 'gone') {
    throw new HttpsError('not-found', 'Este código ha caducado. Recarga el estudio para ver uno nuevo.');
  }
  if (outcome.kind === 'pending') return { status: 'pending' };
  const { uid } = outcome;
  const token = await getAuth().createCustomToken(uid);
  logger.info('studio pairing claimed', { handler: 'claimStudioPairing', uid });
  return { status: 'approved', token };
}

// Unauthenticated by design: the studio has no session until the pairing completes.
export const createStudioPairing = onCall<unknown, Promise<CreateStudioPairingResult>>(
  { region: 'us-central1', cors: true },
  async (request) => runCreateStudioPairing(callerIpOf(request.rawRequest)),
);

export const claimStudioPairing = onCall<ClaimStudioPairingInput, Promise<ClaimStudioPairingResult>>(
  { region: 'us-central1', cors: true },
  async (request) => runClaimStudioPairing(request.data),
);

export const inspectStudioPairing = onCall<ApproveStudioPairingInput, Promise<InspectStudioPairingResult>>(
  { region: 'us-central1' },
  async (request) => runInspectStudioPairing(request.auth?.uid, request.data),
);

export const approveStudioPairing = onCall<ApproveStudioPairingInput, Promise<{ ok: true }>>(
  { region: 'us-central1' },
  async (request) => runApproveStudioPairing(request.auth?.uid, request.data),
);

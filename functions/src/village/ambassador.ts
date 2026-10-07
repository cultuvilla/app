import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { personsCollection } from '@cultuvilla/shared/firebase/refs/admin';
import type { Sex } from '@cultuvilla/shared';

/**
 * Read phase: the account-holder's own `sex`, for the Embajador/Embajadora
 * title denormalized onto `community.organizerSex`. MUST run before any
 * transaction write. A user with no person doc yet reads as `null` (masculine
 * title) until syncPersonDenormalization catches up.
 */
export async function readOwnSex(
  tx: Transaction,
  db: Firestore,
  userId: string,
): Promise<Sex | null> {
  const snap = await tx.get(personsCollection(db).where('userId', '==', userId).limit(1));
  if (snap.empty) return null;
  return snap.docs[0].data().sex ?? null;
}

/** Notification copy for the approval moment — the one place the title is
 *  written server-side, so it is gendered here rather than in i18n. */
export function ambassadorTitle(sex: Sex | null): string {
  return sex === 'female' ? 'Embajadora' : 'Embajador';
}

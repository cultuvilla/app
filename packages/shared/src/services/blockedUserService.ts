import { deleteDoc, getDocs, setDoc } from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import { userBlockedUsersCollection, userBlockedUserDoc } from '../firebase/refs/client';
import { buildBlockedUserData } from '../models/user/BlockedUserDataModel';

/**
 * Block list of one user, keyed by the blocked uid so blocking twice is the
 * same write. Reads are owner-only (firestore.rules), so this list never
 * discloses who blocked whom.
 */
export async function blockUser(userId: string, blockedUserId: string): Promise<void> {
  if (userId === blockedUserId) throw new Error('Cannot block yourself');
  await setDoc(
    userBlockedUserDoc(getDb(), userId, blockedUserId),
    buildBlockedUserData({ blockedUserId }),
  );
}

export async function unblockUser(userId: string, blockedUserId: string): Promise<void> {
  await deleteDoc(userBlockedUserDoc(getDb(), userId, blockedUserId));
}

/**
 * The whole list, not a per-author lookup: every screen that renders UGC needs
 * to filter a batch of authors at once, and the list is a handful of docs.
 */
export async function getBlockedUserIds(userId: string): Promise<string[]> {
  const snap = await getDocs(userBlockedUsersCollection(getDb(), userId));
  return snap.docs.map((d) => d.data().blockedUserId);
}

import { getDoc } from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import { adminDoc } from '../firebase/refs/client';

export async function isAppAdmin(userId: string): Promise<boolean> {
  try {
    const snap = await getDoc(adminDoc(getDb(), userId));
    return snap.exists();
  } catch {
    // Rules deny read for non-admins — treat as "not admin".
    return false;
  }
}

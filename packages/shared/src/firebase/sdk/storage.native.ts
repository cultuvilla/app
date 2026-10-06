// Native twin of ./storage.ts — see ./README.md.
import { uploadBytesResumable } from '@react-native-firebase/storage';

// test-login: allowed — a re-export for firebaseInit.ts, which owns the wiring.
export { connectStorageEmulator, getDownloadURL, getStorage, ref } from '@react-native-firebase/storage';

type UploadArgs = Parameters<typeof uploadBytesResumable>;

/**
 * `@react-native-firebase/storage` declares `uploadBytes` but throws "not
 * implemented"; the resumable task is the same upload, awaited.
 */
export async function uploadBytes(storageRef: UploadArgs[0], data: UploadArgs[1], metadata?: UploadArgs[2]) {
  const snapshot = await uploadBytesResumable(storageRef, data, metadata);
  return { ref: snapshot.ref, metadata: snapshot.metadata };
}

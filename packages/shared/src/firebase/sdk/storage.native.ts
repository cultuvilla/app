// Native twin of ./storage.ts — see ./README.md.
import { uploadString } from '@react-native-firebase/storage';

// test-login: allowed — a re-export for firebaseInit.ts, which owns the wiring.
export { connectStorageEmulator, getDownloadURL, getStorage, ref } from '@react-native-firebase/storage';

type UploadArgs = Parameters<typeof uploadString>;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== 'string') {
        reject(new Error('No se pudo leer la imagen'));
        return;
      }
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
    };
    reader.onerror = () => {
      reject(new Error('No se pudo leer la imagen'));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * `@react-native-firebase/storage` declares `uploadBytes` but throws "not
 * implemented", and its `put(blob)` is broken whenever metadata carries a
 * `contentType`: it forwards the blob as an undecoded `data_url`, which the
 * Android uploader cannot decode ("bytes cannot be null"). So the blob is read
 * to base64 here and uploaded as a string.
 */
export async function uploadBytes(storageRef: UploadArgs[0], data: Blob, metadata?: UploadArgs[3]) {
  const snapshot = await uploadString(storageRef, await blobToBase64(data), 'base64', metadata);
  return { ref: snapshot.ref, metadata: snapshot.metadata };
}

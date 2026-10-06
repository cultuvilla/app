// Native twin of ./firestore.ts — see ./README.md.
//
// Divergences from the JS SDK worth knowing at a call site:
//   - Timestamp / GeoPoint are different classes; the converters duck-type
//     them (sdkAdapters.client.ts), so never `instanceof` across SDKs.
//   - Error codes carry a `firestore/` prefix (`firestore/permission-denied`).
//     Use `firebaseErrorCode()` from ./errors to compare codes.
export {
  addDoc,
  clearIndexedDbPersistence,
  collection,
  collectionGroup,
  // test-login: allowed — a re-export for firebaseInit.ts, which owns the wiring.
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getDocsFromCache,
  getFirestore,
  GeoPoint,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  terminate,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from '@react-native-firebase/firestore';

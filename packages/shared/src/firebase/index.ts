export {
  _resetFirebaseForTests,
  getAuth,
  getDb,
  getFirebaseApp,
  getFirebaseFunctions,
  getFirebaseStorage,
  initFirebase,
} from './firebaseApp';
export type { InitFirebaseOptions } from './firebaseApp';

// Re-export selected Firebase SDK symbols so apps never need to import from
// `firebase/*` directly (see AGENTS.md: service-layer ownership rule). These
// are pure class / type re-exports and require no initialization.
export { GeoPoint, Timestamp } from './sdk/firestore';
export type { User } from './sdk/auth';

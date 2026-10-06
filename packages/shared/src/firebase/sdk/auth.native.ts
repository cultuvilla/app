// Native twin of ./auth.ts — see ./README.md. The native Auth user is the one
// native Firestore, Functions and Storage authenticate with, which is why auth
// moves to the native SDK together with them.
export {
  // test-login: allowed — a re-export for firebaseInit.ts, which owns the wiring.
  connectAuthEmulator,
  EmailAuthProvider,
  getAuth,
  GoogleAuthProvider,
  isSignInWithEmailLink,
  OAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithCredential,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
  verifyBeforeUpdateEmail,
} from '@react-native-firebase/auth';

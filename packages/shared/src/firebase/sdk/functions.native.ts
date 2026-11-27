// Native twin of ./functions.ts — see ./README.md.
// test-login: allowed — a re-export for firebaseInit.ts, which owns the wiring.
export {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  // The JS SDK spells it `httpsCallableFromURL`; the seam keeps the JS name.
  httpsCallableFromUrl as httpsCallableFromURL,
} from '@react-native-firebase/functions';

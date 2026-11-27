// Native twin of ./functions.ts — see ./README.md.
// test-login: allowed — a re-export for firebaseInit.ts, which owns the wiring.
export { connectFunctionsEmulator, getFunctions, httpsCallable } from '@react-native-firebase/functions';
// The JS SDK spells it `httpsCallableFromURL`; the seam keeps the JS name.
export { httpsCallableFromUrl as httpsCallableFromURL } from '@react-native-firebase/functions';

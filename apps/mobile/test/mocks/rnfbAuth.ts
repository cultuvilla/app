class Provider {
  static credential = jest.fn();
  static credentialWithLink = jest.fn();
  credential = jest.fn();
}

export const getAuth = jest.fn(() => ({ currentUser: null }));
export const connectAuthEmulator = jest.fn();
export const onAuthStateChanged = jest.fn(() => () => undefined);
export const signInWithCredential = jest.fn();
export const signInWithCustomToken = jest.fn();
export const signInWithEmailAndPassword = jest.fn();
export const signOut = jest.fn();
export const reauthenticateWithCredential = jest.fn();
export const verifyBeforeUpdateEmail = jest.fn();
export const isSignInWithEmailLink = jest.fn(() => false);
export const GoogleAuthProvider = Provider;
export const OAuthProvider = Provider;
export const EmailAuthProvider = Provider;

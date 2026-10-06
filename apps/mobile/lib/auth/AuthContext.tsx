import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import type { FirebaseOptions } from 'firebase/app';
import type { User } from 'firebase/auth';
import { getAuth } from '@cultuvilla/shared/firebase';
import { observability } from '@cultuvilla/shared';
import {
  signOut as fbSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signInWithCustomToken,
  isSignInWithEmailLink,
  signInWithEmailAndPassword,
  verifyBeforeUpdateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from '@cultuvilla/shared/firebase/sdk/auth';
import {
  getUserProfile,
  setActiveMunicipality,
  patchUserProfile,
} from '@cultuvilla/shared/services/userService';
import {
  sendAuthSignInEmail,
  sendAuthOtpCode,
  verifyAuthOtpCode,
} from '@cultuvilla/shared/services/authEmailService';
import { getUserMemberships } from '@cultuvilla/shared/services/villageMemberService';
import * as listenerManager from '@cultuvilla/shared/services/listenerManager';
import type { UserData } from '@cultuvilla/shared/models/user';
import { isE2EEmulatorHost, parseE2ELoginLink } from './e2eLoginLink';
import { clearLocalCacheAndRestart } from './clearLocalCache';
import {
  GoogleSignin,
  statusCodes,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { clearPendingIntent } from './pendingIntent';
import {
  clearPendingToken,
  getPendingToken,
  rememberPendingToken,
  shouldRetainToken,
} from './otpTokenCache';
import { fetchUserIdHash } from '../observability/errorBridge';
import { unregisterPushForSignOut } from '../push/pushSession';

declare const __DEV__: boolean;

interface GoogleSignInExtra {
  webClientId: string;
  iosClientId: string;
}

interface DevLogin {
  emails: string[];
  password: string;
}

// Dev-only convenience: one-tap sign-in to seeded test accounts from the login
// screen. app.config.ts only populates `extra.devLogin` for `dev` builds when
// DEV_LOGIN_EMAILS/PASSWORD are set; the __DEV__ guard is a second backstop so
// this is impossible in a production bundle.
function getDevLogin(): DevLogin | null {
  if (!__DEV__) return null;
  const extra = Constants.expoConfig?.extra as { devLogin?: DevLogin | null } | undefined;
  const cfg = extra?.devLogin;
  if (!cfg?.emails?.length || !cfg.password) return null;
  return cfg;
}

function getGoogleSignInConfig(): GoogleSignInExtra | null {
  const extra = Constants.expoConfig?.extra as { googleSignIn?: GoogleSignInExtra } | undefined;
  const cfg = extra?.googleSignIn;
  if (!cfg?.webClientId) return null;
  return cfg;
}

// This stores a re-auth *intent* (what to do once the re-auth email link
// completes) — used only by changeEmail/completeReauth, the one flow that
// still uses a real email link (see getEmailLinkContinueUrl below).
const PENDING_REAUTH_KEY = 'cultuvilla.pendingReauth';
const AUTH_EMAIL_LANGUAGE = 'es';

function getLocalizedAuth(): ReturnType<typeof getAuth> {
  const auth = getAuth();
  auth.languageCode = AUTH_EMAIL_LANGUAGE;
  return auth;
}

interface PendingReauthIntent {
  purpose: 'change-email';
  newEmail: string;
}

/**
 * Thrown by `changeEmail` when Firebase requires a fresh sign-in
 * (`auth/requires-recent-login`) before it will accept the email change. The
 * caller has already been sent a re-auth email link at this point; the
 * screen should show a "check your email" state and later call
 * `completeReauth` with the link the user taps.
 */
export class ReauthRequiredError extends Error {
  constructor() {
    super('reauth-required');
    this.name = 'ReauthRequiredError';
  }
}

/**
 * Thrown by `changeEmail` when the account is not email-only (e.g. it is
 * Google-linked). Change-email would desync the account from its federated
 * identity, so it is refused at the action layer as well as hidden in the UI.
 */
export class ChangeEmailNotAllowedError extends Error {
  constructor() {
    super('change-email-not-allowed');
    this.name = 'ChangeEmailNotAllowedError';
  }
}

/** True iff every sign-in provider is email-based (password / magic-link). */
function isEmailOnlyAccount(user: User | null): boolean {
  const providers = user?.providerData ?? [];
  return (
    providers.length > 0 &&
    providers.every((p) => p.providerId === 'password' || p.providerId === 'emailLink')
  );
}

// Firebase requires the continueUrl domain to be on Auth's "Authorized
// domains" list. The auto-hosted `*.firebaseapp.com` and `*.web.app` domains
// for the project are always authorized — derive the web SPA URL from
// authDomain so we don't have to maintain another env var. Only reachable
// from changeEmail/completeReauth now — sign-in uses sendAuthOtpCode instead.
function getEmailLinkContinueUrl(): string {
  const cfg = (Constants.expoConfig?.extra as { firebaseConfig?: FirebaseOptions } | undefined)
    ?.firebaseConfig;
  const authDomain = cfg?.authDomain;
  if (!authDomain) {
    throw new Error(
      '[cultuvilla] firebaseConfig.authDomain missing — cannot build email-link continueUrl',
    );
  }
  const host = authDomain.replace(/\.firebaseapp\.com$/, '.web.app');
  return `https://${host}/finish`;
}

type Profile = (UserData & { id: string }) | null;

/**
 * Upper bound on how long sign-out waits for its best-effort cleanup.
 *
 * The push-row delete and the Google SDK sign-out have to run BEFORE the
 * Firebase sign-out (the delete needs the session's credentials), but neither
 * is allowed to hold it hostage: a Firestore delete only resolves on a backend
 * ack, so a phone whose Firestore stream has stalled would otherwise never sign
 * out at all — the button did nothing, on iOS and Android alike. A row that
 * outlives the deadline is pruned when the platform reports its token dead.
 */
export const SIGN_OUT_CLEANUP_TIMEOUT_MS = 3000;

function settleWithin(work: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    work.then(done, done);
  });
}

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  profile: Profile;
  profileLoading: boolean;
  profileChecked: boolean;
  refreshProfile: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  /** iOS only — throws on any other platform. See AppleButton, shown only on iOS. */
  signInWithApple: () => Promise<void>;
  sendOtpCode: (email: string) => Promise<void>;
  verifyOtpCode: (email: string, code: string) => Promise<void>;
  isEmailLink: (url: string) => boolean;
  changeEmail: (newEmail: string) => Promise<void>;
  completeReauth: (url: string) => Promise<void>;
  readPendingReauth: () => Promise<{ purpose: string; newEmail?: string } | null>;
  clearPendingReauth: () => Promise<void>;
  /**
   * True only when the account's identity IS its email (magic-link / password),
   * i.e. every sign-in provider is email-based. A Google-linked account's email
   * is its Google identity, so change-email is disabled for it.
   */
  canChangeEmail: boolean;
  signOut: () => Promise<void>;
  /**
   * Escape hatch out of the onboarding gate. Signs out, and when the account
   * has no profile doc yet it deletes the Auth user too — see the
   * implementation for why an abandoned sign-up must not be left behind.
   */
  abandonSignUp: () => Promise<void>;
  /** Seeded accounts the login screen offers one-tap sign-in to. Empty outside dev builds. */
  devAccounts: string[];
  signInWithDevAccount: (email: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

// Prod logs (iOS 1.4.1–1.5.0) show the cancelled Apple sheet reaching JS with
// no `code` at all, only expo-apple-authentication's RequestCanceledException
// reason, so the code check alone let every cancel through as an error.
const APPLE_CANCELLED_MESSAGE = 'The user canceled the authorization attempt';

function isAppleCancellation(err: unknown): boolean {
  const { code, message } = (err ?? {}) as { code?: unknown; message?: unknown };
  return code === 'ERR_REQUEST_CANCELED' || message === APPLE_CANCELLED_MESSAGE;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);
  const googleConfigured = useRef(false);

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (!u) setProfileChecked(true);
    });
  }, []);

  useEffect(() => {
    if (googleConfigured.current) return;
    const cfg = getGoogleSignInConfig();
    if (!cfg) return;
    GoogleSignin.configure({
      webClientId: cfg.webClientId,
      iosClientId: cfg.iosClientId || undefined,
    });
    googleConfigured.current = true;
  }, []);

  // E2E fixture-login seam. Lets an automated driver sign in as a seeded fixture
  // user without Google OAuth, delivered as a deep link because Maestro drives
  // the UI and cannot call into the app's JS context (see below).
  //
  // Guarded three independent ways so it can NEVER fire in a build a real user
  // could load:
  //   1. extra.useEmulator — the build-time USE_FIREBASE_EMULATOR flag, set only
  //      by the E2E CI jobs. app.config.ts REFUSES to build a beta/prod bundle
  //      with it set, and the deploy workflows positively assert it is unset.
  //   2. a runtime assertion, checked on EVERY sign-in attempt, that Auth is
  //      actually pointed at an emulator host (getAuth().emulatorConfig.host)
  //      — see `isE2EEmulatorHost`. Even if the flag leaked, a build talking to
  //      real Firebase signs nobody in: it fails closed by physics, not intent.
  //   3. the check:no-test-login-leak grep gate, which confines every symbol
  //      here to this file.
  // Uses the single signInWithEmailAndPassword primitive; no new auth method.
  useEffect(() => {
    if (Constants.expoConfig?.extra?.useEmulator !== true) return;

    // The emulator-host check happens at USE time, not at mount time.
    //
    // Mount time is a race: `bootstrapFirebase()` is what calls
    // connectAuthEmulator, and if this effect wins that race `emulatorConfig`
    // is still undefined — the seam would decline to arm and then never
    // reconsider, silently dropping every login for the life of that launch.
    // That is a flaky test, not a safety property. Checking here instead keeps
    // the fail-closed physics exactly as strong (a build talking to real
    // Firebase can never sign in) without depending on module ordering.
    const login = (email: string, password: string): Promise<unknown> => {
      const auth = getAuth();
      if (!isE2EEmulatorHost(auth.emulatorConfig?.host)) {
        return Promise.reject(
          new Error('[e2e-login] refused: Auth is not pointed at a local emulator'),
        );
      }
      return signInWithEmailAndPassword(auth, email, password);
    };
    const signOutFixture = (): Promise<unknown> => {
      const auth = getAuth();
      if (!isE2EEmulatorHost(auth.emulatorConfig?.host)) return Promise.resolve();
      return fbSignOut(auth);
    };

    // The driver hands us credentials over the app's own URL scheme
    // (`cultuvilla://?e2eLogin=<email>%7C<password>`), because Maestro drives
    // the UI and has no way to call into the app's JS context. The query lands
    // on the index route, which ignores unknown params, so no extra screen and
    // no new route is introduced — the app just finds itself signed in.
    // `signOut` is an empty value, keeping the surface to one link shape.
    const handle = (url: string | null) => {
      if (!url) return;
      const parsed = parseE2ELoginLink(url);
      if (!parsed) return;
      if (parsed.email === '') {
        void signOutFixture();
        return;
      }
      void login(parsed.email, parsed.password).catch((e) => {
        console.warn('[e2e-login] failed:', e instanceof Error ? e.message : e);
      });
    };
    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, []);

  const loadProfile = useCallback(async (uid: string, currentEmail: string | null) => {
    setProfileLoading(true);
    try {
      const p = await getUserProfile(uid);
      setProfile(p);
      if (p) {
        // Defer setUserContext until the hashed uid resolves — never forward
        // the raw Firebase uid to Analytics. Re-check against the live auth
        // user at apply-time so a mid-fetch sign-out / account switch can't
        // stamp a stale (or now-wrong) user's hash onto the new session.
        void fetchUserIdHash(uid).then((hash) => {
          if (hash && getAuth().currentUser?.uid === uid) {
            observability.setUserContext({ uid: hash, municipalityId: p.activeMunicipalityId ?? undefined });
          }
        });
      }
      // Resume-time sync: Firebase Auth's email can change out from under the
      // Firestore profile (e.g. verifyBeforeUpdateEmail completes server-side
      // via the link, or a Google-linked account's email changes at Google).
      // The token's email is always the source of truth; the rules permit a
      // client email patch equal to it (Task 2).
      if (p && currentEmail && p.email !== currentEmail) {
        await patchUserProfile(uid, { email: currentEmail });
      }
    } finally {
      setProfileLoading(false);
      setProfileChecked(true);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      observability.setUserContext(null);
      return;
    }
    setProfileChecked(false);
    setProfileLoading(true);
    loadProfile(user.uid, user.email);
  }, [user, loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.uid, user.email);
  }, [user, loadProfile]);

  // Once the profile is loaded, if the user has no active village, pick their
  // first membership so the header reflects a real village instead of the
  // generic "Cultuvilla" fallback. Runs once per session per user.
  const activeSyncRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !profile) return;
    if (profile.activeMunicipalityId) return;
    if (activeSyncRef.current === user.uid) return;
    activeSyncRef.current = user.uid;
    void (async () => {
      const memberships = await getUserMemberships(user.uid);
      const first = memberships[0];
      if (!first) return;
      await setActiveMunicipality(user.uid, first.municipalityId);
      await loadProfile(user.uid, user.email);
    })();
  }, [user, profile, loadProfile]);

  const signInWithGoogle = async (): Promise<void> => {
    const cfg = getGoogleSignInConfig();
    if (!cfg) {
      throw new Error(
        'Google sign-in is not configured — set GOOGLE_WEB_CLIENT_ID_* in apps/mobile/.env',
      );
    }
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }
    try {
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) {
        throw new Error('Google sign-in was cancelled');
      }
      const idToken = response.data.idToken;
      if (!idToken) {
        throw new Error('Google sign-in did not return an idToken');
      }
      const credential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(getAuth(), credential);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === statusCodes.SIGN_IN_CANCELLED || code === statusCodes.IN_PROGRESS) {
        throw new Error('Google sign-in was cancelled');
      }
      if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play Services are not available on this device');
      }
      throw err;
    }
  };

  const signInWithApple = async (): Promise<void> => {
    if (Platform.OS !== 'ios') {
      throw new Error('Sign in with Apple is only available on iOS');
    }
    // Apple requires a SHA-256-hashed nonce in the request and returns the
    // identityToken bound to it; Firebase re-derives the hash from the raw
    // nonce we pass alongside the token, so both forms are needed here.
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    let credential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
    } catch (err) {
      if (isAppleCancellation(err)) {
        // Carries a code so reportAuthError can tell "changed their mind"
        // apart from "the native flow broke" — the message alone cannot.
        const cancelled = new Error('Apple sign-in was cancelled') as Error & { code?: string };
        cancelled.code = 'auth/cancelled';
        throw cancelled;
      }
      throw err;
    }
    if (!credential.identityToken) {
      throw new Error('Apple sign-in did not return an identityToken');
    }
    const provider = new OAuthProvider('apple.com');
    const oauthCredential = provider.credential({
      idToken: credential.identityToken,
      rawNonce,
    });
    await signInWithCredential(getAuth(), oauthCredential);
  };

  const sendOtpCode = async (email: string): Promise<void> => {
    const trimmed = email.trim();
    if (!trimmed) throw new Error('email-required');
    await sendAuthOtpCode(trimmed);
  };

  const verifyOtpCode = async (email: string, code: string): Promise<void> => {
    const trimmed = email.trim();
    if (!trimmed) throw new Error('email-required');
    // A token left over from a sign-in that died mid-flight is reused instead of
    // spending another OTP — see otpTokenCache for why the code is already gone.
    const token = getPendingToken(trimmed) ?? (await verifyAuthOtpCode(trimmed, code));
    rememberPendingToken(trimmed, token);
    try {
      await signInWithCustomToken(getAuth(), token);
    } catch (err) {
      if (!shouldRetainToken(err)) clearPendingToken();
      throw err;
    }
    clearPendingToken();
  };

  // Still used by finish.tsx to distinguish a genuine reauth email link from
  // an unrelated deep link — reauth is the only flow left that sends links.
  const isEmailLink = (url: string): boolean => isSignInWithEmailLink(getAuth(), url);

  const changeEmail = async (newEmail: string): Promise<void> => {
    const auth = getLocalizedAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('not-signed-in');
    // Defense in depth: the UI hides change-email for non-email-only accounts,
    // but the screen route is directly reachable on web — refuse here too.
    if (!isEmailOnlyAccount(currentUser)) throw new ChangeEmailNotAllowedError();
    const trimmed = newEmail.trim();
    if (!trimmed) throw new Error('email-required');
    try {
      await verifyBeforeUpdateEmail(currentUser, trimmed);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code !== 'auth/requires-recent-login') throw err;
      const currentEmail = currentUser.email;
      if (!currentEmail) throw err;
      const intent: PendingReauthIntent = { purpose: 'change-email', newEmail: trimmed };
      await AsyncStorage.setItem(PENDING_REAUTH_KEY, JSON.stringify(intent));
      await sendAuthSignInEmail(currentEmail, getEmailLinkContinueUrl());
      throw new ReauthRequiredError();
    }
  };

  const completeReauth = async (url: string): Promise<void> => {
    const auth = getLocalizedAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      // The session lapsed between changeEmail() sending the re-auth link and
      // the user tapping it. Clear the stale intent so it can't wedge every
      // future email-link sign-in — see finish.tsx, which checks
      // readPendingReauth() before the normal sign-in path.
      await AsyncStorage.removeItem(PENDING_REAUTH_KEY);
      throw new Error('not-signed-in');
    }
    if (!isSignInWithEmailLink(auth, url)) throw new Error('not-an-email-link');
    const currentEmail = currentUser.email;
    if (!currentEmail) throw new Error('email-required');
    const credential = EmailAuthProvider.credentialWithLink(currentEmail, url);
    await reauthenticateWithCredential(currentUser, credential);
    const stored = await AsyncStorage.getItem(PENDING_REAUTH_KEY);
    if (stored) {
      const intent = JSON.parse(stored) as Partial<PendingReauthIntent>;
      if (intent.purpose === 'change-email' && intent.newEmail) {
        await verifyBeforeUpdateEmail(currentUser, intent.newEmail);
      }
      await AsyncStorage.removeItem(PENDING_REAUTH_KEY);
    }
  };

  const readPendingReauth = async (): Promise<{ purpose: string; newEmail?: string } | null> => {
    const stored = await AsyncStorage.getItem(PENDING_REAUTH_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as { purpose: string; newEmail?: string };
  };

  const clearPendingReauth = async (): Promise<void> => {
    await AsyncStorage.removeItem(PENDING_REAUTH_KEY);
  };

  // Change-email is only meaningful when the account's identity IS its email
  // (magic-link / password). If ANY federated provider (e.g. google.com) is
  // attached, the email is that identity's — changing it here would desync it —
  // so change-email is disabled unless every provider is email-based.
  const canChangeEmail = isEmailOnlyAccount(user);

  const teardownSession = async (): Promise<void> => {
    // This device's push row first, while the user can still delete it — the
    // rules are owner-only, and a shared phone must stop receiving the previous
    // account's pushes the moment it signs out.
    await settleWithin(unregisterPushForSignOut(), SIGN_OUT_CLEANUP_TIMEOUT_MS);
    // Tear down every registered Firestore listener BEFORE auth flips closed,
    // so no listener fires a final permission-denied snapshot at the moment
    // the rules flip. See packages/shared/src/services/listenerManager.ts.
    await listenerManager.clearAll();
    if (googleConfigured.current) {
      // Rejections are ignored — the user may not have signed in with Google
      // this session — and a native call that never answers is bounded too.
      await settleWithin(GoogleSignin.signOut(), SIGN_OUT_CLEANUP_TIMEOUT_MS);
    }
    await clearPendingIntent();
    // Never let a half-spent sign-in credential outlive the session it belongs to.
    clearPendingToken();
    await AsyncStorage.removeItem(PENDING_REAUTH_KEY);
  };

  const devLogin = getDevLogin();
  const devAccounts = devLogin?.emails ?? [];

  const signInWithDevAccount = async (email: string): Promise<void> => {
    if (!devLogin || !devLogin.emails.includes(email)) {
      throw new Error(`[dev-login] ${email} is not a configured dev account`);
    }
    await signInWithEmailAndPassword(getAuth(), email, devLogin.password);
  };

  const signOut = async (): Promise<void> => {
    await teardownSession();
    await fbSignOut(getAuth());
    await clearLocalCacheAndRestart();
  };

  // Signing in with the wrong address used to be a one-way door: AuthGate
  // redirects a user with no personId to /(onboarding)/completar-perfil and
  // nowhere else, so settings (the only sign-out) was unreachable and the sole
  // way forward was creating the very account you didn't want. This is the
  // reverse gear for that screen.
  //
  // verifyAuthOtpCode creates the Auth user on first verify, so an account with
  // no profile doc was created by this very sign-in and nobody else owns that
  // address yet — delete it rather than leave a squatter that would keep
  // intercepting the real owner's codes. The custom-token credential is
  // seconds old, so delete() won't demand a re-auth; if it does anyway, a plain
  // sign-out still gets the user unstuck, which is the point of the button.
  const abandonSignUp = async (): Promise<void> => {
    const currentUser = getAuth().currentUser;
    // profileChecked guards against a mid-load `profile === null` reading as
    // "brand new account" and deleting a real one.
    const disposable = currentUser !== null && profileChecked && profile === null;
    await teardownSession();
    if (disposable && currentUser) {
      try {
        await currentUser.delete();
        return;
      } catch {
        // Fall through to a plain sign-out.
      }
    }
    await fbSignOut(getAuth());
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        profile,
        profileLoading,
        profileChecked,
        refreshProfile,
        signInWithGoogle,
        signInWithApple,
        sendOtpCode,
        verifyOtpCode,
        isEmailLink,
        changeEmail,
        completeReauth,
        readPendingReauth,
        clearPendingReauth,
        canChangeEmail,
        signOut,
        abandonSignUp,
        devAccounts,
        signInWithDevAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

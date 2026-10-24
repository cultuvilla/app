import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getAuth } from '@cultuvilla/shared/firebase';
import {
  browserSessionPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithCustomToken,
  signOut,
  type User,
} from '@cultuvilla/shared/firebase/sdk/auth';

interface StudioAuthValue {
  user: User | null;
  /** False until Firebase has said whether this tab already has a session. */
  ready: boolean;
  signInWithPairingToken: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<StudioAuthValue | null>(null);

/**
 * The studio's auth boundary, its counterpart of the app's AuthContext: the
 * one place it touches Firebase Auth. There is no sign-up and no password —
 * a session comes only from pairing with the app (SignInScreen).
 *
 * The session lives in this tab only (session persistence): the studio is
 * often opened on a shared computer, and closing the tab must sign out.
 */
export function StudioAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void setPersistence(auth, browserSessionPersistence).finally(() => {
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(auth, (next) => {
        setUser(next);
        setReady(true);
      });
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const value = useMemo<StudioAuthValue>(
    () => ({
      user,
      ready,
      signInWithPairingToken: async (token) => {
        await signInWithCustomToken(getAuth(), token);
      },
      signOut: () => signOut(getAuth()),
    }),
    [user, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useStudioAuth(): StudioAuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useStudioAuth must be used within StudioAuthProvider');
  return value;
}

/** The signed-in user, for screens only reachable with a session. */
export function useSignedInUser(): User {
  const { user } = useStudioAuth();
  if (!user) throw new Error('useSignedInUser: no session');
  return user;
}

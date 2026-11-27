// Auth-context helpers for emulator-backed Firestore tests. Name the actor at
// the call site (`asUser(env, 'alice')`, `asAdmin(env, 'sadmin')`) instead of
// spelling out `env.authenticatedContext(uid).firestore()` and hand-seeding the
// `admins/` doc in every file.
import { doc, setDoc, type Firestore } from 'firebase/firestore';
import type {
  RulesTestContext,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

/**
 * The modular Firestore client of a rules-test context. rules-unit-testing
 * types its contexts with the compat SDK, while the services and tests call the
 * modular functions, which accept that same instance at runtime — the one place
 * the two type worlds meet, so the bridging cast lives here and nowhere else.
 */
export function firestoreOf(ctx: RulesTestContext): Firestore {
  return ctx.firestore() as unknown as Firestore;
}

/** Firestore client scoped to an authenticated user `uid`. */
export function asUser(env: RulesTestEnvironment, uid: string): Firestore {
  return firestoreOf(env.authenticatedContext(uid));
}

/**
 * Firestore client scoped to an authenticated user `uid` whose auth token
 * carries `email` as a verified claim (`request.auth.token.email` in rules) —
 * mirrors the real Firebase Auth ID token shape for testing rules that pin a
 * write to the caller's own verified email.
 */
export function asUserWithEmail(
  env: RulesTestEnvironment,
  uid: string,
  email: string,
): Firestore {
  return firestoreOf(env.authenticatedContext(uid, { email }));
}

/** Firestore client with no auth (signed-out / anonymous request). */
export function asAnon(env: RulesTestEnvironment): Firestore {
  return firestoreOf(env.unauthenticatedContext());
}

/**
 * Run a seeding block with security rules disabled — the sanctioned way to set
 * up state a rule would otherwise forbid (create a doc that only a Cloud
 * Function may write, etc.).
 */
export function seed(
  env: RulesTestEnvironment,
  fn: (ctx: RulesTestContext) => Promise<void>,
): Promise<void> {
  return env.withSecurityRulesDisabled(fn);
}

/** Seed the app-admin marker doc (`admins/{uid}`) that the rules check. */
export function seedAdmin(env: RulesTestEnvironment, uid: string): Promise<void> {
  return seed(env, async (ctx) => {
    await setDoc(doc(firestoreOf(ctx), `admins/${uid}`), {
      createdAt: new Date(),
    });
  });
}

/** Seed the `admins/{uid}` marker, then return that user's Firestore client. */
export async function asAdmin(env: RulesTestEnvironment, uid: string): Promise<Firestore> {
  await seedAdmin(env, uid);
  return asUser(env, uid);
}

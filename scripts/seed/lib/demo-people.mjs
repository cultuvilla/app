/**
 * Demo people shared by the dev seeders (cosateca-demo, group-demo): Auth
 * users at `cosateca-demo-N@example.com` with no password, so nobody signs in
 * as them, and a `users` doc so the app shows their name.
 */
import { buildUserData } from '@cultuvilla/shared/models';
import { auth, db } from './context.mjs';

export const DEMO_PEOPLE = ['Lucía Martín', 'Paco Herrero', 'Marisa Gómez', 'Toni Sanz', 'Rocío Llorente', 'Andrés Pastor'];
export const demoEmail = (i) => `cosateca-demo-${i + 1}@example.com`;

/** The uid of demo person `i`, creating them on first use. */
export async function ensureDemoPerson(i, seedBatch) {
  const email = demoEmail(i);
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    user = await auth.createUser({ email, displayName: DEMO_PEOPLE[i], emailVerified: true });
  }
  await db.doc(`users/${user.uid}`).set({ ...buildUserData({ displayName: DEMO_PEOPLE[i], email }), seedBatch }, { merge: true });
  return user.uid;
}

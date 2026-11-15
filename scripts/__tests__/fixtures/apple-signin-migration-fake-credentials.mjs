// Stands in for scripts/lib/env-credentials.mjs under the CLI tests; see
// apple-signin-migration-fake-firebase.mjs.
import fs from 'node:fs';

const statePath = process.env.FAKE_AUTH_STATE;
const load = () => JSON.parse(fs.readFileSync(statePath, 'utf8'));
const save = (state) => fs.writeFileSync(statePath, JSON.stringify(state));
const notFound = () => Object.assign(new Error('not found'), { code: 'auth/user-not-found' });

const auth = {
  async getUser(uid) {
    const user = load().users.find((u) => u.uid === uid);
    if (!user) throw notFound();
    return user;
  },
  async getUserByProviderUid(providerId, uid) {
    const user = load().users.find((u) => u.providerData.some((p) => p.providerId === providerId && p.uid === uid));
    if (!user) throw notFound();
    return user;
  },
  async updateUser(uid, update) {
    const state = load();
    state.writes += 1;
    const user = state.users.find((u) => u.uid === uid);
    if (update.providersToUnlink) user.providerData = user.providerData.filter((p) => !update.providersToUnlink.includes(p.providerId));
    if (update.providerToLink) user.providerData.push(update.providerToLink);
    if (update.email) user.email = update.email;
    save(state);
  },
};

export const ENVS = { dev: { project: 'fake-project' } };
export const resolveEnv = (env) => env;
export const initAdminForEnv = () => ({ app: { auth: () => auth }, projectId: 'fake-project' });

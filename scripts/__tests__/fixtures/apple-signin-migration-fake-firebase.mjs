// Preloaded with `node --import` by apple-signin-migration.test.mjs to run the
// real CLI with no network: the CLI's credential helper resolves to
// apple-signin-migration-fake-credentials.mjs, an in-memory Auth read from (and
// written back to) $FAKE_AUTH_STATE.
import { register } from 'node:module';

const fake = new URL('./apple-signin-migration-fake-credentials.mjs', import.meta.url).href;
const hooks = `
export async function resolve(specifier, context, next) {
  if (specifier === './lib/env-credentials.mjs') return { url: ${JSON.stringify(fake)}, shortCircuit: true };
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

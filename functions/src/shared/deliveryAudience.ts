/**
 * Who a mail or a push may reach in this project. Production reaches anyone;
 * every other project — dev, beta, the emulator, an unrecognised id — reaches
 * only people with an account in its own Auth. Read
 * docs/decisions/non-production-never-reaches-real-people.md.
 *
 * Fail-closed: only the production id opens it, and outside production an Auth
 * lookup that fails withholds the send instead of letting it through.
 */
import { getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions/v2';

export const PRODUCTION_PROJECT_ID = 'cultuvilla-prod';

/** Auth's `getUsers` takes at most 100 identifiers per call. */
const LOOKUP_LIMIT = 100;

/** The Admin SDK's own project first, then what the runtime sets. */
export function currentProjectId(): string | undefined {
  const fromApp = getApps()[0]?.options.projectId;
  return (
    fromApp ??
    process.env['GCLOUD_PROJECT'] ??
    process.env['GOOGLE_CLOUD_PROJECT'] ??
    process.env['GCP_PROJECT'] ??
    undefined
  );
}

export function isProductionProject(): boolean {
  return currentProjectId() === PRODUCTION_PROJECT_ID;
}

export interface WithheldLog {
  handler: string;
  channel: 'email' | 'push';
  /** Extra structured fields (ids, kinds — never an address). */
  fields?: Record<string, unknown>;
}

function logWithheld(log: WithheldLog, extra: Record<string, unknown>): void {
  logger.info('Delivery withheld outside production', {
    handler: log.handler,
    channel: log.channel,
    projectId: currentProjectId() ?? null,
    ...log.fields,
    ...extra,
  });
}

function lowerEmail(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * The addresses of `addresses` that may be mailed here, compared
 * case-insensitively. Logs one line when any are withheld.
 */
export async function allowedEmailAddresses(addresses: string[], log: WithheldLog): Promise<Set<string>> {
  if (isProductionProject()) return new Set(addresses);
  const unique = [...new Set(addresses.map(lowerEmail))];
  const known = new Set<string>();
  try {
    for (let i = 0; i < unique.length; i += LOOKUP_LIMIT) {
      const chunk = unique.slice(i, i + LOOKUP_LIMIT);
      const { users } = await getAuth().getUsers(chunk.map((email) => ({ email })));
      for (const user of users) if (user.email) known.add(lowerEmail(user.email));
    }
  } catch (err) {
    logWithheld(log, {
      count: addresses.length,
      reason: 'auth-lookup-failed',
      error: err instanceof Error ? err.message : String(err),
    });
    return new Set();
  }
  const allowed = new Set(addresses.filter((a) => known.has(lowerEmail(a))));
  const withheld = addresses.filter((a) => !known.has(lowerEmail(a))).length;
  if (withheld > 0) logWithheld(log, { count: withheld, reason: 'no-auth-account' });
  return allowed;
}

/** Whether `uid`'s devices may be pushed here. Logs when it is withheld. */
export async function mayPushToUser(uid: string, log: WithheldLog): Promise<boolean> {
  if (isProductionProject()) return true;
  try {
    const { users } = await getAuth().getUsers([{ uid }]);
    if (users.length > 0) return true;
    logWithheld(log, { userId: uid, reason: 'no-auth-account' });
  } catch (err) {
    logWithheld(log, {
      userId: uid,
      reason: 'auth-lookup-failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return false;
}

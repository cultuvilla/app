/**
 * Snapshot and restore the Firestore and Auth emulators' data while they run.
 *
 * The native suites retry a failed flow. A flow may depend on the seed and on the
 * earlier flows of its group, so a retry must start where the failed attempt
 * started — not from the bare seed, and not from what the failed attempt left
 * behind. Run on the failed attempt's data, a retry can only pass by accident: a
 * cuota retry opened on the part payment its first attempt had already recorded
 * (ios-e2e 44764961074, flow 13). So the suite snapshots before a flow's first
 * attempt and restores that snapshot before each retry.
 *
 * The emulators import data only at start-up (`--import`), so the restore goes
 * through their REST APIs, the same ones `emulators:export` reads:
 *   - Firestore: one kindless query lists every document; the restore clears
 *     the database and writes them back in batches. Values round-trip exactly,
 *     timestamps included.
 *   - Auth: `accounts:batchGet` / `accounts:batchCreate`, as the emulator's own
 *     export and import do (passwords come back as the emulator's fake hash).
 * Background triggers are paused through the hub while the restore writes, or
 * every restored document would fire its onCreate again.
 *
 * Storage is not restored: flows upload under fresh object names, so a leftover
 * file is never read by a retry.
 */

const OWNER = { Authorization: 'Bearer owner' };
const BATCH_WRITE_MAX = 500;

/** Where the emulators listen, from the env scripts/run-tests-with-emulators.mjs sets. */
export function emulatorTargets(env = process.env) {
  const firestore = env.FIRESTORE_EMULATOR_HOST;
  const auth = env.FIREBASE_AUTH_EMULATOR_HOST;
  const hub = env.FIREBASE_EMULATOR_HUB;
  const project = env.E2E_FIREBASE_PROJECT || env.GCLOUD_PROJECT || 'cultuvilla-test';
  if (!firestore || !auth || !hub) return null;
  return { firestore, auth, hub, project };
}

async function call(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { ...OWNER, 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok)
    throw new Error(`${init.method ?? 'GET'} ${url}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

const documentsRoot = ({ firestore, project }) =>
  `http://${firestore}/v1/projects/${project}/databases/(default)/documents`;

async function listDocuments(t) {
  const rows = await call(`${documentsRoot(t)}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: { from: [{ allDescendants: true }] },
    }),
  });
  return rows
    .filter((r) => r.document)
    .map(({ document }) => ({
      name: document.name,
      fields: document.fields ?? {},
    }));
}

async function listAccounts({ auth, project }) {
  const res = await call(
    `http://${auth}/identitytoolkit.googleapis.com/v1/projects/${project}/accounts:batchGet?maxResults=-1`,
  );
  return res.users ?? [];
}

/** Everything a retry needs to start where the first attempt did. */
export async function takeSnapshot(t) {
  const [documents, accounts] = await Promise.all([listDocuments(t), listAccounts(t)]);
  return { documents, accounts };
}

async function setBackgroundTriggers(t, enabled) {
  await call(`http://${t.hub}/functions/${enabled ? 'enable' : 'disable'}BackgroundTriggers`, { method: 'PUT' });
}

/** Puts both emulators back to `snapshot`, exactly. */
export async function restoreSnapshot(t, snapshot) {
  await setBackgroundTriggers(t, false);
  try {
    await call(`http://${t.firestore}/emulator/v1/projects/${t.project}/databases/(default)/documents`, {
      method: 'DELETE',
    });
    for (let i = 0; i < snapshot.documents.length; i += BATCH_WRITE_MAX) {
      const writes = snapshot.documents.slice(i, i + BATCH_WRITE_MAX).map((update) => ({ update }));
      await call(`${documentsRoot(t)}:batchWrite`, {
        method: 'POST',
        body: JSON.stringify({ writes }),
      });
    }
    await call(`http://${t.auth}/emulator/v1/projects/${t.project}/accounts`, {
      method: 'DELETE',
    });
    if (snapshot.accounts.length) {
      await call(`http://${t.auth}/identitytoolkit.googleapis.com/v1/projects/${t.project}/accounts:batchCreate`, {
        method: 'POST',
        body: JSON.stringify({ users: snapshot.accounts }),
      });
    }
  } finally {
    await setBackgroundTriggers(t, true);
  }
}

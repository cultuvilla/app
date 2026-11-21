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
 * Both the clear and the write-back are checked by reading the database again,
 * because the emulator can answer either one with HTTP 499 and still have done
 * some or all of the work.
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

/**
 * How many times the clear, and each batch of the write-back, is sent. The
 * emulator keeps a listen stream registered after the app has cancelled it, and
 * the first write that has to tell that stream something throws, so the write
 * answers HTTP 499 "call already cancelled". Each such failure gets a later
 * attempt further, but a long suite piles up dead streams: in ios-e2e
 * 44889372664 one restore went through after three 499s and a later one was
 * still failing after four.
 */
const ATTEMPTS = 10;

/**
 * Empties the Firestore emulator. A 499 does not say whether the database was
 * cleared (ios-e2e 44804913687), so the clear is judged by reading the
 * database back, not by the status.
 */
async function clearDocuments(t, stats) {
  let lastError = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    stats.clears++;
    try {
      await call(`http://${t.firestore}/emulator/v1/projects/${t.project}/databases/(default)/documents`, {
        method: 'DELETE',
      });
    } catch (error) {
      lastError = error;
      countCancelled(stats, error);
    }
    const left = (await listDocuments(t)).length;
    if (left === 0) return;
    lastError = new Error(`Firestore emulator still holds ${left} documents after clearing`, { cause: lastError });
  }
  throw lastError;
}

/**
 * Writes the snapshot's documents back. A batchWrite that answers 499 has
 * applied some, all or none of its writes (ios-e2e 44826311824). Each write
 * replaces a whole document, so a batch is safe to send again. As with the
 * clear, the database is read back to judge the result.
 */
async function writeDocuments(t, documents, stats) {
  let lastError = null;
  for (let i = 0; i < documents.length; i += BATCH_WRITE_MAX) {
    const writes = documents.slice(i, i + BATCH_WRITE_MAX).map((update) => ({ update }));
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      stats.writes++;
      try {
        await call(`${documentsRoot(t)}:batchWrite`, {
          method: 'POST',
          body: JSON.stringify({ writes }),
        });
        break;
      } catch (error) {
        lastError = error;
        countCancelled(stats, error);
      }
      const held = new Set((await listDocuments(t)).map((d) => d.name));
      if (writes.every(({ update }) => held.has(update.name))) break;
    }
  }
  const held = new Set((await listDocuments(t)).map((d) => d.name));
  const missing = documents.filter((d) => !held.has(d.name)).length;
  if (missing > 0 || held.size !== documents.length) {
    throw new Error(
      `Firestore emulator holds ${held.size} documents after restoring ${documents.length} (${missing} missing)`,
      { cause: lastError },
    );
  }
}

function countCancelled(stats, error) {
  if (/HTTP 499/.test(String(error?.message))) stats.cancelled++;
}

/**
 * Puts both emulators back to `snapshot`, exactly. `stats` counts the clears
 * and batchWrites it sent and how many answered 499, filled in even when the
 * restore throws, so a suite can show whether dead listen streams pile up.
 */
export async function restoreSnapshot(t, snapshot, stats = { clears: 0, writes: 0, cancelled: 0 }) {
  await setBackgroundTriggers(t, false);
  try {
    await clearDocuments(t, stats);
    await writeDocuments(t, snapshot.documents, stats);
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

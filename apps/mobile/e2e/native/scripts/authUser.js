// Maestro runScript — whether the Auth emulator still has an account, polled
// until it matches EXPECT. A deleted account must be gone from Auth too, not
// only from Firestore: an orphaned Auth user could still sign in.
//
// Host-side, with the emulator's `Bearer owner` admin token, like docField.js.
//
// env:
//   UID         required — the account's uid
//   EXPECT      required — "present" | "absent"
//   TIMEOUT_MS  optional — default 20000
// output:
//   output.ok "true" | "false"
var HOST = typeof AUTH_EMULATOR_REST_HOST !== 'undefined' && AUTH_EMULATOR_REST_HOST ? AUTH_EMULATOR_REST_HOST : '127.0.0.1:9099';
var PROJECT = typeof E2E_FIREBASE_PROJECT !== 'undefined' && E2E_FIREBASE_PROJECT ? E2E_FIREBASE_PROJECT : 'cultuvilla-test';
var URL = 'http://' + HOST + '/identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:lookup';
var timeout = Number(typeof TIMEOUT_MS !== 'undefined' && TIMEOUT_MS ? TIMEOUT_MS : 20000);
var deadline = Date.now() + timeout;

function exists() {
  var res = http.post(URL, {
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: [UID] }),
  });
  if (res.status !== 200) throw new Error('auth lookup failed: HTTP ' + res.status + ' ' + res.body);
  var users = json(res.body).users || [];
  return users.length > 0;
}

var PAUSE_URL =
  typeof POLL_PAUSE_URL !== 'undefined' && POLL_PAUSE_URL ? POLL_PAUSE_URL : 'http://127.0.0.1:9399/pause?ms=250';
function pause() {
  try {
    http.get(PAUSE_URL);
  } catch (e) {
    // No pause server: carry on unthrottled.
  }
}

var ok = false;
while (true) {
  ok = (EXPECT === 'present') === exists();
  if (ok || Date.now() > deadline) break;
  pause();
}
output.ok = String(ok);

// Maestro runScript — set ONE string field on a Firestore-emulator document,
// leaving the rest of the doc as it is.
//
// Lets a flow change backend state behind the app's back — e.g. while the
// device is offline, to tell a cached read from a server one. Runs on the
// HOST, like docField.js, with the emulator's `Bearer owner` rules bypass.
//
// env:
//   DOC_PATH  required — path under /documents, e.g. "events/e2e-event-fiesta"
//   FIELD     required — top-level field name
//   VALUE     required — the string to write
// output:
//   output.status  the HTTP status of the write

var HOST = typeof EMULATOR_REST_HOST !== 'undefined' && EMULATOR_REST_HOST ? EMULATOR_REST_HOST : '127.0.0.1:8080';
var PROJECT = typeof E2E_FIREBASE_PROJECT !== 'undefined' && E2E_FIREBASE_PROJECT ? E2E_FIREBASE_PROJECT : 'cultuvilla-test';
var BASE = 'http://' + HOST + '/v1/projects/' + PROJECT + '/databases/(default)/documents';

var fields = {};
fields[FIELD] = { stringValue: VALUE };
var res = http.request(BASE + '/' + DOC_PATH + '?updateMask.fieldPaths=' + encodeURIComponent(FIELD), {
  method: 'PATCH',
  headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: fields }),
});
output.status = String(res.status);

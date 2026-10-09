// Maestro runScript — delete every Firestore-emulator document in a collection
// whose FIELD equals VALUE.
//
// For a flow that looks an entity up by a fixed field value afterwards: a
// leftover from an earlier, interrupted run would otherwise be the doc it
// finds and asserts on, a false green. Clearing first makes "exactly one
// match" the check. Host-side with the `Bearer owner` bypass, like docField.js.
//
// env:
//   COLLECTION_PATH required — e.g. "events"
//   FIELD, VALUE    required — delete docs whose FIELD equals VALUE
// output:
//   output.deleted "<n>"
var HOST = typeof EMULATOR_REST_HOST !== 'undefined' && EMULATOR_REST_HOST ? EMULATOR_REST_HOST : '127.0.0.1:8080';
var PROJECT = typeof E2E_FIREBASE_PROJECT !== 'undefined' && E2E_FIREBASE_PROJECT ? E2E_FIREBASE_PROJECT : 'cultuvilla-test';
var BASE = 'http://' + HOST + '/v1/projects/' + PROJECT + '/databases/(default)/documents';
var HEADERS = { Authorization: 'Bearer owner' };

var deleted = 0;
var res = http.get(BASE + '/' + COLLECTION_PATH + '?pageSize=300', { headers: HEADERS });
if (res.status !== 200) throw new Error('listing ' + COLLECTION_PATH + ' failed: HTTP ' + res.status);
var docs = json(res.body).documents || [];
for (var i = 0; i < docs.length; i++) {
  var v = docs[i].fields ? docs[i].fields[FIELD] : undefined;
  if (!v || v.stringValue !== VALUE) continue;
  // `name` is the full resource path; the REST DELETE takes it after /v1/.
  var del = http.request('http://' + HOST + '/v1/' + docs[i].name, { method: 'DELETE', headers: HEADERS });
  if (del.status !== 200) throw new Error('deleting ' + docs[i].name + ' failed: HTTP ' + del.status);
  deleted++;
}
output.deleted = String(deleted);

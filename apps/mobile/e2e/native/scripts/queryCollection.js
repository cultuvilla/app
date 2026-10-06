// Maestro runScript — list a Firestore-emulator collection and poll until the
// number of docs matching an optional field filter satisfies MIN/MAX.
//
// Companion to docField.js for the cases where the doc id is server-generated
// (registrations, comments, membershipEvents) and can only be found by field.
// Same rules-bypass and same host caveat — see docField.js.
//
// env:
//   COLLECTION_PATH required — e.g. "events/e2e-event-fiesta/registrations"
//   FIELD, VALUE    optional — keep only docs whose FIELD equals VALUE
//   FIELD2, VALUE2  optional — and whose FIELD2 equals VALUE2
//                   A VALUE / VALUE2 of "null" matches a null or missing
//                   field (Maestro passes no empty-string env value through).
//   MIN             optional — minimum matching docs (default 1)
//   MAX             optional — maximum matching docs (default unbounded)
//   TIMEOUT_MS      optional — default 20000
// output:
//   output.count "<n>"   matching docs
//   output.id    the first matching doc's id ("" when none) — how a flow learns
//                a server-generated id it must navigate to next
//   output.ok    "true" | "false"

var HOST = typeof EMULATOR_REST_HOST !== 'undefined' && EMULATOR_REST_HOST ? EMULATOR_REST_HOST : '127.0.0.1:8080';
var PROJECT = typeof E2E_FIREBASE_PROJECT !== 'undefined' && E2E_FIREBASE_PROJECT ? E2E_FIREBASE_PROJECT : 'cultuvilla-test';
var BASE = 'http://' + HOST + '/v1/projects/' + PROJECT + '/databases/(default)/documents';
var HEADERS = { Authorization: 'Bearer owner' };

function scalar(v) {
  if (v === null || v === undefined) return null;
  if (v.stringValue !== undefined) return String(v.stringValue);
  if (v.integerValue !== undefined) return String(v.integerValue);
  if (v.booleanValue !== undefined) return String(v.booleanValue);
  return null;
}

var min = Number(typeof MIN !== 'undefined' && MIN !== '' ? MIN : 1);
var max = typeof MAX !== 'undefined' && MAX !== '' ? Number(MAX) : Infinity;
var timeoutMs = Number(typeof TIMEOUT_MS !== 'undefined' && TIMEOUT_MS ? TIMEOUT_MS : 20000);
var deadline = Date.now() + timeoutMs;
var count = 0;
var firstId = '';

function fieldIs(doc, field, expected) {
  var v = doc.fields ? doc.fields[field] : undefined;
  if (expected === 'null') return v === undefined || v.nullValue !== undefined;
  return scalar(v) === expected;
}

function keep(doc) {
  if (typeof FIELD !== 'undefined' && FIELD && !fieldIs(doc, FIELD, VALUE)) return false;
  if (typeof FIELD2 !== 'undefined' && FIELD2 && !fieldIs(doc, FIELD2, VALUE2)) return false;
  return true;
}

while (true) {
  count = 0;
  firstId = '';
  var res = http.get(BASE + '/' + COLLECTION_PATH + '?pageSize=300', { headers: HEADERS });
  if (res.status === 200) {
    var docs = json(res.body).documents || [];
    for (var i = 0; i < docs.length; i++) {
      if (!keep(docs[i])) continue;
      if (count === 0) firstId = docs[i].name.split('/').pop();
      count++;
    }
  }
  if (count >= min && count <= max) break;
  if (Date.now() >= deadline) break;
}

output.count = String(count);
output.id = firstId;
output.ok = count >= min && count <= max ? 'true' : 'false';

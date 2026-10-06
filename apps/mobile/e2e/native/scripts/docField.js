// Maestro runScript — read ONE Firestore-emulator document and poll a field
// until it matches, then publish the result to `output`.
//
// The suite's "assert on backend state, not on the screen" discipline,
// expressed in Maestro's JS runtime.
//
// Runs on the HOST (the Maestro CLI machine), not on the device — so the
// emulator is at 127.0.0.1 here even though the app inside the AVD reaches it
// via 10.0.2.2.
//
// env:
//   DOC_PATH   required — path under /documents, e.g. "events/e2e-event-fiesta"
//   FIELD      optional — field to read (scalar); dotted for maps, `*` = first key
//   EXPECT     optional — "present" | "absent" | "<literal>" | ">=<n>"
//   TIMEOUT_MS optional — default 20000
// output:
//   output.exists  "true" | "false"
//   output.value   the scalar as a string ("" when absent)
//   output.ok      "true" | "false" — whether EXPECT was met

var HOST = typeof EMULATOR_REST_HOST !== 'undefined' && EMULATOR_REST_HOST ? EMULATOR_REST_HOST : '127.0.0.1:8080';
var PROJECT = typeof E2E_FIREBASE_PROJECT !== 'undefined' && E2E_FIREBASE_PROJECT ? E2E_FIREBASE_PROJECT : 'cultuvilla-test';
var BASE = 'http://' + HOST + '/v1/projects/' + PROJECT + '/databases/(default)/documents';

// `Bearer owner` is the emulator's rules-bypass token. Without it a read of a
// rule-protected doc (members, registrations, …) comes back empty and the
// assertion fails silently against a backend that is actually correct.
var HEADERS = { Authorization: 'Bearer owner' };

function scalar(v) {
  if (v === null || v === undefined) return null;
  if (v.stringValue !== undefined) return String(v.stringValue);
  if (v.integerValue !== undefined) return String(v.integerValue);
  if (v.doubleValue !== undefined) return String(v.doubleValue);
  if (v.booleanValue !== undefined) return String(v.booleanValue);
  if (v.nullValue !== undefined) return '';
  if (v.timestampValue !== undefined) return String(v.timestampValue);
  return null;
}

// A dotted FIELD walks into map fields; a `*` segment takes the map's first
// key, for maps keyed by generated ids (registration answers are keyed by a
// random signup-field id the flow cannot know).
function walk(fields, path) {
  var v = fields[path[0]];
  for (var i = 1; i < path.length; i++) {
    var inner = v && v.mapValue && v.mapValue.fields;
    if (!inner) return null;
    var key = path[i] === '*' ? Object.keys(inner)[0] : path[i];
    v = inner[key];
  }
  return v;
}

function matches(exists, value) {
  var expect = typeof EXPECT !== 'undefined' ? EXPECT : null;
  if (!expect) return true;
  if (expect === 'present') return exists;
  if (expect === 'absent') return !exists;
  if (expect.indexOf('>=') === 0) {
    return exists && value !== null && Number(value) >= Number(expect.slice(2));
  }
  return exists && value === expect;
}

var timeoutMs = Number(typeof TIMEOUT_MS !== 'undefined' && TIMEOUT_MS ? TIMEOUT_MS : 20000);
var deadline = Date.now() + timeoutMs;
var exists = false;
var value = null;

while (true) {
  var res = http.get(BASE + '/' + DOC_PATH, { headers: HEADERS });
  exists = res.status === 200;
  value = null;
  if (exists && typeof FIELD !== 'undefined' && FIELD) {
    var body = json(res.body);
    value = body.fields ? scalar(walk(body.fields, FIELD.split('.'))) : null;
  }
  if (matches(exists, value)) break;
  if (Date.now() >= deadline) break;
}

output.exists = exists ? 'true' : 'false';
output.value = value === null ? '' : value;
output.ok = matches(exists, value) ? 'true' : 'false';

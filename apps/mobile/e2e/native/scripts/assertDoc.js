// Maestro runScript — assert MANY fields of one Firestore-emulator document at
// once, polling until every one matches, and FAIL the step with the full diff
// when they don't.
//
// docField.js checks one scalar per call, so a flow that verifies a whole form
// either makes thirty calls or quietly checks three fields. This one takes the
// whole expectation as JSON, which is what a deep flow needs after every
// create and every edit.
//
// env:
//   DOC_PATH    required — path under /documents, e.g. "events/abc"
//   EXPECT_JSON required — { '<path>': <matcher>, … }, single-quoted (see below). A path is dotted; a
//               numeric segment indexes an array ("signupFields.0.label").
//               Matchers:
//                 "x" | 3 | true      the scalar, compared as a string
//                 "present" | "absent"
//                 ["a", "b"]          an array holding exactly these scalars, any order
//                 { "length": n }     an array's length, or a map's key count
//                 { "contains": [..] } an array holding at least these scalars
//                 { "prefix": "s" }   a string (or timestamp) starting with s
//                 { "not": "x" }      present and different from x
//   TIMEOUT_MS  optional — default 20000
// output:
//   output.ok "true" on success (the step throws otherwise)

var HOST = typeof EMULATOR_REST_HOST !== 'undefined' && EMULATOR_REST_HOST ? EMULATOR_REST_HOST : '127.0.0.1:8080';
var PROJECT = typeof E2E_FIREBASE_PROJECT !== 'undefined' && E2E_FIREBASE_PROJECT ? E2E_FIREBASE_PROJECT : 'cultuvilla-test';
var BASE = 'http://' + HOST + '/v1/projects/' + PROJECT + '/databases/(default)/documents';
// The emulator's rules-bypass token; see docField.js.
var HEADERS = { Authorization: 'Bearer owner' };
var PAUSE_URL =
  typeof POLL_PAUSE_URL !== 'undefined' && POLL_PAUSE_URL ? POLL_PAUSE_URL : 'http://127.0.0.1:9399/pause?ms=250';

function pause() {
  try {
    http.get(PAUSE_URL);
  } catch (e) {
    // No pause server: carry on unthrottled.
  }
}

function scalar(v) {
  if (v === null || v === undefined) return null;
  if (v.stringValue !== undefined) return String(v.stringValue);
  if (v.integerValue !== undefined) return String(v.integerValue);
  if (v.doubleValue !== undefined) return String(v.doubleValue);
  if (v.booleanValue !== undefined) return String(v.booleanValue);
  if (v.timestampValue !== undefined) return String(v.timestampValue);
  if (v.nullValue !== undefined) return '';
  return null;
}

function walk(fields, path) {
  var v = { mapValue: { fields: fields } };
  for (var i = 0; i < path.length; i++) {
    if (!v) return undefined;
    if (v.mapValue) v = (v.mapValue.fields || {})[path[i]];
    else if (v.arrayValue && /^\d+$/.test(path[i])) v = (v.arrayValue.values || [])[Number(path[i])];
    else return undefined;
  }
  return v;
}

function items(v) {
  return v && v.arrayValue ? (v.arrayValue.values || []).map(scalar) : null;
}

function check(v, want) {
  var present = v !== undefined && v !== null && v.nullValue === undefined;
  if (want === 'present') return present ? null : 'missing';
  if (want === 'absent') return present ? 'present: ' + JSON.stringify(scalar(v) !== null ? scalar(v) : v) : null;
  if (Array.isArray(want)) {
    var got = items(v);
    if (!got) return 'not an array';
    var a = got.slice().sort().join('|');
    var b = want.map(String).sort().join('|');
    return a === b ? null : 'got [' + got.join(', ') + ']';
  }
  if (want !== null && typeof want === 'object') {
    if (want.length !== undefined) {
      var n = v && v.arrayValue ? (v.arrayValue.values || []).length : v && v.mapValue ? Object.keys(v.mapValue.fields || {}).length : -1;
      return n === want.length ? null : 'length ' + n;
    }
    if (want.contains) {
      var have = items(v) || [];
      var missing = want.contains.filter(function (x) { return have.indexOf(String(x)) === -1; });
      return missing.length ? 'lacks ' + missing.join(', ') + ' in [' + have.join(', ') + ']' : null;
    }
    if (want.prefix !== undefined) {
      var s = scalar(v);
      return s !== null && s.indexOf(want.prefix) === 0 ? null : 'got ' + JSON.stringify(s);
    }
    if (want.not !== undefined) {
      var t = scalar(v);
      return present && t !== String(want.not) ? null : 'got ' + JSON.stringify(t);
    }
    return 'unknown matcher ' + JSON.stringify(want);
  }
  var got1 = scalar(v);
  return got1 === String(want) ? null : 'got ' + JSON.stringify(got1);
}

// Written with single quotes: an env value holding a double quote breaks
// Maestro's injection of it into this script ("Missing close quote"). So the
// spec is JSON with ' for ", and no value may contain an apostrophe.
var expectations = JSON.parse(EXPECT_JSON.replace(/'/g, '"'));
var timeoutMs = Number(typeof TIMEOUT_MS !== 'undefined' && TIMEOUT_MS ? TIMEOUT_MS : 20000);
var deadline = Date.now() + timeoutMs;
var problems = [];

while (true) {
  var res = http.get(BASE + '/' + DOC_PATH, { headers: HEADERS });
  problems = [];
  if (res.status !== 200) {
    problems.push('document missing (HTTP ' + res.status + ')');
  } else {
    var fields = json(res.body).fields || {};
    for (var key in expectations) {
      var why = check(walk(fields, key.split('.')), expectations[key]);
      if (why) problems.push(key + ': expected ' + JSON.stringify(expectations[key]) + ', ' + why);
    }
  }
  if (problems.length === 0 || Date.now() >= deadline) break;
  pause();
}

if (problems.length) throw new Error(DOC_PATH + ' — ' + problems.join('; '));
output.ok = 'true';

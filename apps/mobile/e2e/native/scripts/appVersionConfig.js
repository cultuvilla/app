// Maestro runScript — write `config/appVersion` on the Firestore emulator, the
// doc the force-update gate reads once at app launch.
//
// Runs on the HOST, like docField.js: the emulator is 127.0.0.1 here.
//
// The doc is global and outlives the flow that writes it — `clearState` resets
// the app, never Firestore — so a flow that writes it must also delete it, or
// every later flow in the run boots behind the update modal (deleteDoc.js).
//
// The converter is strict and the gate fails OPEN: a doc missing any field
// (both platforms, both store URLs) parses to null and the app shows nothing.
// So this writes the full shape, and the flow reads it back before relying on it.
//
// env:
//   MIN_SUPPORTED  X.Y.Z — applied to both platforms
//   LATEST         X.Y.Z — applied to both platforms
// output:
//   output.status  the HTTP status of the write

var HOST = typeof EMULATOR_REST_HOST !== 'undefined' && EMULATOR_REST_HOST ? EMULATOR_REST_HOST : '127.0.0.1:8080';
var PROJECT = typeof E2E_FIREBASE_PROJECT !== 'undefined' && E2E_FIREBASE_PROJECT ? E2E_FIREBASE_PROJECT : 'cultuvilla-test';
var URL = 'http://' + HOST + '/v1/projects/' + PROJECT + '/databases/(default)/documents/config/appVersion';

function str(v) {
  return { stringValue: v };
}

function platform(min, latest) {
  return { mapValue: { fields: { minSupported: str(min), latest: str(latest) } } };
}

var body = {
  fields: {
    ios: platform(MIN_SUPPORTED, LATEST),
    android: platform(MIN_SUPPORTED, LATEST),
    storeUrl: {
      mapValue: {
        fields: {
          ios: str('https://apps.apple.com/app/id0000000000'),
          android: str('https://play.google.com/store/apps/details?id=com.cultuvilla.app'),
        },
      },
    },
  },
};
var res = http.request(URL, {
  method: 'PATCH',
  headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
output.status = String(res.status);

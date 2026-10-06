// Maestro runScript — delete ONE Firestore-emulator document.
//
// For flow cleanup (`onFlowComplete`) of state that outlives the flow:
// `clearState` resets the app, never Firestore. Runs on the HOST, like
// docField.js, with the emulator's `Bearer owner` rules bypass.
//
// env:
//   DOC_PATH  required — path under /documents, e.g. "config/appVersion"
// output:
//   output.status  the HTTP status (200 also when the doc did not exist)

var HOST = typeof EMULATOR_REST_HOST !== 'undefined' && EMULATOR_REST_HOST ? EMULATOR_REST_HOST : '127.0.0.1:8080';
var PROJECT = typeof E2E_FIREBASE_PROJECT !== 'undefined' && E2E_FIREBASE_PROJECT ? E2E_FIREBASE_PROJECT : 'cultuvilla-test';
var BASE = 'http://' + HOST + '/v1/projects/' + PROJECT + '/databases/(default)/documents';

var res = http.request(BASE + '/' + DOC_PATH, {
  method: 'DELETE',
  headers: { Authorization: 'Bearer owner' },
});
output.status = String(res.status);

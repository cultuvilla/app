#!/usr/bin/env node
// Read-only Firestore EMULATOR reader for the QA pass. Uses the emulator's
// `Bearer owner` rules bypass, so it sees what the rules would hide from a client.
//   fs.mjs get <doc/path>
//   fs.mjs list <collection/path> [limit]
//   fs.mjs query <collection> <field> <EQUAL|ARRAY_CONTAINS|…> '<json value>' [limit]
// Port: FIRESTORE_EMULATOR_HOST, else <QA_ROOT or cwd>/firebase.agent.json, else firebase.json.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.env.QA_ROOT || process.cwd();
function host() {
  if (process.env.FIRESTORE_EMULATOR_HOST) return process.env.FIRESTORE_EMULATOR_HOST;
  for (const f of ['firebase.agent.json', 'firebase.json']) {
    const p = path.join(root, f);
    if (existsSync(p)) return `127.0.0.1:${JSON.parse(readFileSync(p, 'utf8')).emulators.firestore.port}`;
  }
  throw new Error('no emulator port: set FIRESTORE_EMULATOR_HOST or QA_ROOT');
}
const project = process.env.QA_PROJECT || 'cultuvilla-test';
const base = `http://${host()}/v1/projects/${project}/databases/(default)/documents`;
const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

function plain(v) {
  if (v == null) return v;
  const [k, x] = Object.entries(v)[0];
  switch (k) {
    case 'mapValue': return Object.fromEntries(Object.entries(x.fields ?? {}).map(([a, b]) => [a, plain(b)]));
    case 'arrayValue': return (x.values ?? []).map(plain);
    case 'integerValue': return Number(x);
    case 'nullValue': return null;
    case 'geoPointValue': return { lat: x.latitude, lng: x.longitude };
    default: return x;
  }
}
const doc = (d) => ({ _path: d.name.split('/documents/')[1], ...plain({ mapValue: { fields: d.fields } }) });
function value(j) {
  if (j === null) return { nullValue: null };
  if (typeof j === 'boolean') return { booleanValue: j };
  if (typeof j === 'number') return Number.isInteger(j) ? { integerValue: String(j) } : { doubleValue: j };
  return { stringValue: String(j) };
}

const [cmd, a, b, c, d, e] = process.argv.slice(2);
let out;
if (cmd === 'get') {
  const r = await fetch(`${base}/${a}`, { headers });
  out = r.status === 404 ? { _path: a, _missing: true } : doc(await r.json());
} else if (cmd === 'list') {
  const r = await fetch(`${base}/${a}?pageSize=${b || 50}`, { headers });
  out = ((await r.json()).documents ?? []).map(doc);
} else if (cmd === 'query') {
  const parts = a.split('/');
  const collectionId = parts.pop();
  const parent = parts.length ? `${base}/${parts.join('/')}` : base;
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      where: { fieldFilter: { field: { fieldPath: b }, op: c, value: value(JSON.parse(d)) } },
      limit: Number(e || 50),
    },
  };
  const r = await fetch(`${parent}:runQuery`, { method: 'POST', headers, body: JSON.stringify(body) });
  out = (await r.json()).filter((x) => x.document).map((x) => doc(x.document));
} else {
  console.error('usage: fs.mjs get <doc> | list <coll> [n] | query <coll> <field> <op> <json> [n]');
  process.exit(2);
}
console.log(JSON.stringify(out, null, 2));

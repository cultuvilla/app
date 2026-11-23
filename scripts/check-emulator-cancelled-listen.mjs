#!/usr/bin/env node
/**
 * Proves the running Firestore emulator lets a write through when a listener
 * that the write makes unreadable has already gone, as production does.
 *
 * As the owner it writes an active news post (readable by anyone under
 * firestore.rules), opens a gRPC Listen on it with no credentials, waits for
 * the answer, and cancels the call the way a client that drops its listener
 * does (RST_STREAM CANCEL). It then hides the post, which the rules no longer
 * let that listener read. The stock emulator answers that write with HTTP 499
 * "call already cancelled"; the jar from scripts/lib/emulator-grpc.mjs, 200.
 * Background triggers are paused through the hub, when given, so the post
 * fires none. Why: docs/decisions/ios-e2e-emulator-keepalive.md.
 *
 *   node scripts/check-emulator-cancelled-listen.mjs [--host 127.0.0.1:8080] [--hub 127.0.0.1:4400]
 *        [--project cultuvilla-test]
 *
 * Exit 0 when the write succeeds, 1 otherwise (with the reason). Leaves no document behind.
 */
import http2 from 'node:http2';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const OWNER = { authorization: 'Bearer owner' };

// Protobuf wire format, just enough for one ListenRequest.
function varint(n) {
  const out = [];
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
  return Buffer.from(out);
}
const bytesField = (field, value) => {
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  return Buffer.concat([varint((field << 3) | 2), varint(buf.length), buf]);
};
const intField = (field, value) => Buffer.concat([varint(field << 3), varint(value)]);

/**
 * google.firestore.v1.ListenRequest { database = 1; add_target = 2 } with
 * Target { documents = 3 { documents = 2 }; target_id = 5 }, framed for gRPC.
 */
export function listenRequestFrame(database, documentName, targetId = 1) {
  const target = Buffer.concat([bytesField(3, bytesField(2, documentName)), intField(5, targetId)]);
  const message = Buffer.concat([bytesField(1, database), bytesField(2, target)]);
  const header = Buffer.alloc(5);
  header.writeUInt32BE(message.length, 1);
  return Buffer.concat([header, message]);
}

async function rest(host, method, url, body) {
  const res = await fetch(`http://${host}${url}`, {
    method,
    headers: { ...OWNER, 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, text: (await res.text()).slice(0, 300) };
}

/** The rules this probe leans on: an active post is public, a hidden one is not. */
export const PROBE_POST = { readable: 'active', unreadable: 'hidden' };

export async function probeCancelledListen({ host, project, hub }) {
  const database = `projects/${project}/databases/(default)`;
  const documentName = `${database}/documents/news/emulatorProbe${Date.now()}`;
  const docUrl = `/v1/${documentName}`;
  const status = (value) => ({ fields: { status: { stringValue: value } } });
  const triggers = (on) =>
    hub && fetch(`http://${hub}/functions/${on ? 'enable' : 'disable'}BackgroundTriggers`, { method: 'PUT' });

  await triggers(false);
  const session = http2.connect(`http://${host}`);
  session.on('error', () => {});
  const connected = new Promise((resolve, reject) => {
    session.once('connect', resolve);
    session.once('error', reject);
  });
  try {
    const created = await rest(host, 'PATCH', docUrl, status(PROBE_POST.readable));
    if (created.status !== 200) return { ok: false, reason: `could not write the probe post: HTTP ${created.status}` };
    await connected;
    const stream = session.request({
      ':method': 'POST',
      ':path': '/google.firestore.v1.Firestore/Listen',
      'content-type': 'application/grpc',
      te: 'trailers',
      // The SDKs name the database in this header, and the emulator requires it.
      'google-cloud-resource-prefix': database,
    });
    stream.on('error', () => {});
    const answered = new Promise((resolve) => {
      stream.once('data', () => resolve(true));
      stream.once('close', () => resolve(false));
      setTimeout(() => resolve(false), 10_000);
    });
    stream.write(listenRequestFrame(database, documentName));
    if (!(await answered)) return { ok: false, reason: 'the emulator never answered the Listen' };
    stream.close(http2.constants.NGHTTP2_CANCEL);
    // Let the server see the RST_STREAM before the write notifies the stream.
    await sleep(500);

    const write = await rest(host, 'PATCH', docUrl, status(PROBE_POST.unreadable));
    if (write.status !== 200) {
      return {
        ok: false,
        reason: `a write after its listener was cancelled answered HTTP ${write.status} ${write.text}`,
      };
    }
    return { ok: true };
  } finally {
    session.destroy();
    await rest(host, 'DELETE', docUrl).catch(() => {});
    await triggers(true);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const flag = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : fallback;
  };
  const host = flag('host', process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080');
  const project = flag('project', process.env.TEST_PROJECT_ID ?? 'cultuvilla-test');
  const hub = flag('hub', process.env.FIREBASE_EMULATOR_HUB);
  const result = await probeCancelledListen({ host, project, hub }).catch((err) => ({
    ok: false,
    reason: err.message,
  }));
  if (result.ok) {
    console.log(`[emulator-cancelled-listen] ${host} accepted a write after its listener was cancelled`);
  } else {
    console.error(`[emulator-cancelled-listen] ${host}: ${result.reason}`);
    process.exit(1);
  }
}

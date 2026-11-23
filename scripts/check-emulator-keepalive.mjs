#!/usr/bin/env node
/**
 * Proves the running Firestore emulator accepts the Firestore SDKs' 30 s gRPC
 * keepalive the way production does. Opens a bare HTTP/2 connection and sends
 * three PINGs, `--gap-ms` apart, with no call open. The stock emulator answers
 * the third with GOAWAY too_many_pings; with the policy from
 * scripts/lib/emulator-keepalive.mjs every ping is acked.
 * Why: docs/decisions/ios-e2e-emulator-keepalive.md.
 *
 *   node scripts/check-emulator-keepalive.mjs [--host 127.0.0.1:8080] [--gap-ms 11000]
 *
 * Exit 0 when every ping is acked, 1 otherwise (with the reason).
 */
import http2 from 'node:http2';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { KEEPALIVE_PERMIT_MS } from './lib/emulator-keepalive.mjs';

const PINGS = 3;

export async function probeKeepalive({ host, gapMs = KEEPALIVE_PERMIT_MS + 1000 }) {
  const session = http2.connect(`http://${host}`);
  let goaway;
  let settlePing = () => {};
  session.on('goaway', (code, _lastStreamId, data) => {
    goaway = `GOAWAY code ${code}${data?.length ? ` (${data.toString()})` : ''}`;
    settlePing(false);
  });
  session.on('close', () => settlePing(false));
  session.on('error', () => {});
  const ping = () =>
    new Promise((resolve) => {
      if (session.destroyed || goaway) return resolve(false);
      const timer = setTimeout(() => settlePing(false), 5000);
      settlePing = (acked) => {
        clearTimeout(timer);
        settlePing = () => {};
        resolve(acked);
      };
      if (!session.ping((err) => settlePing(!err))) settlePing(false);
    });
  try {
    await new Promise((resolve, reject) => {
      session.once('connect', resolve);
      session.once('error', reject);
    });
    for (let i = 1; i <= PINGS; i++) {
      if (i > 1) await sleep(gapMs);
      if (!(await ping())) return { ok: false, reason: goaway ?? `ping ${i} of ${PINGS} not acked` };
    }
    // A GOAWAY may trail the last ack.
    await sleep(500);
    return goaway ? { ok: false, reason: goaway } : { ok: true };
  } finally {
    session.destroy();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const flag = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : fallback;
  };
  const host = flag('host', process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080');
  const gapMs = Number(flag('gap-ms', String(KEEPALIVE_PERMIT_MS + 1000)));
  const result = await probeKeepalive({ host, gapMs }).catch((err) => ({ ok: false, reason: err.message }));
  if (result.ok) {
    console.log(`[emulator-keepalive] ${host} acked ${PINGS} pings ${gapMs} ms apart`);
  } else {
    console.error(`[emulator-keepalive] ${host} rejects the SDKs' keepalive: ${result.reason}`);
    process.exit(1);
  }
}

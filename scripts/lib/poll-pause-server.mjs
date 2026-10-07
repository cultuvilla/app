#!/usr/bin/env node
/**
 * A localhost endpoint that answers after a delay: `GET /pause?ms=250`.
 *
 * The Maestro flows' backend assertions (e2e/native/scripts/docField.js,
 * queryCollection.js) poll the Firestore emulator in a loop, and Maestro's JS
 * runtime has no sleep — so they call this between polls instead of firing
 * GETs back to back. Run as its own process by scripts/lib/maestro-suite.mjs:
 * the runner blocks in spawnSync while Maestro runs, so an in-process server
 * would never answer.
 */
import http from 'node:http';

export const POLL_PAUSE_PORT = Number(process.env.E2E_POLL_PAUSE_PORT || 9399);
const MAX_PAUSE_MS = 2000;

export function pauseMs(url) {
  const ms = Number(new URL(url, 'http://localhost').searchParams.get('ms'));
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, MAX_PAUSE_MS) : 0;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const server = http.createServer((req, res) => {
    setTimeout(() => res.end('ok'), pauseMs(req.url ?? '/'));
  });
  // Another run on this machine already serving the port is just as good.
  server.on('error', (err) => process.exit(err.code === 'EADDRINUSE' ? 0 : 1));
  server.listen(POLL_PAUSE_PORT, '127.0.0.1');
}

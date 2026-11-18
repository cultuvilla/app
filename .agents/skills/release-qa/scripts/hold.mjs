#!/usr/bin/env node
// Keeps run-tests-with-emulators.mjs's emulators up for an interactive QA pass,
// then lets the wrapper tear them down. Bounded on purpose: AGENTS.md forbids
// long-lived emulator sessions, so this exits on `touch <root>/.qa-stop` or after
// QA_MAX_HOURS (default 6), whichever comes first.
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const stop = path.resolve(process.cwd(), '.qa-stop');
rmSync(stop, { force: true });
const deadline = Date.now() + Number(process.env.QA_MAX_HOURS || 6) * 3_600_000;
console.log(`[qa-hold] emulators up; touch ${stop} to stop (cap ${new Date(deadline).toISOString()})`);
const timer = setInterval(() => {
  if (existsSync(stop) || Date.now() > deadline) {
    clearInterval(timer);
    rmSync(stop, { force: true });
    console.log('[qa-hold] stopping');
  }
}, 5_000);

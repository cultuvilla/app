/**
 * Write a new version of the `APNS_AUTH_KEY` secret — `{ teamId, keyId,
 * privateKey }` — for one env. Used by the Apple team transfer
 * (docs/plans/ongoing/apple-team-transfer.md): once to stamp today's key with
 * the team that issued it, and on the day to swap in the new team's key.
 *
 *   node scripts/set-apns-key.mjs --env=prod --team-id=78RB67NT38 --keep-key            # stamp the current key
 *   node scripts/set-apns-key.mjs --env=prod --team-id=8HWS4483VD --key-id=<KEY> --key-file=<AuthKey.p8>
 *
 * Dry run unless --confirm. Never prints the key.
 *
 * A Cloud Function binds the secret version that was latest WHEN IT WAS
 * DEPLOYED, so a new version changes nothing until the push functions
 * (onNotificationCreated, flushPushQueue) are redeployed — this script prints
 * the command. That is also what makes the stamp safe to write ahead of time.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

import { buildApnsSecret, describeApnsSecret, withTeamId } from './lib/apns-secret.mjs';

const PROJECTS = { dev: 'villa-events', beta: 'cultuvilla-beta', prod: 'cultuvilla-prod' };
const SECRET = 'APNS_AUTH_KEY';
const KNOWN = ['--env', '--team-id', '--key-id', '--key-file', '--keep-key', '--confirm'];

const arg = (flag) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1) ?? null;
const has = (flag) => process.argv.includes(flag);
for (const token of process.argv.slice(2)) {
  const name = token.split('=')[0];
  if (!KNOWN.includes(name)) {
    console.error(`Unknown flag: ${name}\nKnown flags: ${KNOWN.join(', ')}`);
    process.exit(2);
  }
}

const env = arg('--env');
const project = PROJECTS[env];
if (!project) {
  console.error('--env=dev|beta|prod is required');
  process.exit(2);
}
const gcloud = (args, input) =>
  execFileSync('gcloud', [...args, `--project=${project}`], {
    input,
    encoding: 'utf8',
    // Name the configuration: the machine's active one is deliberately empty.
    env: { ...process.env, CLOUDSDK_ACTIVE_CONFIG_NAME: process.env.CLOUDSDK_ACTIVE_CONFIG_NAME || 'cultuvilla' },
    stdio: ['pipe', 'pipe', 'inherit'],
  });

const teamId = arg('--team-id');
let next;
if (has('--keep-key')) {
  next = withTeamId(gcloud(['secrets', 'versions', 'access', 'latest', `--secret=${SECRET}`]), teamId);
} else {
  const keyFile = arg('--key-file');
  if (!keyFile) {
    console.error('--key-id and --key-file are required (or --keep-key)');
    process.exit(2);
  }
  next = buildApnsSecret({ teamId, keyId: arg('--key-id'), privateKey: fs.readFileSync(keyFile, 'utf8') });
}

const current = (() => {
  try {
    return describeApnsSecret(gcloud(['secrets', 'versions', 'access', 'latest', `--secret=${SECRET}`]));
  } catch {
    return null;
  }
})();
console.log(`[set-apns-key] ${env} (${project})`);
console.log(`  latest:  ${JSON.stringify(current)}`);
console.log(`  new:     ${JSON.stringify(describeApnsSecret(next))}`);

if (!has('--confirm')) {
  console.log('DRY RUN — nothing written. Re-run with --confirm.');
  process.exit(0);
}
gcloud(['secrets', 'versions', 'add', SECRET, '--data-file=-'], next);
console.log('  written. It takes effect only once the push functions are redeployed:');
console.log(`  firebase deploy --only functions:onNotificationCreated,functions:flushPushQueue --project=${project}`);

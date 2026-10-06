#!/usr/bin/env node
/**
 * PR guardrail: fail when this branch removes (or renames) a client-reachable
 * Cloud Function without declaring it.
 *
 * Installed store binaries call callables by name (`httpsCallable(fns, 'name')`
 * in packages/shared/src/services) and cannot be upgraded on our schedule — iOS
 * and Android lag for weeks. A callable that disappears from the deploy turns
 * every such call into `not-found` on phones still running the old build.
 *
 * What counts: every name exported from functions/src/index.ts whose defining
 * module assigns it from `onCall(` or `onRequest(` (or whose definition cannot
 * be read — counted, to stay on the safe side). Triggers and schedulers are
 * never client-reachable, so removing one passes. A rename is a removal of the
 * old name.
 *
 * Satisfied by a commit in the PR carrying either trailer:
 *   Breaking-Client: <reason>         — it does strand old clients; the release
 *                                       raises config/appVersion.minSupported.
 *   Breaking-Client-Exempt: <reason>  — no supported client calls it any more
 *                                       (its last call site shipped below the
 *                                       live minSupported). No wall.
 * The usual answer is neither: keep the old callable one release longer
 * (expand → migrate → contract) and remove it once minSupported has passed it.
 *
 * Limits: a callable whose *signature* tightens (new required input, narrower
 * response) is breaking too and is NOT detected — that stays agent discipline.
 * See docs/decisions/breaking-change-and-hard-wall.md.
 *
 *   node scripts/check-callable-removal.mjs --base=origin/develop [--head=HEAD]
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  clientReachableNames,
  commitMessagesInRange,
  judge,
  removedNames,
  resolveRange,
  showAt,
} from './lib/breaking-change.mjs';

const TAG = 'callable-removal';
const INDEX = 'functions/src/index.ts';

export function callableNamesAt(ref, cwd) {
  const index = showAt(ref, INDEX, cwd);
  if (index === null) return [];
  const readModule = (from) => {
    const rel = path.posix.normalize(path.posix.join(path.posix.dirname(INDEX), from));
    return showAt(ref, `${rel}.ts`, cwd) ?? showAt(ref, `${rel}/index.ts`, cwd);
  };
  return clientReachableNames(index, readModule);
}

function main() {
  const cwd = process.cwd();
  const { head, mergeBase } = resolveRange(process.argv, cwd, TAG);
  const removed = removedNames(callableNamesAt(mergeBase, cwd), callableNamesAt(head, cwd));
  const findings = removed.map((n) => `removed client-reachable function ${n}`);
  const msgs = findings.length ? commitMessagesInRange(mergeBase, head, cwd) : [];
  const verdict = judge({ findings, msgs, tag: TAG });
  if (verdict.ok) {
    console.log(verdict.message);
    return;
  }
  if (verdict.message) {
    console.error(verdict.message);
    process.exit(1);
  }
  console.error(`::error::[${TAG}] Removed without a declaration: ${removed.join(', ')}`);
  console.error(`::error::[${TAG}] Installed app builds may still call these. Prefer keeping them one more release (expand → migrate → contract). Otherwise add \`Breaking-Client: <reason>\` (raises minSupported at release) or, if no supported client can call them, \`Breaking-Client-Exempt: <reason>\` to a commit. See docs/decisions/breaking-change-and-hard-wall.md`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

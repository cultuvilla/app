#!/usr/bin/env node
// Maestro guardrail: never tap an element in the same breath that scrolled it
// into view.
//
//   node scripts/check-maestro-scroll-then-tap.js [--dir=.maestro/flows]
//
// Config (`.agents/checks.config.json`): "maestro": { "flowsDir": ".maestro/flows" }
// — a directory, or a list of them, searched recursively for *.yaml / *.yml.
//
// `scrollUntilVisible` returns the moment its target peeks over the edge — by
// default at the very bottom of the screen, under the gesture bar — and the list
// is still gliding from the last swipe when it does. A `tapOn` sent right then
// lands on a moving list: Android spends the touch stopping the fling and opens
// nothing. The flow then dies one step LATER, on whatever wait expected the
// destination ("tournament-view-detail-header is visible = false"), which reads
// like a navigation bug rather than a timing one. Two release-PR flows failed
// exactly that way on 2026-09-30; about 35 other sites had the same shape.
//
// The fix (Órdago's `.maestro/flows/subflows/open-live-hub-tournament.yaml`) is to
// centre the target and let the list settle before touching it:
//
//   - scrollUntilVisible: { element: { id: X }, centerElement: true, ... }
//   - waitForAnimationToEnd: { timeout: 5000 }
//   - tapOn: { id: X }
//
// This check flags the one shape that is always the race: `scrollUntilVisible`
// of X IMMEDIATELY followed by `tapOn` X. The settle is what makes the tap safe,
// so `centerElement` alone does not pass — it scrolls further, and the list is
// still moving when it stops too. The settle alone does pass: centring is
// recommended everywhere, horizontal rails included (a dozen centred rail
// scrolls passed the full suite on 2026-10-01), but it is the settle that
// closes the race, so it is the only half this check demands.
//
// Out of scope, deliberately: a scroll that reveals one thing followed by a tap
// on another (the tapped element was not the one the scroll chased, so nothing
// says it just arrived), and a subflow that scrolls with the caller tapping
// afterwards (the pair spans two files).

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('./lib/mini-yaml');
const { repoRoot, checksConfig, arg } = require('./lib/checks-config');

function listFlowFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFlowFiles(full));
    else if (/\.ya?ml$/.test(entry.name)) out.push(full);
  }
  return out.sort();
}

/** `{ id, text }` of a Maestro selector, or null when it names neither. */
function selectorKey(selector) {
  if (typeof selector === 'string') return { id: undefined, text: selector };
  if (!selector || typeof selector !== 'object') return null;
  const { id, text } = selector;
  if (id === undefined && text === undefined) return null;
  return { id, text };
}

function sameTarget(a, b) {
  if (!a || !b) return false;
  if (a.id !== undefined || b.id !== undefined) return a.id === b.id;
  return a.text === b.text;
}

function commandName(cmd) {
  if (typeof cmd === 'string') return cmd;
  if (cmd && typeof cmd === 'object') return Object.keys(cmd)[0];
  return undefined;
}

/** Every command list in a flow: the top level plus each nested `commands:`. */
function* commandLists(commands) {
  if (!Array.isArray(commands)) return;
  yield commands;
  for (const cmd of commands) {
    if (!cmd || typeof cmd !== 'object') continue;
    for (const body of Object.values(cmd)) {
      if (body && typeof body === 'object' && Array.isArray(body.commands)) {
        yield* commandLists(body.commands);
      }
    }
  }
}

/** Violations in one flow's source, as `{ target }` entries. */
function findViolations(source) {
  const docs = yaml.loadAll(source);
  const lists = [];
  for (const doc of docs) {
    if (Array.isArray(doc)) lists.push(...commandLists(doc));
    else if (doc && typeof doc === 'object') {
      for (const hook of ['onFlowStart', 'onFlowComplete']) lists.push(...commandLists(doc[hook]));
    }
  }

  const violations = [];
  for (const list of lists) {
    for (let i = 0; i + 1 < list.length; i++) {
      if (commandName(list[i]) !== 'scrollUntilVisible') continue;
      if (commandName(list[i + 1]) !== 'tapOn') continue;
      const scrolled = selectorKey(list[i].scrollUntilVisible?.element);
      const tapped = selectorKey(list[i + 1].tapOn);
      if (!sameTarget(scrolled, tapped)) continue;
      violations.push({ target: scrolled.id ?? scrolled.text });
    }
  }
  return violations;
}

function collectProblems(dirs) {
  const files = [].concat(dirs).flatMap(listFlowFiles);
  const problems = [];
  for (const file of files) {
    let violations;
    try {
      violations = findViolations(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      if (!(err instanceof yaml.YamlSubsetError)) throw err;
      // Never skip a flow this cannot read: it may hold the very race.
      problems.push(`${file}: cannot read it — ${err.message}`);
      continue;
    }
    for (const v of violations) {
      problems.push(`${file}: scrollUntilVisible "${v.target}" is followed straight by tapOn "${v.target}"`);
    }
  }
  return { files, problems };
}

function main(argv = process.argv.slice(2)) {
  const root = repoRoot();
  const flag = arg(argv, '--dir', null);
  const configured = checksConfig(root, 'maestro').flowsDir ?? path.join('.maestro', 'flows');
  const dirs = (flag ? [flag] : [].concat(configured)).map((d) => path.resolve(root, d));
  const missing = dirs.filter((d) => !fs.existsSync(d));
  if (missing.length) {
    console.error(`check-maestro-scroll-then-tap: no such directory: ${missing.join(', ')}`);
    return 1;
  }
  const { files, problems } = collectProblems(dirs);
  if (problems.length > 0) {
    console.error('Maestro scroll-then-tap guardrail failed:\n');
    for (const p of problems) console.error(`  ✗ ${path.relative(root, p.split(':')[0])}${p.slice(p.indexOf(':'))}`);
    console.error(
      '\nThe list is still moving when scrollUntilVisible returns, so the tap only stops it.' +
        '\nAdd `centerElement: true` to the scroll and `waitForAnimationToEnd: {timeout: 5000}` before the tap' +
        '. See the header of this script.',
    );
    return 1;
  }
  console.log(`check-maestro-scroll-then-tap: ${files.length} flow files OK`);
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { findViolations, collectProblems };

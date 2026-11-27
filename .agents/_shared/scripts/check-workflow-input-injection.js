#!/usr/bin/env node
'use strict';
// Rejects an attacker-controllable `${{ }}` expression interpolated into a
// workflow `run:` block, or into the `script:` of an actions/github-script step.
//
//   node scripts/check-workflow-input-injection.js [--update-baseline]
//
// An interpolation is TEXTUAL SUBSTITUTION performed before the shell ever sees
// the line, so a dispatch input carrying shell metacharacters does not arrive as
// a string argument — it arrives as script. Validating the value inside the
// program the line invokes is too late by one layer: Órdago's PR #879 shipped
// `--deployed-after='${{ github.event.inputs.deployed_after }}'` past a script
// that already validated the timestamp. The workflows that take dispatch inputs
// are usually the ones holding deploy rights and production credentials.
//
// The fix is always the same — bind the value in the step's `env:` and read it
// as "$VAR" (or process.env.VAR), which the shell treats as data whatever it
// contains.
//
// `inputs.*` of type `choice` are flagged too: the value set lives in `on:`, and
// a `workflow_call` caller is not bound by it, so this checks where the value is
// READ, not its declared type. Binding through `env:` costs nothing and keeps the
// rule mechanical.
//
// Config (`.agents/checks.config.json`, all optional):
//   "workflowInjection": {
//     "workflowsDir": ".github/workflows",
//     "baseline": ".github/workflow-injection-baseline.json"
//   }
// The baseline lists sites accepted when the check was adopted, each as a key
// string or `{ "key": ..., "reason": ... }`. It may only SHRINK: a new site fails,
// and so does an entry that matches nothing. A file the YAML reader cannot read
// fails too — this is a security gate, so it never skips what it cannot see.

const fs = require('node:fs');
const path = require('node:path');
const { loadAll, YamlSubsetError } = require('./lib/mini-yaml');
const { repoRoot, checksConfig } = require('./lib/checks-config');

// Contexts an outsider (or a dispatcher who is not the workflow author) can set.
// `secrets.*` and `matrix.*` are deliberately absent: secrets are masked and
// author-controlled, and a matrix value comes from the workflow's own code.
const UNTRUSTED = [
  'github\\.event\\.inputs',
  'inputs',
  'github\\.event\\.issue',
  'github\\.event\\.pull_request',
  'github\\.event\\.comment',
  'github\\.event\\.review',
  'github\\.event\\.head_commit',
  'github\\.event\\.workflow_run\\.(?:head_branch|head_commit|display_title)',
  'github\\.head_ref',
];
// An expression runs to its `}}`, not its first `}`: `format('--v={0}', inputs.v)`
// holds braces of its own, and stopping at them would miss the input inside.
const EXPRESSION = /\$\{\{[\s\S]*?\}\}/g;
const UNTRUSTED_REF = new RegExp(`(?<![\\w.-])(?:${UNTRUSTED.join('|')})\\b`);

/** The attacker-controllable `${{ }}` expressions in a piece of code. */
const untrustedExpressions = (code) => (code.match(EXPRESSION) ?? []).filter((e) => UNTRUSTED_REF.test(e));

function settings(root) {
  const cfg = checksConfig(root, 'workflowInjection');
  return {
    workflowsDir: path.join(root, cfg.workflowsDir ?? path.join('.github', 'workflows')),
    baselinePath: path.join(root, cfg.baseline ?? path.join('.github', 'workflow-injection-baseline.json')),
  };
}

const workflowFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort() : []);

/** The code a step runs: its `run:`, or the `script:` of actions/github-script. */
function stepCode(step) {
  if (typeof step?.run === 'string') return step.run;
  if (typeof step?.uses === 'string' && /^actions\/github-script@/.test(step.uses) && typeof step.with?.script === 'string') {
    return step.with.script;
  }
  return null;
}

/** Every flagged site under `workflowsDir`. Throws, naming the file, on one it cannot read. */
function findings(workflowsDir = settings(repoRoot()).workflowsDir) {
  const out = [];
  for (const file of workflowFiles(workflowsDir)) {
    let docs;
    try {
      docs = loadAll(fs.readFileSync(path.join(workflowsDir, file), 'utf8'));
    } catch (err) {
      if (err instanceof YamlSubsetError) throw new YamlSubsetError(`${file}: ${err.message}`);
      throw err;
    }
    for (const doc of docs) {
      for (const [jobName, job] of Object.entries(doc?.jobs ?? {})) {
        (job?.steps ?? []).forEach((step, index) => {
          const code = stepCode(step);
          if (code === null) return;
          for (const hit of untrustedExpressions(code)) {
            out.push({ file, jobName, step: step.name || `steps[${index}]`, hit });
          }
        });
      }
    }
  }
  return out;
}

/** Stable identity for a finding, so the baseline survives step reordering. */
const key = ({ file, jobName, hit }) => `${file}|${jobName}|${hit}`;

function readBaseline(baselinePath) {
  if (!fs.existsSync(baselinePath)) return { doc: { accepted: [] }, keys: new Set() };
  const doc = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  if (!Array.isArray(doc.accepted)) throw new Error(`${baselinePath}: "accepted" must be an array`);
  const keys = doc.accepted.map((e) => (typeof e === 'string' ? e : e?.key));
  if (keys.some((k) => typeof k !== 'string')) throw new Error(`${baselinePath}: every entry is a key string or { key, reason }`);
  return { doc, keys: new Set(keys) };
}

function main(argv = process.argv.slice(2), { root = repoRoot(), stdout = process.stdout, stderr = process.stderr } = {}) {
  const { workflowsDir, baselinePath } = settings(root);
  let hits;
  try {
    hits = findings(workflowsDir);
  } catch (err) {
    if (!(err instanceof YamlSubsetError)) throw err;
    stderr.write(`check-workflow-input-injection: cannot read ${err.message}\n`
      + 'The check reads a YAML subset and refuses what it does not understand (anchors,\n'
      + 'aliases, tags, merge keys) rather than skip it. Rewrite that construct plainly.\n');
    return 1;
  }
  const { doc, keys: baseline } = readBaseline(baselinePath);
  const introduced = hits.filter((h) => !baseline.has(key(h)));
  const seen = new Set(hits.map(key));
  // An entry matching nothing means the site was fixed (good) or renamed (needs
  // re-recording); either way, leaving it reads as coverage for nothing.
  const stale = [...baseline].filter((entry) => !seen.has(entry));

  if (argv.includes('--update-baseline')) {
    const reasons = new Map(doc.accepted.filter((e) => typeof e === 'object').map((e) => [e.key, e.reason]));
    const accepted = [...seen].sort().map((k) => (reasons.has(k) ? { key: k, reason: reasons.get(k) } : k));
    fs.writeFileSync(baselinePath, `${JSON.stringify({ ...doc, accepted }, null, 2)}\n`);
    stdout.write(`check-workflow-input-injection: baseline re-recorded (${accepted.length} sites)\n`);
    return 0;
  }

  if (!introduced.length && !stale.length) {
    stdout.write(`check-workflow-input-injection: ${workflowFiles(workflowsDir).length} workflow files OK (${baseline.size} baselined)\n`);
    return 0;
  }

  if (introduced.length) {
    stderr.write('NEW attacker-controllable expression interpolated into a `run:` block or github-script:\n\n');
    introduced.forEach(({ file, jobName, step, hit }) => stderr.write(`  ${file} → ${jobName} → ${step}\n    ${hit}\n`));
    stderr.write('\nAn interpolation is substituted before the shell parses the line, so a value\n'
      + 'carrying shell metacharacters executes. Bind it in the step\'s `env:` and read\n'
      + 'it as "$VAR" (or process.env.VAR) instead.\n'
      + 'Do NOT add it to the baseline: the baseline only shrinks.\n');
  }
  if (stale.length) {
    stderr.write('\nBaseline entries that matched nothing (fixed or renamed) — remove them:\n\n');
    stale.forEach((entry) => stderr.write(`  ${entry}\n`));
    stderr.write('\n  node scripts/check-workflow-input-injection.js --update-baseline\n');
  }
  return 1;
}

module.exports = { findings, key, main, untrustedExpressions };
if (require.main === module) process.exit(main());

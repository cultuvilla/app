'use strict';
// The consuming repo's root and its `.agents/checks.config.json`, which holds every
// value a shared CI check needs that differs between repos (paths, budgets). Read
// from the working directory, never from this file's location: consumers reach the
// checks through a symlink into `.agents/_shared`.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const CONFIG = path.join('.agents', 'checks.config.json');

function repoRoot(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return path.resolve(cwd);
  }
}

/** The `section` of the repo's checks config, or `{}` when the file or section is absent. */
function checksConfig(root, section) {
  const file = path.join(root, CONFIG);
  if (!fs.existsSync(file)) return {};
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const value = doc[section];
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${CONFIG}: "${section}" must be an object`);
  return value;
}

function arg(argv, flag, def) {
  const a = argv.find((x) => x.startsWith(`${flag}=`));
  return a ? a.slice(flag.length + 1) : def;
}

module.exports = { CONFIG, repoRoot, checksConfig, arg };

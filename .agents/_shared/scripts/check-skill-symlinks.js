#!/usr/bin/env node
//
// Fails when a skill symlink — or a script or hook symlink into the shared
// submodule — does not resolve.
//
// Scripts and hooks are covered because they are executable: a dangling
// scripts/pr-land.js stops every landing, and a dangling
// .claude/hooks/guard-lander-kill.sh does worse — a PreToolUse command that
// does not exist is a non-blocking hook error, not a deny, so the guard it
// carries silently disappears.
//
// The bug this exists to prevent: 3788aba7 pointed
// `.agents/skills/ship-a-feature` at `../_shared/ship-a-feature`, but the
// content lives at `../_shared/skills/ship-a-feature`. Both shared skills were
// therefore unloadable AS COMMITTED, and nothing noticed for a day — two
// parallel agent batches ran to completion following skills that resolved to
// nothing. A missing skill is silent: no error, no warning, the agent simply
// never reads it and behaves as if the procedure did not exist.
//
// `git submodule update --init` does NOT fix this class. An uninitialised
// submodule leaves the target absent; a wrong link stays broken after init.
// The two failures look identical from the outside, which is why the check
// resolves the link rather than testing for the submodule — and why the two
// are reported differently.
//
// Run: node scripts/check-skill-symlinks.js
//
// Config (`.agents/checks.config.json`, all optional):
//   "skillSymlinks": {
//     "skillDirs": [".agents/skills", ".claude/skills"],  // must exist
//     "linkDirs": ["scripts", ".claude/hooks"],           // may hold no links
//     "sharedDir": ".agents/_shared"
//   }

'use strict';
const fs = require('fs');
const path = require('path');
const { repoRoot, checksConfig } = require('./lib/checks-config');

const SKILL_DIRS = ['.agents/skills', '.claude/skills'];
// Directories whose symlinks must resolve but which may legitimately hold none.
const LINK_DIRS = ['scripts', '.claude/hooks'];
const SHARED_DIR = '.agents/_shared';

// lstat throws on a path whose PARENT is missing; guard it so a wholly-absent
// tree reports as a missing dir rather than an exception.
const isLink = (p) => {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};

/**
 * Resolve every skill symlink under `repoRoot`.
 *
 * Exported so the outcomes are testable against fixture trees — the CLI below
 * is a thin wrapper that only formats and picks an exit code.
 */
function inspectSkillSymlinks(repoRoot, skillDirs = SKILL_DIRS, linkDirs = LINK_DIRS, sharedDir = SHARED_DIR) {
  // A shared copy that is absent (a submodule never initialised) is a local
  // checkout problem, not a committed defect — it is reported separately so a
  // fresh clone gets an actionable message instead of a confusing "broken symlink".
  const submodulePopulated = fs.existsSync(path.join(repoRoot, sharedDir, 'skills'));

  const broken = [];
  const missingDirs = [];
  let checked = 0;

  for (const dir of skillDirs) {
    const abs = path.join(repoRoot, dir);
    // `.claude/skills` is ITSELF a symlink (-> ../.agents/skills). Skipping an
    // unresolvable skill dir would let a break in one view pass unnoticed as
    // long as the other resolved — the same silent-skip class this guard exists
    // to close, one level up. A missing expected dir is a failure.
    if (!fs.existsSync(abs)) {
      missingDirs.push({
        dir,
        target: fs.existsSync(path.dirname(abs)) && isLink(abs) ? fs.readlinkSync(abs) : null,
      });
      continue;
    }

    // The skills directory may itself be a symlink
    // (.claude/skills -> ../.agents/skills).
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const entryPath = path.join(abs, entry.name);
      if (!fs.lstatSync(entryPath).isSymbolicLink()) continue;
      checked += 1;
      if (!fs.existsSync(entryPath)) {
        broken.push({
          link: path.join(dir, entry.name),
          target: fs.readlinkSync(entryPath),
        });
      }
    }
  }

  for (const dir of linkDirs) {
    const abs = path.join(repoRoot, dir);
    if (!fs.existsSync(abs)) continue;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isSymbolicLink()) continue;
      const entryPath = path.join(abs, entry.name);
      checked += 1;
      if (!fs.existsSync(entryPath)) {
        broken.push({ link: path.join(dir, entry.name), target: fs.readlinkSync(entryPath) });
      }
    }
  }

  return { checked, broken, missingDirs, submodulePopulated };
}

function report({ checked, broken, missingDirs = [], submodulePopulated }, log = console) {
  if (broken.length === 0 && missingDirs.length === 0) {
    log.log(`✅ skill, script and hook symlinks: ${checked} resolve`);
    return 0;
  }

  for (const { dir, target } of missingDirs) {
    log.error(
      `\u274c ${dir} does not resolve` +
        (target ? ` -> ${target}` : ' (missing)') +
        '\n   That whole skill view is unloadable, even if the other one resolves.'
    );
  }
  if (broken.length === 0) return 1;

  if (!submodulePopulated) {
    log.error(
      '❌ the shared copy (.agents/_shared by default) is not populated — refresh the vendored ' +
        'copy, or run `git submodule update --init` where it is still a submodule.'
    );
    return 1;
  }

  log.error('❌ symlinks that do not resolve:\n');
  for (const { link, target } of broken) {
    log.error(`   ${link} -> ${target}`);
  }
  log.error(
    '\nThe shared copy IS populated, so these targets are wrong as committed.' +
      '\nA skill that does not resolve loads as nothing, silently — the agent' +
      '\nnever reads it and behaves as if the procedure did not exist.'
  );
  return 1;
}

module.exports = { inspectSkillSymlinks, report, SKILL_DIRS, LINK_DIRS, SHARED_DIR };

if (require.main === module) {
  // The consuming repo, from the working directory: this file is reached through
  // a symlink into the shared copy, where __dirname is not the repo.
  const root = repoRoot();
  const cfg = checksConfig(root, 'skillSymlinks');
  process.exit(report(inspectSkillSymlinks(root, cfg.skillDirs ?? SKILL_DIRS, cfg.linkDirs ?? LINK_DIRS, cfg.sharedDir ?? SHARED_DIR)));
}

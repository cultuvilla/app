/**
 * Pure helpers behind `pnpm release:cut`, the release-PR guard and the
 * beta → main promotion PR. Everything here takes strings and returns strings so
 * it can be unit-tested without git; the CLIs own the side effects.
 *
 * Policy lives in AGENTS.md → "Versioning & releases".
 */

import path from 'node:path';
import { extractVersion } from './app-version.mjs';

export const RELEASE_BRANCH = /^release\/(\d+\.\d+\.\d+)$/;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseSemver(v) {
  const m = SEMVER.exec(String(v).trim());
  if (!m) throw new Error(`Invalid version "${v}" — expected MAJOR.MINOR.PATCH`);
  return m.slice(1).map(Number);
}

/** -1 | 0 | 1 */
export function compareVersions(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
  }
  return 0;
}

export function bumpVersion(v, kind) {
  const [major, minor, patch] = parseSemver(v);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump "${kind}" — expected patch, minor or major`);
}

const RANK = { patch: 1, minor: 2, major: 3 };

/**
 * The bump the commits since beta call for: a breaking change (`type!:` or a
 * `BREAKING CHANGE:` footer) → major, any `feat` → minor, anything else → patch.
 * Returns null when there is nothing to release.
 *
 * @param {{ subject: string, body?: string }[]} commits
 */
export function proposeBump(commits) {
  const real = commits.filter((c) => !SEMVER.test(c.subject.trim()));
  if (real.length === 0) return null;
  let bump = 'patch';
  for (const { subject, body = '' } of real) {
    const header = /^(\w+)(\([^)]*\))?(!)?:/.exec(subject);
    let kind = 'patch';
    if ((header && header[3]) || /^BREAKING[ -]CHANGE:/m.test(body)) kind = 'major';
    else if (header && header[1] === 'feat') kind = 'minor';
    if (RANK[kind] > RANK[bump]) bump = kind;
  }
  return bump;
}

/** commitlint's config-conventional caps every body and footer line at this. */
export const COMMIT_LINE_MAX = 100;
const BREAKING_KEY = 'Breaking-Client';

/**
 * The `Breaking-Client: <reason>` trailer line for `release:cut --breaking`.
 * One line, at most COMMIT_LINE_MAX characters, so commitlint accepts it and
 * breaking-rollup.mjs reads the whole reason back.
 */
export function breakingTrailer(reason) {
  const r = String(reason ?? '').trim();
  if (!r) throw new Error('--breaking needs a reason: --breaking="<what older installed clients would hit>"');
  if (/[\r\n]/.test(r)) throw new Error('--breaking takes a one-line reason');
  const line = `${BREAKING_KEY}: ${r}`;
  if (line.length > COMMIT_LINE_MAX) {
    const room = COMMIT_LINE_MAX - `${BREAKING_KEY}: `.length;
    throw new Error(`--breaking reason is ${r.length} characters; keep it to ${room} so the trailer line fits ${COMMIT_LINE_MAX}.`);
  }
  return line;
}

/**
 * The message of the commit `release:cut` makes on develop, or null for none.
 *
 *   bump commit            `X.Y.Z` — the bare version commitlint exempts —
 *                          plus the trailer when the release is breaking
 *   no bump (develop is    nothing, unless the release is breaking: then an
 *   already at X.Y.Z)      empty `chore(release): declare X.Y.Z breaking`
 *                          carries the trailer, since the rollup reads only
 *                          commits between the previous release tag and this one
 */
export function releaseCommitMessage({ version, bumped, breaking }) {
  const trailer = breaking ? breakingTrailer(breaking) : null;
  if (bumped) return trailer ? `${version}\n\n${trailer}` : version;
  return trailer ? `chore(release): declare ${version} breaking\n\n${trailer}` : null;
}

/** Replace the single top-level `version:` in an app.config.ts source. */
export function setAppConfigVersion(source, version) {
  extractVersion(source); // throws when absent or ambiguous
  return source.replace(/^(\s*version:\s*)(['"])[^'"]+\2/m, `$1$2${version}$2`);
}

export function setPackageJsonVersion(source, version) {
  if (!/^\s*"version":\s*"[^"]*"/m.test(source)) throw new Error('No "version" field in package.json');
  return source.replace(/^(\s*"version":\s*)"[^"]*"/m, `$1"${version}"`);
}

const UNRELEASED = /^## \[Unreleased\][^\n]*\n/m;

/** The body of `## [Unreleased]`, up to the next `## ` heading. */
export function unreleasedBody(changelog) {
  const m = UNRELEASED.exec(changelog);
  if (!m) throw new Error('CHANGELOG.md has no "## [Unreleased]" heading');
  const rest = changelog.slice(m.index + m[0].length);
  const next = rest.search(/^## /m);
  return next === -1 ? rest : rest.slice(0, next);
}

export function hasVersionSection(changelog, version) {
  return new RegExp(`^## v${version.replace(/\./g, '\\.')}\\b`, 'm').test(changelog);
}

/** Where pending entries live: one file per PR, so two PRs never touch the same lines. */
export const FRAGMENTS_DIR = 'changelog.d';

/** A fragment is any `changelog.d/*.md` except the directory's own README. */
export function isFragmentPath(file) {
  return (
    file.startsWith(`${FRAGMENTS_DIR}/`) &&
    file.endsWith('.md') &&
    path.posix.basename(file).toLowerCase() !== 'readme.md'
  );
}

/**
 * Move `[Unreleased]` plus every `changelog.d/` fragment under `## vX.Y.Z — date`
 * and reopen an empty `[Unreleased]`. Fragments follow the hand-written body
 * (the store notes) in filename order, so the stamp is reproducible.
 * Refuses an empty release, a missing store-notes block (the App Store "What's
 * New" is written by a person, so the cut will not invent one) and a version
 * that is already stamped.
 *
 * @param {{ path: string, content: string }[]} [fragments]
 */
export function stampChangelog(changelog, version, date, fragments = []) {
  if (hasVersionSection(changelog, version)) {
    throw new Error(`CHANGELOG.md already has a "## v${version}" section`);
  }
  const body = unreleasedBody(changelog);
  const entries = [...fragments]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => f.content.trim())
    .filter(Boolean);
  const merged = [body.trim(), entries.join('\n')].filter(Boolean).join('\n\n');
  if (!merged) {
    throw new Error(
      `CHANGELOG.md [Unreleased] and ${FRAGMENTS_DIR}/ are both empty — there are no release notes to stamp.`,
    );
  }
  if (!/<!--\s*store-notes\s*-->[\s\S]*?\S[\s\S]*?<!--\s*\/store-notes\s*-->/.test(body)) {
    throw new Error(
      'CHANGELOG.md [Unreleased] has no <!-- store-notes --> … <!-- /store-notes --> block. ' +
        'Write the es-ES App Store "What\'s New" there first (see the prepare-release skill).',
    );
  }
  const m = UNRELEASED.exec(changelog);
  const head = changelog.slice(0, m.index);
  const tail = changelog.slice(m.index + m[0].length + body.length);
  return `${head}## [Unreleased]\n\n## v${version} — ${date}\n\n${merged}\n\n${tail}`;
}

/** The body of `## vX.Y.Z …`, up to the next `## ` heading. */
export function versionSection(changelog, version) {
  const lines = String(changelog).split('\n');
  const re = new RegExp(`^## v${version.replace(/\./g, '\\.')}\\b`);
  const start = lines.findIndex((l) => re.test(l));
  if (start === -1) throw new Error(`CHANGELOG.md has no "## v${version}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^## /.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

/**
 * Every `**Migration:**` note in a version section, one line each. A note runs
 * from the marker to the end of its bullet (bullets wrap onto indented lines).
 */
export function extractMigrations(section) {
  const bullets = [];
  for (const line of section.split('\n')) {
    if (/^- /.test(line)) bullets.push(line.slice(2));
    else if (/^\s+\S/.test(line) && bullets.length) bullets[bullets.length - 1] += ` ${line.trim()}`;
    else bullets.push(null);
  }
  return bullets
    .filter((b) => b && b.includes('**Migration:**'))
    .map((b) => b.slice(b.indexOf('**Migration:**') + '**Migration:**'.length).trim());
}

export function migrationChecklist(migrations) {
  if (migrations.length === 0) return 'No `**Migration:**` notes in this release — no data moves.';
  return [
    'Registered `autoApply` backfills run inside the deploy, before the conformance and backfill gates;',
    'anything else needs **Actions → Run Backfill** on that env before the promotion merges.',
    '',
    ...migrations.map((m) => `- [ ] ${m}`),
  ].join('\n');
}

/** Body of the `release/X.Y.Z → beta` PR. */
export function releasePrBody({ version, previous, section, migrations, breaking = null }) {
  return [
    `Release **${version}** → beta (beta is on ${previous}). Opened by \`pnpm release:cut\`.`,
    '',
    `This branch is \`develop\` at the version-bump commit plus a merge of \`main\`, so it is up to date with beta's base. Merging builds the beta store apps and deploys \`cultuvilla-beta\`; once both are green, the \`beta → main\` PR opens itself.`,
    '',
    ...(breaking
      ? [
          `**Breaking for installed clients:** ${breaking}. Declared by \`release:cut --breaking\`: on prod the backend is held until both stores serve ${version}, then \`minSupported\` rises to ${version}.`,
          '',
        ]
      : []),
    '## Data migrations',
    '',
    migrationChecklist(migrations),
    '',
    `## CHANGELOG v${version}`,
    '',
    section,
    '',
    '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
  ].join('\n');
}

/** Body of the `beta → main` PR the promotion workflow keeps up to date. */
/**
 * The steps a breaking release needs from the user, in the promotion PR. Only
 * managed publishing has to happen before the merge: without it Play publishes
 * Android on approval, ahead of iOS and of the held backend (1.7.1 did).
 */
export function breakingReleaseChecklist(version, reasons = []) {
  return [
    '## :warning: Breaking release — released by hand',
    '',
    ...reasons.map((r) => `- \`Breaking-Client:\` ${r}`),
    '',
    'Merging ships only the store binaries and indexes. Nothing reaches users until you release it, and the auto-merge never merges this PR.',
    '',
    '- [ ] **Before merging:** Play Console → Publishing overview → **Managed publishing ON** (Google has no API for it)',
    `- [ ] When the "Release ${version}: approved in both stores" issue opens: press **Publish** in the Play Console and run \`pnpm release:publish\``,
    '- [ ] After the issue closes: **managed publishing OFF**',
    '',
  ];
}

export function promotionPrBody({ version, section, migrations, runs = [], breaking = null }) {
  return [
    `Promote **${version}** to production. Beta's deploy and store builds for this commit are green:`,
    '',
    ...runs.map((r) => `- [${r.name}](${r.url}) — ${r.conclusion}`),
    '',
    breaking?.breaking
      ? `Merging submits both stores for review and tags \`v${version}\`; the backend waits for \`pnpm release:publish\`.`
      : `Merging deploys \`cultuvilla-prod\` and tags \`v${version}\`.`,
    '',
    ...(breaking?.breaking ? breakingReleaseChecklist(version, breaking.reasons) : []),
    '## Data migrations',
    '',
    migrationChecklist(migrations),
    '',
    `## CHANGELOG v${version}`,
    '',
    section,
    '',
    '_Opened by `promote-to-main.yml`. Merge it yourself: production is a human decision._',
  ].join('\n');
}

/**
 * Which branch may open a PR into beta / main, and what it must be titled.
 *
 *   beta ← release/<version>  the cut; <version> must equal the head's app version
 *   main ← beta               always
 *
 * A release PR is titled with the bare version: the store-build runs triggered
 * by its merge are named after it. Returns a list of problems (empty = ok).
 */
export function releasePrProblems({ base, headRef, title, headVersion, baseVersion }) {
  const problems = [];
  const t = String(title ?? '').trim();
  if (base === 'beta') {
    const m = RELEASE_BRANCH.exec(headRef);
    if (!m) {
      problems.push(
        `beta only receives release/<x.y.z> branches, not "${headRef}". Cut one with \`pnpm release:cut\`.`,
      );
    } else if (m[1] !== headVersion) {
      problems.push(`"${headRef}" ships app version ${headVersion}; a release branch is named release/<the version it ships>.`);
    }
    if (t !== headVersion) problems.push(`a release PR is titled with the bare version "${headVersion}", not "${t}".`);
  } else if (base === 'main') {
    if (headRef !== 'beta') problems.push(`main only receives merges from beta, not from "${headRef}".`);
    if (headVersion !== baseVersion && t !== headVersion) {
      problems.push(`a promotion PR is titled with the bare version "${headVersion}", not "${t}".`);
    }
  } else {
    throw new Error(`releasePrProblems: unexpected base "${base}"`);
  }
  return problems;
}

#!/usr/bin/env node
/**
 * Runs one test file with the config that owns it, under emulators only when
 * that config needs them.
 *
 *   pnpm test:file <name | path> [extra runner args...]
 *
 * <name> is a file name with or without its `.test.ts(x)` suffix
 * (`membershipService`, `approveOrganization.test.ts`); <path> is relative to
 * the repo root or the current directory. A name matching several files lists
 * them and stops.
 *
 * Which config owns a file is read from the configs' own include lists, and
 * the emulator set mirrors the root package.json script that runs that suite
 * in CI, so this runner and the gate never disagree. Emulators start through
 * run-tests-with-emulators.mjs, which picks up this worktree's agent-env slot.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  "android",
  "ios",
]);
const TEST_FILE = /\.test\.tsx?$/;

/** Turns a `dir/**\/*.test.ts` include glob into a RegExp over a relative path. */
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      re += glob[i + 2] === "/" ? "(?:.*/)?" : ".*";
      i += glob[i + 2] === "/" ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/** Reads the string array exported as `name` from packages/shared/vitest.suites.ts. */
export function suiteIncludes(source, name) {
  const block = source.match(
    new RegExp(`export const ${name} = \\[([^\\]]*)\\]`),
  );
  if (!block)
    throw new Error(`vitest.suites.ts has no ${name} array of literals`);
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/**
 * The suites a file can belong to. `emulators: null` runs with no emulators;
 * a string is the `ONLY` list run-tests-with-emulators.mjs is given ('' = its
 * default set), copied from the root script that runs that suite.
 */
export function loadSuites(root = ROOT) {
  const suites = readFileSync(
    path.join(root, "packages/shared/vitest.suites.ts"),
    "utf8",
  );
  const shared = (name, includeName, config, emulators) => ({
    name,
    workspace: "packages/shared",
    include: suiteIncludes(suites, includeName),
    command: (file) => [
      "pnpm",
      "--filter",
      "@cultuvilla/shared",
      "exec",
      "vitest",
      "run",
      "--config",
      config,
      file,
    ],
    emulators,
  });
  return [
    shared("shared:unit", "UNIT_INCLUDE", "vitest.config.ts", null),
    shared(
      "shared:integration",
      "INTEGRATION_INCLUDE",
      "vitest.config.integration.ts",
      "",
    ), // test:integration
    shared(
      "shared:rules",
      "E2E_INCLUDE",
      "vitest.config.e2e.ts",
      "firestore,storage",
    ), // test:rules
    {
      name: "functions:integration",
      workspace: "functions",
      include: ["src/__tests__/handlers/**/*.test.ts"],
      // `npm run` (not exec) so vitest starts in functions/, where its config is.
      command: (file) => [
        "npm",
        "--prefix",
        "functions",
        "run",
        "test:integration",
        "--",
        file,
      ],
      emulators: "auth,firestore,storage", // test:functions
    },
    {
      name: "functions:unit",
      workspace: "functions",
      include: ["src/__tests__/**/*.test.ts"],
      command: (file) => [
        "npm",
        "--prefix",
        "functions",
        "run",
        "test",
        "--",
        file,
      ],
      emulators: null,
    },
    {
      name: "mobile",
      workspace: "apps/mobile",
      include: ["**/*.test.ts", "**/*.test.tsx"],
      exclude: ["e2e/**"], // jest's testPathIgnorePatterns: the Maestro suite
      command: (file) => [
        "pnpm",
        "--filter",
        "cultuvilla-mobile",
        "exec",
        "jest",
        file,
      ],
      emulators: null,
    },
  ];
}

/** The first suite (in order) whose workspace holds `relPath` and whose include matches it. */
export function suiteFor(relPath, suites) {
  const posix = relPath.split(path.sep).join("/");
  for (const suite of suites) {
    const prefix = `${suite.workspace}/`;
    if (!posix.startsWith(prefix)) continue;
    const inWorkspace = posix.slice(prefix.length);
    const matches = (globs) =>
      (globs ?? []).some((g) => globToRegExp(g).test(inWorkspace));
    if (matches(suite.include) && !matches(suite.exclude))
      return { suite, inWorkspace };
  }
  return null;
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name) && !e.name.startsWith("."))
        walk(path.join(dir, e.name), out);
    } else if (TEST_FILE.test(e.name)) out.push(path.join(dir, e.name));
  }
  return out;
}

/** Every test file under the covered workspaces, relative to `root`. */
export function listTestFiles(root = ROOT) {
  const files = [];
  for (const ws of ["packages/shared/test", "functions/src", "apps/mobile"])
    walk(path.join(root, ws), files);
  return files.map((f) => path.relative(root, f));
}

/** A bare name's stem: `fooService.test.ts` and `fooService` both give `fooService`. */
export function stemOf(name) {
  return path.basename(name).replace(TEST_FILE, "");
}

/**
 * Resolves the argument to repo-relative paths: an existing file wins, else
 * every test file whose stem equals the name's.
 */
export function resolveTarget(
  arg,
  { root = ROOT, cwd = process.cwd(), files } = {},
) {
  for (const candidate of [path.resolve(cwd, arg), path.resolve(root, arg)]) {
    try {
      if (statSync(candidate).isFile()) return [path.relative(root, candidate)];
    } catch {
      // not a path; fall through to a name search
    }
  }
  const stem = stemOf(arg);
  return (files ?? listTestFiles(root)).filter((f) => stemOf(f) === stem);
}

/** The argv to spawn for a resolved file, emulators included when its suite needs them. */
export function planRun(relPath, suites, extra = []) {
  const hit = suiteFor(relPath, suites);
  if (!hit) return null;
  const { suite, inWorkspace } = hit;
  const argv = [...suite.command(inWorkspace), ...extra];
  if (suite.emulators === null) return { suite: suite.name, argv, env: {} };
  return {
    suite: suite.name,
    argv: ["node", "scripts/run-tests-with-emulators.mjs", ...argv],
    env: suite.emulators ? { ONLY: suite.emulators } : {},
  };
}

function main() {
  const [arg, ...extra] = process.argv.slice(2);
  if (!arg || arg.startsWith("-")) {
    console.error("Usage: pnpm test:file <name | path> [extra runner args...]");
    console.error("  pnpm test:file membershipService");
    console.error(
      "  pnpm test:file functions/src/__tests__/handlers/approveOrganization.test.ts",
    );
    process.exit(1);
  }
  const matches = resolveTarget(arg);
  if (matches.length === 0) {
    console.error(
      `No test file matches "${arg}" in packages/shared/test, functions/src or apps/mobile.`,
    );
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`"${arg}" matches ${matches.length} files; pass one path:`);
    for (const m of matches) console.error(`  ${m}`);
    process.exit(1);
  }
  const plan = planRun(matches[0], loadSuites());
  if (!plan) {
    console.error(
      `${matches[0]} is not in any vitest or jest config this runner knows.`,
    );
    process.exit(1);
  }
  const how =
    plan.argv[1] === "scripts/run-tests-with-emulators.mjs"
      ? `under emulators (${plan.env.ONLY ?? "default set"})`
      : "no emulators";
  console.log(`${matches[0]} → ${plan.suite}, ${how}`);
  const res = spawnSync(plan.argv[0], plan.argv.slice(1), {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, ...plan.env },
  });
  process.exit(res.status ?? 1);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();

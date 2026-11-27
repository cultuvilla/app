// pnpm test:file: which config owns a file, and whether it boots emulators.
// The suites are read from the real configs, so a drifted include list or a
// test file no runner owns fails here.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  globToRegExp,
  listTestFiles,
  loadSuites,
  planRun,
  resolveTarget,
  stemOf,
  suiteFor,
  suiteIncludes,
} from "../run-test-file.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const suites = loadSuites(ROOT);

describe("globToRegExp", () => {
  it("matches nested and top-level files under **/", () => {
    const re = globToRegExp("test/e2e/**/*.test.ts");
    assert.ok(re.test("test/e2e/rules.test.ts"));
    assert.ok(re.test("test/e2e/orgs/members.test.ts"));
    assert.ok(!re.test("test/e2e/rules.test.tsx"));
    assert.ok(!re.test("test/integration/rules.test.ts"));
  });
  it("lets a leading **/ match the workspace root", () => {
    assert.ok(globToRegExp("**/*.test.tsx").test("Foo.test.tsx"));
  });
});

describe("suiteIncludes", () => {
  it("reads a literal array out of vitest.suites.ts source", () => {
    const src = "export const E2E_INCLUDE = ['test/e2e/**/*.test.ts'];";
    assert.deepEqual(suiteIncludes(src, "E2E_INCLUDE"), [
      "test/e2e/**/*.test.ts",
    ]);
  });
  it("fails loudly when the array is gone", () => {
    assert.throws(() => suiteIncludes("", "UNIT_INCLUDE"), /UNIT_INCLUDE/);
  });
});

describe("planRun", () => {
  const plan = (f) => planRun(f, suites);

  it("runs shared unit tests without emulators", () => {
    const p = plan("packages/shared/test/services/fooService.test.ts");
    assert.equal(p.suite, "shared:unit");
    assert.equal(p.argv[0], "pnpm");
    assert.ok(p.argv.includes("vitest.config.ts"));
    assert.ok(p.argv.includes("test/services/fooService.test.ts"));
  });

  it("runs shared integration tests under the default emulator set", () => {
    const p = plan("packages/shared/test/integration/foo.test.ts");
    assert.equal(p.suite, "shared:integration");
    assert.deepEqual(p.argv.slice(0, 2), [
      "node",
      "scripts/run-tests-with-emulators.mjs",
    ]);
    assert.ok(p.argv.includes("vitest.config.integration.ts"));
    assert.deepEqual(p.env, {});
  });

  it("runs rules tests under firestore + storage, as test:rules does", () => {
    const p = plan("packages/shared/test/e2e/foo.test.ts");
    assert.equal(p.suite, "shared:rules");
    assert.ok(p.argv.includes("vitest.config.e2e.ts"));
    assert.deepEqual(p.env, { ONLY: "firestore,storage" });
  });

  it("runs functions handler tests under emulators, as test:functions does", () => {
    const p = plan(
      "functions/src/__tests__/handlers/approveOrganization.test.ts",
    );
    assert.equal(p.suite, "functions:integration");
    assert.ok(p.argv.includes("test:integration"));
    assert.ok(
      p.argv.includes("src/__tests__/handlers/approveOrganization.test.ts"),
    );
    assert.deepEqual(p.env, { ONLY: "auth,firestore,storage" });
  });

  it("runs functions unit tests without emulators", () => {
    const p = plan("functions/src/__tests__/observability.test.ts");
    assert.equal(p.suite, "functions:unit");
    assert.deepEqual(p.argv.slice(0, 5), [
      "npm",
      "--prefix",
      "functions",
      "run",
      "test",
    ]);
  });

  it("runs mobile tests with jest and passes extra args through", () => {
    const p = planRun("apps/mobile/components/Foo.test.tsx", suites, [
      "-t",
      "renders",
    ]);
    assert.equal(p.suite, "mobile");
    assert.deepEqual(p.argv.slice(-4), [
      "jest",
      "components/Foo.test.tsx",
      "-t",
      "renders",
    ]);
    assert.deepEqual(p.env, {});
  });

  it("refuses a file no config runs", () => {
    assert.equal(plan("apps/mobile/e2e/helpers/foo.test.ts"), null);
    assert.equal(plan("packages/shared/test/setup/foo.test.ts"), null);
    assert.equal(plan("scripts/__tests__/announce.test.mjs"), null);
  });
});

describe("resolveTarget", () => {
  const files = [
    "packages/shared/test/services/fooService.test.ts",
    "functions/src/__tests__/handlers/bar.test.ts",
    "apps/mobile/__tests__/bar.test.tsx",
  ];
  it("finds a file by bare name or by full file name", () => {
    assert.equal(stemOf("fooService.test.ts"), "fooService");
    assert.deepEqual(
      resolveTarget("fooService", { root: "/nowhere", cwd: "/nowhere", files }),
      [files[0]],
    );
    assert.deepEqual(
      resolveTarget("fooService.test.ts", {
        root: "/nowhere",
        cwd: "/nowhere",
        files,
      }),
      [files[0]],
    );
  });
  it("returns every match for an ambiguous name", () => {
    assert.deepEqual(
      resolveTarget("bar", { root: "/nowhere", cwd: "/nowhere", files }),
      files.slice(1),
    );
  });
  it("takes an existing path relative to the current directory", () => {
    const rel = "scripts/run-test-file.mjs";
    assert.deepEqual(resolveTarget(rel, { root: ROOT, cwd: ROOT, files: [] }), [
      rel,
    ]);
    assert.deepEqual(
      resolveTarget("run-test-file.mjs", {
        root: ROOT,
        cwd: path.join(ROOT, "scripts"),
        files: [],
      }),
      [rel],
    );
  });
});

describe("the real tree", () => {
  it("has a runner for every test file it lists", () => {
    const files = listTestFiles(ROOT);
    assert.ok(files.length > 100, `only ${files.length} test files found`);
    const orphans = files.filter((f) => !suiteFor(f, suites));
    assert.deepEqual(orphans, []);
  });
});

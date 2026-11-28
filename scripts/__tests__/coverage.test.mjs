import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COVERAGE_SOURCES,
  GITHUB_COMMENT_LIMIT,
  TRUNCATION_NOTICE,
  normalizeLcov,
  summarizeLcov,
  truncateComment,
} from "../lib/coverage.mjs";

describe("normalizeLcov", () => {
  it("prefixes a package-relative path", () => {
    assert.equal(
      normalizeLcov("SF:src/a.ts\nLF:1", "functions/", "/repo"),
      "SF:functions/src/a.ts\nLF:1",
    );
  });

  it("strips a leading ./", () => {
    assert.equal(
      normalizeLcov("SF:./lib/x.ts", "apps/mobile/", "/repo"),
      "SF:apps/mobile/lib/x.ts",
    );
  });

  it("is idempotent", () => {
    assert.equal(
      normalizeLcov("SF:functions/src/a.ts", "functions/", "/repo"),
      "SF:functions/src/a.ts",
    );
  });

  it("makes an absolute path repo-relative", () => {
    assert.equal(
      normalizeLcov(
        "SF:/repo/packages/shared/src/a.ts",
        "packages/shared/",
        "/repo",
      ),
      "SF:packages/shared/src/a.ts",
    );
  });

  it("rewrites every record, not just the first", () => {
    const out = normalizeLcov(
      "SF:a.ts\nend_of_record\nSF:b.ts\nend_of_record",
      "p/",
      "/repo",
    );
    assert.equal(out, "SF:p/a.ts\nend_of_record\nSF:p/b.ts\nend_of_record");
  });
});

describe("summarizeLcov", () => {
  const merged = [
    "SF:functions/src/a.ts",
    "LF:10",
    "LH:5",
    "end_of_record",
    "SF:apps/mobile/lib/b.ts",
    "LF:10",
    "LH:10",
    "end_of_record",
  ].join("\n");

  it("totals overall and per package", () => {
    const table = summarizeLcov(merged, ["apps/mobile/", "functions/"]);
    assert.match(table, /\*\*Overall\*\* \| 75\.0% \(15\/20\)/);
    assert.match(table, /`functions\/` \| 50\.0% \(5\/10\)/);
    assert.match(table, /`apps\/mobile\/` \| 100\.0% \(10\/10\)/);
  });

  it("leaves out a package with no records", () => {
    assert.doesNotMatch(
      summarizeLcov(merged, ["packages/i18n/", "functions/"]),
      /i18n/,
    );
  });
});

describe("truncateComment", () => {
  it("leaves a body that fits untouched", () => {
    assert.equal(truncateComment("short", 100), "short");
  });

  it("cuts a long body to the limit, notice included", () => {
    const out = truncateComment("x".repeat(200_000));
    assert.ok(Buffer.byteLength(out, "utf8") <= 65000);
    assert.ok(out.endsWith(TRUNCATION_NOTICE));
  });

  it("stays under GitHub’s cap with multi-byte text and never splits a character", () => {
    const out = truncateComment("ñ€".repeat(60_000));
    assert.ok(out.length < GITHUB_COMMENT_LIMIT);
    assert.ok(Buffer.byteLength(out, "utf8") <= 65000);
    assert.ok(!out.includes("�"));
  });
});

describe("coverage workflow", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/coverage.yml", import.meta.url),
    "utf8",
  );
  const ci = readFileSync(
    new URL("../../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );

  // The merge queue waits on ci.yml's required jobs; coverage must not join them.
  it("runs beside ci.yml, never in the merge queue", () => {
    assert.doesNotMatch(workflow, /merge_group/);
    assert.doesNotMatch(ci, /test:coverage|diff-cover/);
  });

  it("runs every workspace whose LCOV it merges", () => {
    for (const { prefix } of COVERAGE_SOURCES) {
      assert.match(
        workflow,
        new RegExp(`working-directory: ${prefix.replace(/\/$/, "")}\\n`),
      );
    }
  });

  it("never fails the PR: every test and diff step continues on error", () => {
    const steps = workflow.split(/\n(?=      - name:)/).slice(1);
    const risky = steps.filter((s) =>
      /run: (pnpm|npm run) test:coverage|run: \|\n\s+mkdir -p coverage\/html|uses: .*sticky/.test(
        s,
      ),
    );
    assert.equal(risky.length, 6);
    for (const step of risky) {
      assert.match(step, /continue-on-error: true/, step.split("\n")[0]);
    }
    assert.match(workflow, /--fail-under=0/);
  });

  it("truncates the comment before posting it, and updates one comment in place", () => {
    const truncate = workflow.indexOf("truncate-pr-comment.mjs");
    const post = workflow.indexOf("sticky-pull-request-comment");
    assert.ok(truncate > 0 && post > truncate);
    assert.match(workflow, /header: coverage/);
  });
});

#!/usr/bin/env node
// Merges each workspace's LCOV into coverage/merged.lcov (repo-root-relative
// `SF:` paths, for diff-cover) and writes coverage/summary.md. A missing input is
// skipped — one red suite still leaves a partial report; it exits 1 only when
// there is nothing at all to merge. Used by .github/workflows/coverage.yml.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COVERAGE_SOURCES,
  normalizeLcov,
  summarizeLcov,
} from "./lib/coverage.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "coverage", "merged.lcov");
const SUMMARY = join(ROOT, "coverage", "summary.md");

const parts = [];
for (const { lcov, prefix } of COVERAGE_SOURCES) {
  const abs = join(ROOT, lcov);
  if (!existsSync(abs)) {
    console.warn(`skip (missing): ${lcov}`);
    continue;
  }
  parts.push(normalizeLcov(readFileSync(abs, "utf8").trimEnd(), prefix, ROOT));
  console.log(`merged ${lcov}`);
}

if (parts.length === 0) {
  console.error("No LCOV inputs found — nothing to merge.");
  process.exit(1);
}

const merged = parts.join("\n") + "\n";
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, merged);
const summary = summarizeLcov(
  merged,
  COVERAGE_SOURCES.map((s) => s.prefix),
);
writeFileSync(SUMMARY, summary);
console.log(summary);

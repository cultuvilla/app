#!/usr/bin/env node
// Truncates a Markdown file in place so it fits GitHub's comment limit.
// Usage: node scripts/truncate-pr-comment.mjs <file> [limit]
import { readFileSync, writeFileSync } from "node:fs";
import { DEFAULT_COMMENT_LIMIT, truncateComment } from "./lib/coverage.mjs";

const [file, rawLimit] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node scripts/truncate-pr-comment.mjs <file> [limit]");
  process.exit(1);
}
const limit = rawLimit ? Number(rawLimit) : DEFAULT_COMMENT_LIMIT;
if (!Number.isFinite(limit) || limit <= 0) {
  console.error(`Invalid limit: ${rawLimit}`);
  process.exit(1);
}

const body = readFileSync(file, "utf8");
const out = truncateComment(body, limit);
const bytes = (s) => Buffer.byteLength(s, "utf8");
if (out === body) {
  console.log(`${file}: ${bytes(body)} bytes, under ${limit}.`);
} else {
  writeFileSync(file, out);
  console.log(
    `${file}: ${bytes(body)} bytes exceeded ${limit}; truncated to ${bytes(out)}.`,
  );
}

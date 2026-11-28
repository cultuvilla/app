// Pure helpers behind the patch-coverage report (.github/workflows/coverage.yml):
// merging each workspace's LCOV into one repo-root-relative file, summarising it,
// and keeping the PR comment under GitHub's size limit. They live here because a
// workflow `run:` block cannot be tested; scripts/__tests__/coverage.test.mjs
// covers them. See docs/decisions/patch-coverage-not-absolute-total.md.
import { isAbsolute, relative } from "node:path";

/** Each workspace's LCOV, and the repo-relative prefix its `SF:` paths need. */
export const COVERAGE_SOURCES = [
  { lcov: "packages/shared/coverage/lcov.info", prefix: "packages/shared/" },
  { lcov: "packages/i18n/coverage/lcov.info", prefix: "packages/i18n/" },
  { lcov: "apps/mobile/coverage/lcov.info", prefix: "apps/mobile/" },
  { lcov: "functions/coverage/lcov.info", prefix: "functions/" },
];

/**
 * Rewrites every `SF:` path to be relative to the repo root, which is what
 * diff-cover matches against `git diff`. Runners write a path relative to
 * their own package (`SF:src/index.ts`) or, sometimes, an absolute one.
 */
export function normalizeLcov(content, prefix, repoRoot) {
  return content.replace(/^SF:(.*)$/gm, (_m, raw) => {
    let p = raw.trim();
    if (isAbsolute(p))
      return `SF:${relative(repoRoot, p).split("\\").join("/")}`;
    p = p.replace(/^\.\//, "");
    return p.startsWith(prefix) ? `SF:${p}` : `SF:${prefix}${p}`;
  });
}

/** Line coverage overall and per prefix, as a Markdown table. */
export function summarizeLcov(merged, prefixes) {
  const tally = new Map([["__overall__", { lh: 0, lf: 0 }]]);
  let bucket = null;
  for (const line of merged.split("\n")) {
    if (line.startsWith("SF:")) {
      const p = line.slice(3);
      bucket = prefixes.find((pre) => p.startsWith(pre)) ?? "other";
      if (!tally.has(bucket)) tally.set(bucket, { lh: 0, lf: 0 });
    } else if (bucket && (line.startsWith("LF:") || line.startsWith("LH:"))) {
      const n = Number.parseInt(line.slice(3), 10) || 0;
      const key = line.startsWith("LF:") ? "lf" : "lh";
      tally.get(bucket)[key] += n;
      tally.get("__overall__")[key] += n;
    }
  }
  const pct = ({ lh, lf }) => (lf ? ((100 * lh) / lf).toFixed(1) : "0.0");
  const row = (label, t) => `| ${label} | ${pct(t)}% (${t.lh}/${t.lf}) |`;
  const lines = [
    "| Scope | Line coverage |",
    "|---|---|",
    row("**Overall**", tally.get("__overall__")),
  ];
  for (const prefix of prefixes) {
    if (tally.has(prefix))
      lines.push(row("`" + prefix + "`", tally.get(prefix)));
  }
  return lines.join("\n") + "\n";
}

/** GitHub rejects a comment body over this many characters. */
export const GITHUB_COMMENT_LIMIT = 65536;
/** The default cut, leaving headroom under the hard cap. */
export const DEFAULT_COMMENT_LIMIT = 65000;

export const TRUNCATION_NOTICE = [
  "",
  "…",
  "",
  "<sub>**Comment truncated** — the per-file table exceeded GitHub's 65536-character limit. Download the `coverage-html` artifact from this run for the full report.</sub>",
  "",
].join("\n");

/**
 * Returns `body` unchanged when it fits, otherwise a cut-down body with the
 * notice appended. The cut is measured in bytes (an upper bound on characters),
 * and the notice is subtracted before cutting — appending it after would yield
 * a body that is still too long. A big diff is exactly when the table is
 * longest, so this is the case that must not fail the post.
 */
export function truncateComment(body, limit = DEFAULT_COMMENT_LIMIT) {
  if (Buffer.byteLength(body, "utf8") <= limit) return body;
  const keep = Math.max(
    0,
    limit - Buffer.byteLength(TRUNCATION_NOTICE, "utf8"),
  );
  // Drop a trailing partial UTF-8 sequence rather than emit U+FFFD mid-table.
  const cut = Buffer.from(body, "utf8")
    .subarray(0, keep)
    .toString("utf8")
    .replace(/\uFFFD+$/, "");
  return cut + TRUNCATION_NOTICE;
}

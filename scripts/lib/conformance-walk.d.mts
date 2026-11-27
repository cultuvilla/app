// Types for the walker's testable exports; the module stays plain .mjs (bare `node` in CI).
export interface Issue {
  path: string;
  code: string;
  message: string;
}
export interface Finding {
  id: string;
  issues: Issue[];
}
export interface TargetResult {
  path: string;
  total: number;
  bad: Finding[];
}
export interface WalkResult {
  targets: TargetResult[];
  orphans: Finding[];
  unmatched: string[];
  undeclared: string[];
  unmodeled: Map<string, { count: number; example: string }>;
}
export function templateRegex(path: string): RegExp;
export function display(path: string): string;
export function issuesOf(err: unknown): Issue[];
export function isDynamicKey(key: string): boolean;
export function normalizePath(path: string): string;
export function unmodeledPaths(raw: unknown, parsed: unknown, prefix?: string): string[];
export function walkConformance(
  db: unknown,
  options: { targets: readonly { path: string; converter: { fromFirestore(snap: unknown): unknown } }[]; collectionPaths: readonly string[] },
): Promise<WalkResult>;

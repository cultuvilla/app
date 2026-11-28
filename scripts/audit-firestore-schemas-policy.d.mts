// Types for the policy's testable exports; the module stays plain .mjs (bare `node` in CI).
import type { Finding, TargetResult } from './lib/conformance-walk.mjs';

export interface AllowlistEntry {
  signature: string;
  reason: string;
  envs?: string[];
}

export interface AuditResult {
  projectId: string;
  gitSha?: string;
  targets: TargetResult[];
  orphans: Finding[];
  unmatched: string[];
  undeclared: string[];
  unmodeled: Record<string, { count: number; example: string }>;
}
export interface Verdict {
  failures: { signature: string; detail: string }[];
  stale: { allowlist: string[]; baseline: string[] };
}
export const ALLOWLIST_PATH: string;
export const BASELINE_PATH: string;
export const BASELINE_REPO_PATH: string;
export const AUDIT_ENVS: string[];
export function driftSignature(template: string, issue: { path: string; code: string }): string;
export function readJson(file: string): unknown;
export function validateAllowlist(list: unknown): string[];
export function validateBaseline(baseline: unknown): string[];
export function evaluate(input: { env: string; result: AuditResult; allowlist: AllowlistEntry[]; baseline: Record<string, string[]> }): Verdict;
export function shrinkBaseline(baseline: Record<string, string[]>, env: string, seen: string[]): Record<string, string[]>;
export function ratchetGrowth(base: Record<string, string[]> | null, head: Record<string, string[]>): string[];
export function renderReport(input: { env: string; result: AuditResult; verdict: Verdict }): string;

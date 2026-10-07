// Types for the ops script's testable exports; the script stays plain .mjs (bare `node` in CI).
export interface Snapshot {
  [dimension: string]: unknown;
}
export interface Baseline {
  expected: Record<string, unknown>;
  exceptions?: Record<string, unknown[]>;
}
export const BASELINE_PATH: string;
export const LIST_DIMENSIONS: string[];
export const MAP_DIMENSIONS: string[];
export const DIMENSIONS: string[];
export function normalize<T>(value: T, ids: { project: string; number: number | string }): T;
export function expectedFor(baseline: Baseline, env: string): Snapshot;
export function diffSnapshot(actual: Snapshot, expected: Snapshot): string[];
export function validateBaseline(baseline: Baseline): string[];
export function draftBaseline(snapshots: Record<string, Snapshot>): Baseline;
export function exportedFunctionNames(indexSource: string): string[];
export function indexKey(index: {
  collectionGroup: string;
  queryScope?: string;
  fields: { fieldPath: string; order?: string; arrayConfig?: string; vectorConfig?: unknown }[];
}): string;
export function sha(text: string): string;

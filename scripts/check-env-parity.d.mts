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
export type Api = (url: string, init?: { method?: string; body?: string }) => Promise<Record<string, unknown>>;
export function paged(api: Api, url: string, key: string): Promise<unknown[]>;
export function configSnapshot(api: Api, project: string, number: number | string): Promise<Snapshot>;
export function backendHeld(api: Api, project: string, env: string): Promise<boolean>;
export function artifactProblems(
  api: Api,
  project: string,
  options?: { held?: boolean; readFile?: (path: string) => string },
): Promise<string[]>;
export function checkEnv(
  env: string,
  scope: 'config' | 'artifacts' | 'all',
  baseline: Baseline,
  api: Api,
  options?: { readFile?: (path: string) => string },
): Promise<string[]>;

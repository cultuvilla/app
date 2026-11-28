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
export function configDifferences(actual: Snapshot, env: string, baselines: Baseline[]): string[];
export function validateBaseline(baseline: Baseline): string[];
export function draftBaseline(snapshots: Record<string, Snapshot>): Baseline;
type Fields = Record<string, unknown>;
export function durationText(seconds: string | undefined | null): string;
export function backupScheduleLine(database: string, schedule: Fields): string;
export function lifecycleText(bucket: Fields): string;
export function bucketLine(bucket: Fields): string;
export function logBucketLine(bucket: Fields): string;
export function logSinkLine(sink: Fields): string;
export function bigQueryDatasetLine(dataset: Fields): string;
export function dataStoreLines(api: Api, project: string): Promise<string[]>;
export function exportedFunctionNames(indexSource: string): string[];
export function indexKey(index: {
  collectionGroup: string;
  queryScope?: string;
  fields: { fieldPath: string; order?: string; arrayConfig?: string; vectorConfig?: unknown }[];
}): string;
export function sha(text: string): string;
export interface ImageRef {
  location: string;
  project: string;
  repository: string;
  package: string;
  tag: string | null;
  digest: string | null;
}
export const TRANSIENT_FUNCTION_STATES: Set<string>;
export const IMAGE_CHECK_MAX_BUILD_AGE_MS: number;
export function parseImage(ref: string | undefined | null): ImageRef | null;
export function builtImage(build: { steps?: { args?: string[] }[] } | null | undefined): ImageRef | null;
export function servingRevisions(service: { trafficStatuses?: { type?: string; revision?: string; percent?: number }[] } | null | undefined): string[];
export function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]>;
export interface SettleOptions {
  attempts?: number;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}
export type Api = (url: string, init?: { method?: string; body?: string }) => Promise<Record<string, unknown>>;
export function accessToken(): Promise<string>;
export function client(token: string, project: string): Api;
export function paged(api: Api, url: string, key: string): Promise<unknown[]>;
export function configSnapshot(api: Api, project: string, number: number | string): Promise<Snapshot>;
export function backendHeld(api: Api, project: string, env: string): Promise<boolean>;
export function artifactProblems(
  api: Api,
  project: string,
  options?: { held?: boolean; readFile?: (path: string) => string; now?: number; settle?: SettleOptions },
): Promise<string[]>;
export function functionHealthProblems(
  api: Api,
  fn: Record<string, unknown>,
  options?: { now?: number; cache?: { builds: object; tags: object; versions: object } },
): Promise<string[]>;
export function settledFunctions(api: Api, project: string, options?: SettleOptions): Promise<Record<string, unknown>[]>;
export function checkEnv(
  env: string,
  scope: 'config' | 'artifacts' | 'all',
  baseline: Baseline,
  api: Api,
  options?: { readFile?: (path: string) => string; alsoBaselines?: Baseline[]; now?: number; settle?: SettleOptions },
): Promise<string[]>;

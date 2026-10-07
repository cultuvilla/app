// Types for the ops script's testable exports; the script stays plain .mjs (bare `node` in CI).
export const SMOKE_UID: string;
export const SMOKE_EMAIL: string;
export const SMOKE_ID: string;
export function smokePaths(municipalityId: string): string[];
export function uploadUrl(bucket: string, path: string): string;
export interface UploadResult {
  path: string;
  ok: boolean;
  status: string;
}
export interface UploadOptions {
  attempts?: number;
  delayMs?: number;
  fetchImpl?: (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number }>;
  sleepImpl?: (ms: number) => Promise<void>;
}
export function isRetryable(status: number): boolean;
export function upload(bucket: string, path: string, token: string, options?: UploadOptions): Promise<UploadResult>;
export function runSmoke(args: {
  bucket: string;
  paths: string[];
  token: string;
  uploadImpl?: (bucket: string, path: string, token: string) => Promise<UploadResult>;
}): Promise<UploadResult[]>;
export function failureMessage(env: string, results: UploadResult[]): string | null;

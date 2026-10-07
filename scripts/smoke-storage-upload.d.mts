// Types for the ops script's testable exports; the script stays plain .mjs (bare `node` in CI).
export const SMOKE_UID: string;
export const SMOKE_EMAIL: string;
export const SMOKE_ID: string;
export function smokePaths(municipalityId: string): string[];
export function uploadUrl(bucket: string, path: string): string;

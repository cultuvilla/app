// Types for the ops script's testable exports; the script stays plain .mjs (bare `node` in CI).
export const HOSTS: Record<'dev' | 'beta' | 'prod', string[]>;
export const PATHS: string[];
export function urlsFor(env: string): string[];

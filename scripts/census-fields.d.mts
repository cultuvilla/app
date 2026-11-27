// Types for the census's testable exports; the script stays plain .mjs (bare `node`).
export interface FieldStats {
  types: Set<string>;
  docCount: number;
}
export interface CensusRow {
  path: string;
  types: string;
  pct: number;
  docCount: number;
}
export function fsType(v: unknown): string;
export function tallyDoc(data: unknown, stats: Map<string, FieldStats>, typeOf?: (v: unknown) => string): void;
export function censusRows(stats: Map<string, FieldStats>, scanned: number): CensusRow[];

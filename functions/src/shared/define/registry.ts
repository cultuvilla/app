// Every function this codebase deploys is defined through this directory, and
// each definition records the name it is exported under. That name is what a
// gateway routes by (docs/plans/ready/cloud-run-gateways.md), so
// `definedFunctions.test.ts` holds it to the `index.ts` export name.

export type DefinedKind = 'callable' | 'documentTrigger' | 'schedule' | 'http' | 'storageTrigger';

export interface DefinedFunction {
  kind: DefinedKind;
  fn: unknown;
}

const defined = new Map<string, DefinedFunction>();

export function register<Fn>(name: string, kind: DefinedKind, fn: Fn): Fn {
  defined.set(name, { kind, fn });
  return fn;
}

export function definedFunctions(): ReadonlyMap<string, DefinedFunction> {
  return defined;
}

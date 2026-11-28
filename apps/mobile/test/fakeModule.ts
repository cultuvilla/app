/**
 * The defaults a fake carries beyond a bare `jest.fn()`: only the exports the
 * code under test needs to return something specific. Typed against the real
 * module, so a key the module does not export, or a default of the wrong
 * shape, is a type error.
 */
export type FakeDefaults<M> = { [K in keyof M]?: M[K] };

/**
 * A fake of the module `loadActual` returns, with exactly its keys: every
 * function export becomes a `jest.fn` running its default (or returning
 * `undefined`), or is the default itself when that is already a `jest.fn`;
 * every other export — constants, schemas, enums — is the real value unless a
 * default replaces it. A default for a key the module does not export throws,
 * which catches the phantoms `tsc` cannot see through a `require`.
 *
 * Built from the real module rather than listed by hand: a hand-written
 * `jest.mock` factory hides every export it does not name, so a renamed or
 * added service export leaves it silently stale. The app's lint rejects a new
 * one (`SERVICE_HAND_WRITTEN_FACTORY` in eslint.config.mjs).
 *
 * The real module loads on first access, not when the fake is created. Services
 * import each other, so a fake is usually created while another real module is
 * half-evaluated; loading eagerly there re-enters the shared models' import
 * cycles from an order the app never uses, and a schema reads as `undefined`.
 */
export function fakeModule<M extends object>(loadActual: () => M, defaults: () => FakeDefaults<M> = () => ({})): M {
  let built: Record<string, unknown> | undefined;
  const materialize = (): Record<string, unknown> => {
    built ??= buildFake(loadActual(), defaults());
    return built;
  };

  // Every module this fakes is TypeScript, so an ES module: answering
  // `__esModule` without loading keeps babel's import interop from forcing it.
  return new Proxy({} as Record<string | symbol, unknown>, {
    get: (_target, key) => (key === '__esModule' ? true : Reflect.get(materialize(), key)),
    set: (_target, key, value) => Reflect.set(materialize(), key, value),
    has: (_target, key) => key === '__esModule' || Reflect.has(materialize(), key),
    ownKeys: () => Reflect.ownKeys(materialize()),
    getOwnPropertyDescriptor: (_target, key) => Reflect.getOwnPropertyDescriptor(materialize(), key),
    defineProperty: (_target, key, descriptor) => Reflect.defineProperty(materialize(), key, descriptor),
    deleteProperty: (_target, key) => Reflect.deleteProperty(materialize(), key),
  }) as M;
}

/**
 * `fakeModule` of a module named by its specifier — the shape a `jest.mock`
 * factory wants, since it may not reference an import:
 *
 *   jest.mock('@cultuvilla/shared/services/xService', () =>
 *     jest.requireActual<typeof import('../../test/fakeModule')>('../../test/fakeModule')
 *       .fakeService<typeof import('@cultuvilla/shared/services/xService')>(
 *         '@cultuvilla/shared/services/xService',
 *         () => ({ getX: async () => null }),
 *       ),
 *   );
 *
 * Program a fake per test with `jest.mocked(getX).mockResolvedValue(...)`.
 */
export function fakeService<M extends object>(specifier: string, defaults?: () => FakeDefaults<M>): M {
  return fakeModule(() => jest.requireActual<M>(specifier), defaults);
}

function buildFake<M extends object>(actual: M, defaults: FakeDefaults<M>): Record<string, unknown> {
  const actualKeys = Object.keys(actual);
  const phantoms = Object.keys(defaults).filter((key) => !actualKeys.includes(key));
  if (phantoms.length > 0) {
    throw new Error(`fakeModule: default for ${phantoms.join(', ')}, which the module does not export`);
  }

  const fake: Record<string, unknown> = { __esModule: true };
  for (const key of actualKeys) {
    const real = (actual as Record<string, unknown>)[key];
    const preset = (defaults as Record<string, unknown>)[key];
    if (typeof real === 'function') {
      // A default that is already a mock is the export itself, so a test that
      // programs the export programs what the factory's other defaults call.
      fake[key] = jest.isMockFunction(preset) ? preset : jest.fn(preset as ((...args: unknown[]) => unknown) | undefined);
    } else {
      fake[key] = key in defaults ? preset : real;
    }
  }
  return fake;
}

/**
 * A value holding only the fields a test names, typed as the whole. Reading a
 * field it does not name yields `undefined`, which fails loudly instead of
 * passing on a plausible default.
 */
export function partialOf<T>(fields: Partial<NoInfer<T>>): T {
  return fields as T;
}

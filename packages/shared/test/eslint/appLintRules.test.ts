// Pins the invariant lint gate of the two client apps (AGENTS.md invariants 1
// and 5): no Firebase outside a service and the boundary files, no `any`, no
// dead `eslint-disable`. Widening an exemption must be a visible diff here.
// Also pins the rules every workspace shares: Firebase error codes compared
// only through firebaseErrorCode().
import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';
import * as mobileConfig from '../../../../apps/mobile/eslint.config.mjs';
import * as studioConfig from '../../../../apps/studio/eslint.config.mjs';

interface AppConfig {
  RAW_SDK: string;
  SEAM_INTERNALS: string;
  BOUNDARY: string[];
  RAW_SDK_EXEMPT?: string[];
  SEAM_ALLOWLIST?: string[];
  TEST_FILES?: string[];
  SERVICE_HAND_WRITTEN_FACTORY?: { selector: string; message: string };
  HAND_WRITTEN_FACTORY_RATCHET?: Record<string, number>;
}
const mobile = mobileConfig as AppConfig;
const studio = studioConfig as AppConfig;

const appsDir = resolve(import.meta.dirname, '../../../../apps');

const repoDir = resolve(appsDir, '..');
type Workspace = 'mobile' | 'studio' | 'shared' | 'functions';
const workspaceDir: Record<Workspace, string> = {
  mobile: resolve(appsDir, 'mobile'),
  studio: resolve(appsDir, 'studio'),
  shared: resolve(repoDir, 'packages/shared'),
  functions: resolve(repoDir, 'functions'),
};

async function lint(app: Workspace, filePath: string, code: string): Promise<string[]> {
  const cwd = workspaceDir[app];
  const eslint = new ESLint({ cwd, overrideConfigFile: resolve(cwd, 'eslint.config.mjs') });
  const results = await eslint.lintText(code, { filePath: resolve(cwd, filePath) });
  return results.flatMap((r) => r.messages).map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

const RESTRICTED = '@typescript-eslint/no-restricted-imports';
const RAW = "import type { QueryDocumentSnapshot } from 'firebase/firestore';\n";
const NATIVE = "import { getAuth } from '@react-native-firebase/auth';\n";
const SEAM = "import { doc } from '@cultuvilla/shared/firebase/sdk/firestore';\n";
const REFS = "import { userDoc } from '@cultuvilla/shared/firebase/refs/client';\n";
const ALLOWED =
  "import { firebaseErrorCode } from '@cultuvilla/shared/firebase/sdk/errors';\n" +
  "import type { User } from '@cultuvilla/shared/firebase';\n" +
  "import { getMunicipality } from '@cultuvilla/shared/services/municipalityService';\n";

describe('app lint gate: exemption lists', () => {
  it('mobile exempts exactly the boundary, bootstrap and native-only files', () => {
    expect(mobile.BOUNDARY).toEqual(['lib/auth/AuthContext.tsx', 'lib/firebaseInit.ts']);
    expect(mobile.RAW_SDK_EXEMPT).toEqual([
      'app.config.ts',
      'lib/appCheck.ts',
      'lib/observability/analytics.ts',
      'lib/observability/__tests__/analytics.native.test.ts',
    ]);
    expect(mobile.SEAM_ALLOWLIST).toEqual([
      'lib/auth/**',
      'lib/observability/errorBridge.ts',
      'lib/useOwnerSummary.ts',
      'lib/__tests__/useOwnerSummary.test.ts',
      'components/feature/__tests__/LiveAvatar.test.tsx',
    ]);
  });

  it('studio exempts only its auth boundary', () => {
    expect(studio.BOUNDARY).toEqual(['src/auth/StudioAuth.tsx']);
  });

  it('both apps restrict the same imports', () => {
    expect(studio.RAW_SDK).toBe(mobile.RAW_SDK);
    expect(studio.SEAM_INTERNALS).toBe(mobile.SEAM_INTERNALS);
  });
});

describe.each(['mobile', 'studio'] as const)('app lint gate: %s app code', (app) => {
  const file = app === 'mobile' ? 'components/Probe.tsx' : 'src/screens/Probe.tsx';

  it.each([
    ['a raw JS SDK type import', RAW],
    ['a native SDK import', NATIVE],
    ['the SDK seam', SEAM],
    ['the refs', REFS],
  ])('rejects %s', async (_label, code) => {
    expect(await lint(app, file, code)).toEqual([RESTRICTED]);
  });

  it('accepts services, the shared firebase types and sdk/errors', async () => {
    expect(await lint(app, file, ALLOWED)).toEqual([]);
  });

  it('rejects `any`', async () => {
    expect(await lint(app, file, 'export const x: any = 1;\n')).toEqual(['@typescript-eslint/no-explicit-any']);
  });

  it('rejects an eslint-disable that silences nothing', async () => {
    const code = '// eslint-disable-next-line @typescript-eslint/no-explicit-any\nexport const x = 1;\n';
    expect(await lint(app, file, code)).toHaveLength(1);
  });
});

describe('app lint gate: mobile exemptions', () => {
  it('lets the seam allowlist use the seam, but not a raw SDK', async () => {
    expect(await lint('mobile', 'lib/auth/legacySession.ts', SEAM)).toEqual([]);
    expect(await lint('mobile', 'lib/auth/legacySession.ts', RAW)).toEqual([RESTRICTED]);
  });

  it('lets native analytics use a raw SDK, but not the seam', async () => {
    expect(await lint('mobile', 'lib/observability/analytics.ts', NATIVE)).toEqual([]);
    expect(await lint('mobile', 'lib/observability/analytics.ts', SEAM)).toEqual([RESTRICTED]);
  });

  it('lets the auth boundary use both', async () => {
    expect(await lint('mobile', 'lib/auth/AuthContext.tsx', RAW + SEAM)).toEqual([]);
  });
});

// The device SDK reports `firestore/permission-denied`, the JS SDK the tests
// run on `permission-denied` (and the reverse for callables): a raw `.code`
// compare is green in every suite and dead in one of the two.
describe.each([
  ['mobile', 'components/Probe.tsx'],
  ['studio', 'src/screens/Probe.tsx'],
  // Type-checked configs: the probe must be a file their tsconfig contains.
  ['shared', 'src/services/villageWrappedService.ts'],
  ['functions', 'src/shared/notFound.ts'],
] as const)('bare Firebase error code ban: %s', (app, file) => {
  const BAN = 'no-restricted-syntax';
  const probe = (body: string) =>
    `import { firebaseErrorCode } from '@cultuvilla/shared/firebase/sdk/errors';\n` +
    `export const probe = (error: { code?: string }, result: { status: string }): unknown => {\n${body}\n};\n`;
  // The ban, and anything that kept the rules from running at all.
  const bans = async (body: string) =>
    (await lint(app, file, probe(body))).filter((r) => r === BAN || r.startsWith('fatal: '));

  // A type-checked config builds its program on the first lint; doing that here
  // keeps the first case from paying for it.
  beforeAll(async () => {
    await lint(app, file, probe('return null;'));
  }, 120_000);

  it.each([
    "return error.code === 'permission-denied';",
    "return error?.code !== 'not-found';",
    "return 'unauthenticated' === error.code;",
    "return error['code'] === 'unavailable';",
    "return error.code === 'firestore/permission-denied';",
    "return error.code === 'functions/not-found';",
    "return firebaseErrorCode(error) === 'functions/not-found';",
    "switch (error.code) { case 'already-exists': return 1; default: return 0; }",
    "switch (firebaseErrorCode(error)) { case 'firestore/aborted': return 1; default: return 0; }",
    "return ['unavailable', 'deadline-exceeded'].includes(error.code);",
  ])('rejects %s', async (body) => {
    expect(await bans(body)).toEqual([BAN]);
  }, 60_000);

  it.each([
    "return firebaseErrorCode(error) === 'permission-denied';",
    "switch (firebaseErrorCode(error)) { case 'not-found': return 1; default: return 0; }",
    "return result.status === 'permission-denied';",
    "return error.code === 'auth/cancelled';",
    "return error.code === 'storage/unauthorized';",
    "return error.code === 'ERR_REQUEST_CANCELED';",
  ])('allows %s', async (body) => {
    expect(await bans(body)).toEqual([]);
  }, 60_000);
});

// A committed `.only` skips every other test in its file without failing, and a
// test with no assertion passes whatever the code under it does.
describe('app lint gate: mobile tests', () => {
  const TEST = 'components/__tests__/Probe.test.tsx';

  it('applies to every test file', () => {
    expect(mobile.TEST_FILES).toEqual(['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}']);
  });

  it.each([
    ['a focused test', "it.only('x', () => { expect(1).toBe(1); });\n", 'jest/no-focused-tests'],
    ['a focused suite', "describe.only('x', () => { it('y', () => { expect(1).toBe(1); }); });\n", 'jest/no-focused-tests'],
    ['a test that asserts nothing', "it('x', () => { const n = 1; void n; });\n", 'jest/expect-expect'],
  ])('rejects %s', async (_label, code, rule) => {
    expect(await lint('mobile', TEST, code)).toEqual([rule]);
  });

  it.each([
    ['an expect', "it('x', () => { expect(1).toBe(1); });\n"],
    ['a findBy query', "it('x', async () => { await findByText('y'); });\ndeclare const findByText: (s: string) => Promise<unknown>;\n"],
  ])('accepts a test with %s', async (_label, code) => {
    expect(await lint('mobile', TEST, code)).toEqual([]);
  });

  it('leaves app code alone', async () => {
    expect(await lint('mobile', 'components/Probe.tsx', "it.only('x', () => {});\n")).toEqual([]);
  });
});

// A hand-written jest.mock factory for a shared service hides every export it
// does not list. New ones are built by fakeService (apps/mobile/test/fakeModule.ts);
// the ones that predate the rule are a ratchet that only goes down.
describe('app lint gate: hand-written service factories', () => {
  const TEST = 'components/__tests__/Probe.test.tsx';
  const SERVICE = '@cultuvilla/shared/services/organizationService';
  const BAN = 'no-restricted-syntax';
  const ratchet = mobile.HAND_WRITTEN_FACTORY_RATCHET ?? {};

  // Lower this with every file you convert; it may never go up.
  const CEILING = 189;

  it.each([
    ['an object factory', `jest.mock('${SERVICE}', () => ({ getOrganization: jest.fn() }));\n`],
    ['a block factory', `jest.mock('${SERVICE}', () => { return { getOrganization: jest.fn() }; });\n`],
    ['a doMock factory', `jest.doMock('${SERVICE}', () => ({}));\n`],
    ['a factory for the services barrel', "jest.mock('@cultuvilla/shared/services', () => ({}));\n"],
  ])('rejects %s', async (_label, code) => {
    expect(await lint('mobile', TEST, code)).toEqual([BAN]);
  });

  it.each([
    [
      'a factory built by fakeService',
      `jest.mock('${SERVICE}', () => jest.requireActual('../../test/fakeModule').fakeService('${SERVICE}'));\n`,
    ],
    [
      'a factory built by fakeModule',
      `jest.mock('${SERVICE}', () => { const { fakeModule } = jest.requireActual('../../test/fakeModule'); return fakeModule(() => jest.requireActual('${SERVICE}')); });\n`,
    ],
    ['a bare automock', `jest.mock('${SERVICE}');\n`],
    ['a factory for a module that is not a service', "jest.mock('expo-router', () => ({ router: {} }));\n"],
  ])('accepts %s', async (_label, code) => {
    expect(await lint('mobile', TEST, code)).toEqual([]);
  });

  it('keeps the bare error-code ban on the files the ratchet exempts', async () => {
    // A bracketed Expo Router path while one is left, so the glob escaping is exercised too.
    const file = Object.keys(ratchet).find((path) => path.includes('[')) ?? Object.keys(ratchet)[0];
    if (!file) throw new Error('expected a file in the ratchet');
    expect(await lint('mobile', file, `jest.mock('${SERVICE}', () => ({}));\n`)).toEqual([]);
    expect(await lint('mobile', file, "declare const e: { code: string };\nif (e.code === 'permission-denied') {}\n")).toEqual([BAN]);
  });

  it('pins every exempt file to the factories it holds, and the total to the ceiling', async () => {
    const cwd = workspaceDir.mobile;
    const eslint = new ESLint({
      cwd,
      overrideConfigFile: resolve(cwd, 'eslint.config.mjs'),
      overrideConfig: [{ files: ['**/*.{ts,tsx}'], rules: { [BAN]: ['error', mobile.SERVICE_HAND_WRITTEN_FACTORY] } }],
    });
    const results = await eslint.lintFiles(Object.keys(ratchet));
    const actual = Object.fromEntries(
      results.map((r) => [
        r.filePath.slice(cwd.length + 1),
        r.messages.filter((m) => m.message === mobile.SERVICE_HAND_WRITTEN_FACTORY?.message).length,
      ]),
    );
    // A converted file drops out of apps/mobile/test/handWrittenServiceFactories.json;
    // a lower count is written there, and CEILING above comes down with it.
    expect(actual).toEqual(ratchet);
    expect(Object.values(ratchet).every((count) => count > 0)).toBe(true);
    expect(Object.values(ratchet).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(CEILING);
  }, 120_000);
});

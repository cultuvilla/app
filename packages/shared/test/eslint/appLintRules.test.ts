// Pins the invariant lint gate of the two client apps (AGENTS.md invariants 1
// and 5): no Firebase outside a service and the boundary files, no `any`, no
// dead `eslint-disable`. Widening an exemption must be a visible diff here.
import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import * as mobileConfig from '../../../../apps/mobile/eslint.config.mjs';
import * as studioConfig from '../../../../apps/studio/eslint.config.mjs';

interface AppConfig {
  RAW_SDK: string;
  SEAM_INTERNALS: string;
  BOUNDARY: string[];
  RAW_SDK_EXEMPT?: string[];
  SEAM_ALLOWLIST?: string[];
}
const mobile = mobileConfig as AppConfig;
const studio = studioConfig as AppConfig;

const appsDir = resolve(import.meta.dirname, '../../../../apps');

async function lint(app: 'mobile' | 'studio', filePath: string, code: string): Promise<string[]> {
  const cwd = resolve(appsDir, app);
  const eslint = new ESLint({ cwd, overrideConfigFile: resolve(cwd, 'eslint.config.mjs') });
  const results = await eslint.lintText(code, { filePath: resolve(cwd, filePath) });
  return results.flatMap((r) => r.messages).map((m) => m.ruleId ?? m.message);
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

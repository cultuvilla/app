import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// `functions/` keeps its own dependency tree (npm, not the pnpm workspace), and
// `firebase deploy --only functions:<one>` runs an esbuild predeploy over the
// WHOLE functions codebase, not just the function being deployed. So any
// workflow that deploys a function — even one — must install those deps first,
// or the bundle fails to resolve `resend` and `satori` and the deploy dies in
// predeploy.
//
// This is not hypothetical: the old deploy-panel.yml shipped without the step and
// every panel deploy failed at the callable, leaving the panel serving the
// previous snapshot. A new workflow that deploys functions belongs in this list.

const repoRoot = resolve(__dirname, '../../../..');
const read = (path: string): string => readFileSync(resolve(repoRoot, path), 'utf-8');

const WORKFLOWS = ['.github/workflows/deploy-firebase.yml'];

const runnable = (yaml: string): string =>
  yaml
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

describe('workflows that deploy Cloud Functions install the functions deps first', () => {
  for (const workflow of WORKFLOWS) {
    it(`${workflow} runs npm ci in functions/ before any functions deploy`, () => {
      const yaml = runnable(read(workflow));
      expect(yaml).toMatch(/firebase deploy --only functions/);

      const install = yaml.indexOf('working-directory: functions');
      expect(install, 'no `working-directory: functions` install step').toBeGreaterThan(-1);
      expect(yaml.slice(0, install)).toMatch(/npm ci/);

      const deploy = yaml.indexOf('firebase deploy --only functions');
      expect(install, 'the install step must come before the deploy').toBeLessThan(deploy);
    });
  }
});

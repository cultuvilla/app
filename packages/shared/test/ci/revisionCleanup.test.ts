import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Each functions deploy leaves a Cloud Run revision per function behind, and
// they count against the regional CPU quota until deleted (Órdago: 1,529 of
// them, and every deploy failed). The deploy deletes a bounded batch after
// itself; this pins where and how.

const repoRoot = resolve(__dirname, '../../../..');
const deploy = readFileSync(resolve(repoRoot, '.github/workflows/deploy-firebase.yml'), 'utf-8');
const NAME = '- name: Clean up old Cloud Run revisions';
const at = deploy.indexOf(NAME);
const next = deploy.indexOf('- name:', at + NAME.length);
const step = deploy.slice(at, next === -1 ? undefined : next);

describe('deploy-firebase.yml revision cleanup', () => {
  it('runs after the functions deploy', () => {
    expect(at).toBeGreaterThan(deploy.indexOf('- name: Deploy Cloud Functions'));
    expect(deploy.indexOf('- name: Deploy Cloud Functions')).toBeGreaterThan(-1);
  });

  it('runs after a failed deploy too, and never fails the deploy', () => {
    expect(step).toMatch(/if: \$\{\{ !cancelled\(\)/);
    expect(step).toMatch(/continue-on-error: true/);
  });

  it('applies a bounded batch, and not on prod', () => {
    expect(step).toMatch(/cleanup-cloudrun-revisions\.mjs --env="\$FIREBASE_ALIAS" --apply --max-deletes=\d+ --max-minutes=\d+/);
    expect(step).toContain("inputs.firebase_alias != 'prod'");
    expect(step).not.toContain('--confirm');
  });
});

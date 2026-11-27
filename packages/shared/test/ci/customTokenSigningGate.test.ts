import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROLE, selfSignBindingExists } from '../../../../scripts/check-custom-token-signing.mjs';

// getAuth().createCustomToken() does not sign locally — it calls the IAM
// Credentials API to sign as the caller's own identity, so the Cloud Functions
// runtime SA needs `iam.serviceAccounts.signBlob` on ITSELF
// (roles/iam.serviceAccountTokenCreator). The Firebase CLI does NOT grant this at
// deploy time, and the Auth emulator stubs custom-token signing, so a project
// missing the binding passes the whole test suite, deploys clean, and then fails
// EVERY custom-token sign-in at runtime with auth/insufficient-permission.
//
// That is exactly how email-code sign-in (verifyAuthOtpCode) reached production
// broken — zero successful verifications for the entire life of the feature.
// The reusable deploy workflow now gates on scripts/check-custom-token-signing.mjs
// before any `firebase deploy`. This invariant test fails the build if that gate
// is removed, narrowed to a subset of envs, or reordered to run after a deploy.
// Mirrors conformanceGate.test.ts (workflow parsed as text, no YAML dep).

const repoRoot = resolve(__dirname, '../../../..');
const workflowPath = resolve(repoRoot, '.github/workflows/deploy-firebase.yml');
const workflow = readFileSync(workflowPath, 'utf-8');

function stepBlockContaining(needle: string): string {
  const blocks = workflow.split(/^ {6}- name:/m);
  const match = blocks.find((b) => b.includes(needle));
  if (!match) throw new Error(`No workflow step contains "${needle}"`);
  return match;
}

const SCRIPT = 'check-custom-token-signing.mjs';

describe('deploy custom-token signing gate invariant', () => {
  it('runs the signing check as a step in the deploy pipeline, against the target env', () => {
    const gate = stepBlockContaining(SCRIPT);
    expect(gate).toContain('--env "$FIREBASE_ALIAS"');
  });

  it('runs for every env, including dev', () => {
    // Unlike the conformance gate, this one must NOT be env-guarded: the binding
    // is a per-project infrastructure fact, and catching it on dev is the whole
    // point — dev is where a new environment gets exercised first.
    const gate = stepBlockContaining(SCRIPT);
    expect(gate).not.toMatch(/^\s*if:/m);
  });

  it('runs before any firebase deploy, so a misconfigured project blocks the deploy', () => {
    const gatePos = workflow.indexOf(SCRIPT);
    const firstDeployPos = workflow.search(/^\s*run: firebase deploy/m);
    expect(gatePos, 'signing gate step not found').toBeGreaterThanOrEqual(0);
    expect(firstDeployPos, '`firebase deploy` step not found').toBeGreaterThanOrEqual(0);
    expect(gatePos).toBeLessThan(firstDeployPos);
  });
});

describe('selfSignBindingExists', () => {
  const sa = '123-compute@developer.gserviceaccount.com';
  const member = `serviceAccount:${sa}`;

  it('accepts a self-binding of the token-creator role', () => {
    expect(selfSignBindingExists({ bindings: [{ role: ROLE, members: [member] }] }, sa)).toBe(true);
  });

  it('accepts a self-binding alongside other members on the same role', () => {
    const policy = {
      bindings: [{ role: ROLE, members: ['serviceAccount:other@x.iam.gserviceaccount.com', member] }],
    };
    expect(selfSignBindingExists(policy, sa)).toBe(true);
  });

  it('rejects an empty policy — the state that broke production', () => {
    expect(selfSignBindingExists({}, sa)).toBe(false);
  });

  it('rejects the token-creator role granted to a DIFFERENT principal', () => {
    // The prod failure mode precisely: firebase-adminsdk-fbsvc@ held the role,
    // the compute default SA (which actually runs the functions) did not.
    const policy = {
      bindings: [{ role: ROLE, members: ['serviceAccount:firebase-adminsdk-fbsvc@p.iam.gserviceaccount.com'] }],
    };
    expect(selfSignBindingExists(policy, sa)).toBe(false);
  });

  it('rejects a self-binding on some other role', () => {
    const policy = { bindings: [{ role: 'roles/iam.serviceAccountUser', members: [member] }] };
    expect(selfSignBindingExists(policy, sa)).toBe(false);
  });
});

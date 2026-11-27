import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The strict Zod converter (makeConverter -> schema.parse) throws on read when a
// stored doc is missing a newly-required field, crashing every screen that reads
// that collection. A schema change promoted to beta/prod WITHOUT a matching
// backfill therefore ships a live crash. The reusable deploy workflow guards
// against this with a data-conformance gate that walks the target env's live
// docs through the shipped converters BEFORE any `firebase deploy`, failing the
// deploy if the data doesn't match.
//
// This invariant test fails the build if that gate is ever removed, un-guarded,
// or reordered to run after a deploy step — so the protection can't silently rot.
// Parsed as text (no YAML dep) in the same spirit as collectionGroupIndexes.test.
// See AGENTS.md "Backfill dev when a schema field is added".

const repoRoot = resolve(__dirname, '../../../..');
const workflowPath = resolve(repoRoot, '.github/workflows/deploy-firebase.yml');
const workflow = readFileSync(workflowPath, 'utf-8');

// Split the steps list into per-step blocks so `if:`/`run:` can be attributed to
// the right step. Each step starts at a `- name:` line; everything up to the next
// one belongs to it.
function stepBlockContaining(needle: string): string {
  const blocks = workflow.split(/^ {6}- name:/m);
  const match = blocks.find((b) => b.includes(needle));
  if (!match) throw new Error(`No workflow step contains "${needle}"`);
  return match;
}

describe('deploy conformance gate invariant', () => {
  it('runs the conformance check as a step in the deploy pipeline, against the target env', () => {
    const gate = stepBlockContaining('check-dev-conformance.mjs');
    // Passes the alias through so it validates the TARGET project's live data,
    // not a hardcoded env.
    expect(gate).toContain('--env "$FIREBASE_ALIAS"');
  });

  it('is guarded to beta/prod (skips dev)', () => {
    // Dev drift is transient and caught manually; the gate must not run for dev,
    // whose WIF SA may lack Firestore read and whose data churns constantly.
    const gate = stepBlockContaining('check-dev-conformance.mjs');
    expect(gate).toMatch(/if:.*inputs\.firebase_alias != 'dev'/);
  });

  it('runs before any firebase deploy, so a nonconforming env blocks the whole deploy', () => {
    const gatePos = workflow.indexOf('check-dev-conformance.mjs');
    // Anchor on the actual run command (`run: firebase deploy`), not the string
    // "firebase deploy" which also appears in an earlier explanatory comment.
    const firstDeployPos = workflow.search(/^\s*run: firebase deploy/m);
    expect(gatePos, 'conformance gate step not found').toBeGreaterThanOrEqual(0);
    expect(firstDeployPos, '`firebase deploy` step not found').toBeGreaterThanOrEqual(0);
    expect(gatePos).toBeLessThan(firstDeployPos);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COLLECTIONS } from '../../src/firebase/refs/collections';
import { conformanceTargets } from '../../src/firebase/refs/admin';
import { adminConverter } from '../../src/firebase/converters/sdkAdapters.admin';

// The conformance gate (scripts/check-dev-conformance.mjs) walks
// `conformanceTargets`, which refs/admin.ts derives from the collection table.
// It used to walk a third, hand-written list that drifted from the refs: two
// vocabulary collections shipped unregistered, and seat tokens, the roster
// audit log and block lists were never walked at all. Declaring a collection in
// refs/collections.ts is now the whole registration.

const repoRoot = resolve(__dirname, '../../../..');
const gate = readFileSync(resolve(repoRoot, 'scripts/check-dev-conformance.mjs'), 'utf-8');

describe('conformance gate registry', () => {
  it('targets every collection the table gives a schema, subcollections at any depth included', () => {
    const withSchema = Object.values(COLLECTIONS).filter((def) => def.schema !== null).map((def) => def.path);
    expect(conformanceTargets.map((t) => t.path).sort()).toEqual([...withSchema].sort());
  });

  it('parses each target with the converter its readers use', () => {
    for (const def of Object.values(COLLECTIONS)) {
      if (def.schema === null) continue;
      const target = conformanceTargets.find((t) => t.path === def.path);
      expect([def.path, target?.converter === adminConverter(def.schema)]).toEqual([def.path, true]);
    }
  });

  it('walks the subcollections the hand-written registry missed', () => {
    const paths = conformanceTargets.map((t) => t.path);
    expect(paths).toEqual(expect.arrayContaining([
      'events/{eventId}/seatTokens',
      'events/{eventId}/registrationEvents',
      'users/{userId}/blockedUsers',
      'organizations/{organizationId}/messages/{messageId}/reads',
    ]));
  });

  it('reads its targets from refs/admin instead of keeping its own list', () => {
    expect(gate).toMatch(/import \{[^}]*\bconformanceTargets\b[^}]*\} from '@cultuvilla\/shared\/firebase\/refs\/admin'/);
    expect(gate).not.toMatch(/\bREGISTRY\b/);
  });
});

// Trigger tests for syncVocabularyDefinitionCount.
//
// definitionCount is not cosmetic: firestore.rules reads it to decide whether
// the author of a headword may still withdraw it, so "reaches zero when the
// last definition goes" and "a hidden definition does not hold an empty
// headword hostage" are security-relevant, not display details.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { syncVocabularyDefinitionCount } from '../../../vocabulary/syncVocabularyDefinitionCount';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrapped = ft.wrap(syncVocabularyDefinitionCount);

const MUNICIPALITY_ID = 'm1';
const TERM_ID = `${MUNICIPALITY_ID}__esbardo`;

interface DefinitionDoc {
  municipalityId: string;
  termId: string;
  status: 'active' | 'hidden';
}

function definition(status: 'active' | 'hidden' = 'active', termId = TERM_ID): DefinitionDoc {
  return { municipalityId: MUNICIPALITY_ID, termId, status };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value ? (value as Record<string, unknown>) : {};
}

async function fire(
  before: DefinitionDoc | null,
  after: DefinitionDoc | null,
  definitionId = 'def-1',
): Promise<void> {
  const path = `vocabularyDefinitions/${definitionId}`;
  const change = ft.makeChange(
    ft.firestore.makeDocumentSnapshot(asRecord(before), path),
    ft.firestore.makeDocumentSnapshot(asRecord(after), path),
  );
  await wrapped({ data: change, params: { definitionId } });
}

async function seedTerm(count = 0): Promise<void> {
  await admin.firestore().doc(`vocabularyTerms/${TERM_ID}`).set({ definitionCount: count });
}

async function definitionCount(): Promise<number> {
  const snap = await admin.firestore().doc(`vocabularyTerms/${TERM_ID}`).get();
  return snap.get('definitionCount') as number;
}

beforeAll(async () => {
  await resetEmulators();
});

beforeEach(async () => {
  await resetEmulators();
});

afterAll(() => {
  ft.cleanup();
});

describe('syncVocabularyDefinitionCount', () => {
  it('increments when a definition is created', async () => {
    await seedTerm(0);
    await fire(null, definition());
    expect(await definitionCount()).toBe(1);
  });

  it('decrements to zero when the last definition is deleted', async () => {
    await seedTerm(1);
    await fire(definition(), null);
    expect(await definitionCount()).toBe(0);
  });

  it('decrements when a definition is hidden — a hidden meaning is not visible to the pueblo', async () => {
    await seedTerm(1);
    await fire(definition('active'), definition('hidden'));
    expect(await definitionCount()).toBe(0);
  });

  it('increments again when a hidden definition is unhidden', async () => {
    await seedTerm(0);
    await fire(definition('hidden'), definition('active'));
    expect(await definitionCount()).toBe(1);
  });

  it('does nothing when a hidden definition is deleted — it was never counted', async () => {
    await seedTerm(3);
    await fire(definition('hidden'), null);
    expect(await definitionCount()).toBe(3);
  });

  it('does nothing on an edit that leaves the definition active', async () => {
    await seedTerm(2);
    await fire(definition('active'), definition('active'));
    expect(await definitionCount()).toBe(2);
  });

  it('is a no-op when the term is already gone, rather than retrying forever', async () => {
    await expect(fire(definition(), null)).resolves.toBeUndefined();
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  _resetFirebaseForTests,
  getDb,
  getAuth,
  getFirebaseApp,
  getFirebaseFunctions,
  getFirebaseStorage,
  initFirebase,
} from '../../src/firebase';

// initFirebase replaces the previous module-load-time singleton with a
// config-injected init that the host app calls once. This decouples the
// shared package from Next.js's `process.env.NEXT_PUBLIC_*` and lets RN apps
// pass their own config (and auth persistence) via `expo-constants`.

const VALID_CONFIG = {
  apiKey: 'AIzaSyTEST_DUMMY_PLACEHOLDER_KEY_0000000',
  authDomain: 'test.example.com',
  projectId: 'test-project',
  storageBucket: 'test.appspot.com',
  messagingSenderId: '0',
  appId: 'test-app-id',
};

describe('initFirebase', () => {
  beforeEach(async () => {
    await _resetFirebaseForTests();
  });
  afterEach(async () => {
    await _resetFirebaseForTests();
  });

  it('throws from getDb() when initFirebase has not been called', () => {
    expect(() => getDb()).toThrow(/initFirebase/i);
  });

  it('throws from getAuth() when initFirebase has not been called', () => {
    expect(() => getAuth()).toThrow(/initFirebase/i);
  });

  it('throws from getFirebaseStorage() when initFirebase has not been called', () => {
    expect(() => getFirebaseStorage()).toThrow(/initFirebase/i);
  });

  it('throws from getFirebaseFunctions() when initFirebase has not been called', () => {
    expect(() => getFirebaseFunctions()).toThrow(/initFirebase/i);
  });

  it('throws from getFirebaseApp() when initFirebase has not been called', () => {
    expect(() => getFirebaseApp()).toThrow(/initFirebase/i);
  });

  it('returns a Firestore instance from getDb() after initFirebase', () => {
    initFirebase(VALID_CONFIG);
    const db = getDb();
    expect(db).toBeDefined();
    // A Firestore instance exposes a `type` field equal to 'firestore' on the SDK.
    expect((db as unknown as { type: string }).type).toBe('firestore');
  });

  it('returns the same app on repeated initFirebase calls (idempotent)', () => {
    const a = initFirebase(VALID_CONFIG);
    const b = initFirebase(VALID_CONFIG);
    expect(a).toBe(b);
    expect(getFirebaseApp()).toBe(a);
  });

  it('uses the region passed via options for Functions', () => {
    initFirebase(VALID_CONFIG, { region: 'europe-west1' });
    const functions = getFirebaseFunctions();
    expect((functions as unknown as { region: string }).region).toBe('europe-west1');
  });

  it('defaults Functions region to us-central1', () => {
    initFirebase(VALID_CONFIG);
    const functions = getFirebaseFunctions();
    expect((functions as unknown as { region: string }).region).toBe('us-central1');
  });

  it('_resetFirebaseForTests clears state so subsequent getDb() throws', async () => {
    initFirebase(VALID_CONFIG);
    expect(() => getDb()).not.toThrow();
    await _resetFirebaseForTests();
    expect(() => getDb()).toThrow(/initFirebase/i);
  });
});

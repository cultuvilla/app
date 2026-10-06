import { describe, it, expect } from 'vitest';
import { firebaseErrorCode } from '../../src/firebase/sdk/errors';

describe('firebaseErrorCode', () => {
  it.each([
    [{ code: 'permission-denied' }, 'permission-denied'],
    [{ code: 'firestore/permission-denied' }, 'permission-denied'],
    [{ code: 'functions/not-found' }, 'not-found'],
    [{ code: 'auth/requires-recent-login' }, 'requires-recent-login'],
  ])('%o → %s', (error, code) => {
    expect(firebaseErrorCode(error)).toBe(code);
  });

  it.each([null, undefined, 'boom', {}, { code: 42 }, { code: '' }])('%o has no code', (error) => {
    expect(firebaseErrorCode(error)).toBeNull();
  });
});

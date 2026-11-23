import { describe, it, expect, vi } from 'vitest';

// Mock the firebase module to prevent initialization with invalid credentials
vi.mock('../../src/firebase', () => ({
  db: {},
  getDb: () => ({}),
  getFirebaseFunctions: () => ({}),
}));

// Partial-mock firestore so importing the service (it pulls in refs/converters
// that use real firestore exports) still works, overriding only what the
// function under test uses.
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: vi.fn(() => ({})),
    updateDoc: vi.fn(),
    serverTimestamp: vi.fn(() => '__SERVER_TS__'),
    collection: vi.fn(() => ({ withConverter: () => ({ __collection: 'registrations' }) })),
  };
});

import { updateDoc, serverTimestamp } from 'firebase/firestore';
import {
  determineRegistrationStatus,
  setRegistrationPaid,
} from '../../src/services/registrationService';

describe('determineRegistrationStatus', () => {
  it('returns confirmed when event has no max attendees', () => {
    expect(determineRegistrationStatus(null, 100)).toBe('confirmed');
  });
  it('returns confirmed when below max attendees', () => {
    expect(determineRegistrationStatus(50, 30)).toBe('confirmed');
  });
  it('returns waitlisted when at max attendees', () => {
    expect(determineRegistrationStatus(50, 50)).toBe('waitlisted');
  });
  it('returns waitlisted when above max attendees', () => {
    expect(determineRegistrationStatus(50, 55)).toBe('waitlisted');
  });
});

describe('setRegistrationPaid', () => {
  it('writes a serverTimestamp sentinel when marking paid', async () => {
    await setRegistrationPaid('e1', 'r1', true);
    expect(serverTimestamp).toHaveBeenCalled();
    const arg = vi.mocked(updateDoc).mock.calls.at(-1)?.[1];
    expect(arg).toEqual({ paidAt: '__SERVER_TS__' });
  });

  it('writes null when clearing paid', async () => {
    await setRegistrationPaid('e1', 'r1', false);
    const arg = vi.mocked(updateDoc).mock.calls.at(-1)?.[1];
    expect(arg).toEqual({ paidAt: null });
  });
});

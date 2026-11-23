import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeFirestoreModule, resetFakeFirestore, fakeStore } from '../helpers/fakeFirestore';

vi.mock('../../src/firebase', () => ({ getDb: () => ({}), getFirebaseFunctions: () => ({}) }));
vi.mock('firebase/firestore', () => createFakeFirestoreModule());

import { updateEvent, updateEventStatus } from '../../src/services/eventService';

// The fake's Timestamp.fromDate wraps a Date as { toDate, _isTimestamp }.
const asDate = (v: unknown) => (v as { toDate: () => Date }).toDate();
const isTimestamp = (v: unknown) => (v as { _isTimestamp?: boolean })._isTimestamp === true;

describe('updateEvent', () => {
  beforeEach(() => {
    resetFakeFirestore();
    fakeStore()['events/e1'] = { title: 'Fiesta', status: 'active' };
  });

  // endBoundary is the feed's key: a stale one hides the event from Explora or
  // keeps a finished one listed as upcoming.
  it('recomputes endBoundary from endDate when the dates are patched', async () => {
    const start = new Date('2026-08-14T18:00:00Z');
    const end = new Date('2026-08-16T02:00:00Z');
    await updateEvent('e1', { startDate: start, endDate: end });
    const doc = fakeStore()['events/e1'];
    expect(isTimestamp(doc['startDate'])).toBe(true);
    expect(isTimestamp(doc['endDate'])).toBe(true);
    expect(asDate(doc['startDate'])).toEqual(start);
    expect(asDate(doc['endDate'])).toEqual(end);
    expect(asDate(doc['endBoundary'])).toEqual(end);
  });

  it('falls back to startDate for a single-moment event', async () => {
    const start = new Date('2026-08-14T18:00:00Z');
    await updateEvent('e1', { startDate: start, endDate: null });
    const doc = fakeStore()['events/e1'];
    expect(asDate(doc['endBoundary'])).toEqual(start);
    expect(doc['endDate']).toBeNull();
  });

  // A patch carrying one date must not forget the other: endBoundary is always
  // the boundary of the dates the event has after the write. The stored dates
  // are Dates here because the read goes through the event converter.
  it('keeps the stored later endDate when only startDate is patched', async () => {
    const storedEnd = new Date('2026-08-20T02:00:00Z');
    fakeStore()['events/e1'] = {
      title: 'Fiesta',
      startDate: new Date('2026-08-15T18:00:00Z'),
      endDate: storedEnd,
    };
    await updateEvent('e1', { startDate: new Date('2026-08-14T18:00:00Z') });
    expect(asDate(fakeStore()['events/e1']['endBoundary'])).toEqual(storedEnd);
  });

  it('recomputes endBoundary when only endDate is patched', async () => {
    fakeStore()['events/e1'] = {
      title: 'Fiesta',
      startDate: new Date('2026-08-14T18:00:00Z'),
      endDate: null,
      endBoundary: 'stale',
    };
    const end = new Date('2026-08-16T02:00:00Z');
    await updateEvent('e1', { endDate: end });
    expect(asDate(fakeStore()['events/e1']['endBoundary'])).toEqual(end);
  });

  it('falls back to the stored startDate when endDate is cleared alone', async () => {
    const storedStart = new Date('2026-08-14T18:00:00Z');
    fakeStore()['events/e1'] = {
      title: 'Fiesta',
      startDate: storedStart,
      endDate: new Date('2026-08-16T02:00:00Z'),
    };
    await updateEvent('e1', { endDate: null });
    expect(asDate(fakeStore()['events/e1']['endBoundary'])).toEqual(storedStart);
  });

  it('leaves endBoundary alone when neither date is patched', async () => {
    fakeStore()['events/e1'] = { title: 'Fiesta', endBoundary: 'stored' };
    await updateEvent('e1', { title: 'Fiesta mayor' });
    const doc = fakeStore()['events/e1'];
    expect(doc['title']).toBe('Fiesta mayor');
    expect(doc['endBoundary']).toBe('stored');
    expect(doc['startDate']).toBeUndefined();
  });

  it('stamps updatedAt and keeps untouched fields', async () => {
    await updateEvent('e1', { title: 'Otra' });
    const doc = fakeStore()['events/e1'];
    expect(doc['status']).toBe('active');
    expect(isTimestamp(doc['updatedAt'])).toBe(true);
  });
});

describe('updateEventStatus', () => {
  beforeEach(() => {
    resetFakeFirestore();
  });

  // This is how the app cancels an event: the doc stays, the status moves.
  it('writes only the status and updatedAt', async () => {
    fakeStore()['events/e1'] = { title: 'Fiesta', status: 'active' };
    await updateEventStatus('e1', 'cancelled');
    const doc = fakeStore()['events/e1'];
    expect(doc['status']).toBe('cancelled');
    expect(doc['title']).toBe('Fiesta');
    expect(isTimestamp(doc['updatedAt'])).toBe(true);
  });
});

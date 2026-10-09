// Behaviour test for gatherWrappedInputs against the Firestore emulator.
// Every Wrapped card is a forwardable image, so the reader is where privacy is
// decided: an org-private event, a private profile or a hidden poster must not
// reach the inputs at all. It also reads raw fields, so a malformed doc has to
// degrade to a default rather than fail the whole Wrapped.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { gatherWrappedInputs } from '../../../wrapped/gatherInputs';

const MID = 'mun-wrapped';
const OTHER_MID = 'mun-other';
const WINDOW = {
  start: new Date('2026-08-14T00:00:00+02:00'),
  end: new Date('2026-08-17T23:59:59.999+02:00'),
};
const IN_WINDOW = new Date('2026-08-15T20:00:00+02:00');

const db = () => admin.firestore();

async function seedEvent(id: string, fields: Record<string, unknown>): Promise<void> {
  await db()
    .doc(`events/${id}`)
    .set({
      municipalityId: MID,
      title: id,
      status: 'published',
      startDate: admin.firestore.Timestamp.fromDate(IN_WINDOW),
      commentCount: 0,
      createdBy: 'creator-1',
      organizerOrgIds: [],
      visibility: 'public',
      visibilityOrgId: null,
      ...fields,
    });
}

async function seedRegistration(eventId: string, id: string, fields: Record<string, unknown>): Promise<void> {
  await db()
    .doc(`events/${eventId}/registrations/${id}`)
    .set({ personId: `p-${id}`, userId: `u-${id}`, status: 'confirmed', ...fields });
}

async function seedPerson(id: string, fields: Record<string, unknown>): Promise<void> {
  await db()
    .doc(`municipalityPeople/${id}`)
    .set({ municipalityId: MID, personId: id, displayName: id, photoURL: null, isPublic: true, ...fields });
}

async function gather() {
  return gatherWrappedInputs(db(), MID, WINDOW);
}

describe('gatherWrappedInputs', () => {
  beforeEach(async () => {
    await resetEmulators();
    await db().doc(`municipalities/${MID}`).set({ name: 'Matabuena', escudoUrl: 'https://x/escudo.png' });
  });

  it('throws when the municipality does not exist', async () => {
    await expect(gatherWrappedInputs(db(), 'nope', WINDOW)).rejects.toThrow(/not found/);
  });

  it('prefers the manual escudo over the generated one', async () => {
    await db().doc(`municipalities/${MID}`).set({ name: 'Matabuena', escudoUrl: 'a', escudoManualUrl: 'b' });
    const g = await gather();
    expect(g.villageName).toBe('Matabuena');
    expect(g.escudoUrl).toBe('b');
  });

  it('leaves an organization-private event out entirely', async () => {
    await seedEvent('public-ev', {});
    await seedEvent('secret-ev', {
      title: 'Reunión privada',
      visibility: 'organization',
      visibilityOrgId: 'peña-1',
      organizerOrgIds: ['peña-1'],
      createdBy: 'secret-creator',
    });
    await seedRegistration('public-ev', 'r1', { personId: 'ana' });
    await seedRegistration('secret-ev', 'r2', { personId: 'bea' });
    await db().doc('organizations/peña-1').set({ name: 'Peña Secreta' });
    await db().doc('users/secret-creator').set({ displayName: 'Secret' });

    const { inputs } = await gather();

    expect(inputs.events.map((e) => e.id)).toEqual(['public-ev']);
    expect(inputs.events.map((e) => e.title)).not.toContain('Reunión privada');
    expect(inputs.registrations.map((r) => r.personId)).toEqual(['ana']);
    expect(inputs.organizations).toEqual([]);
    expect(inputs.organizerProfiles.map((p) => p.userId)).not.toContain('secret-creator');
  });

  it('treats visibility "organization" with no org id as public, like the model does', async () => {
    await seedEvent('odd-ev', { visibility: 'organization', visibilityOrgId: null });
    const { inputs } = await gather();
    expect(inputs.events.map((e) => e.id)).toEqual(['odd-ev']);
  });

  it('reads registrations only for live, in-window events and maps them to their event', async () => {
    await seedEvent('in', {});
    await seedEvent('before', { startDate: admin.firestore.Timestamp.fromDate(new Date(WINDOW.start.getTime() - 1)) });
    await seedEvent('after', { startDate: admin.firestore.Timestamp.fromDate(new Date(WINDOW.end.getTime() + 1)) });
    await seedEvent('edge-start', { startDate: admin.firestore.Timestamp.fromDate(WINDOW.start) });
    await seedEvent('edge-end', { startDate: admin.firestore.Timestamp.fromDate(WINDOW.end) });
    await seedEvent('cancelled', { status: 'cancelled' });
    for (const id of ['in', 'before', 'after', 'edge-start', 'edge-end', 'cancelled']) {
      await seedRegistration(id, `r-${id}`, {});
    }

    const { inputs } = await gather();

    expect(inputs.registrations.map((r) => r.eventId).sort()).toEqual(['edge-end', 'edge-start', 'in']);
    const reg = inputs.registrations.find((r) => r.eventId === 'in');
    expect(reg).toEqual({ eventId: 'in', personId: 'p-r-in', userId: 'u-r-in', status: 'confirmed' });
  });

  it('ignores events from another municipality', async () => {
    await seedEvent('mine', {});
    await seedEvent('theirs', { municipalityId: OTHER_MID });
    const { inputs } = await gather();
    expect(inputs.events.map((e) => e.id)).toEqual(['mine']);
  });

  it('skips malformed docs and defaults malformed fields', async () => {
    await seedEvent('no-date', { startDate: 'yesterday' });
    await seedEvent('bad-status', { status: 'exploded' });
    await seedEvent('sloppy', {
      title: 42,
      commentCount: 'many',
      maxAttendees: 'ten',
      createdBy: '',
      organizerOrgIds: ['org-1', 7, null],
      imageURL: null,
    });
    await seedRegistration('sloppy', 'no-person', { personId: null });
    await seedRegistration('sloppy', 'bad-status', { status: 'maybe' });
    await seedRegistration('sloppy', 'ok', {});

    const { inputs } = await gather();

    expect(inputs.events).toHaveLength(1);
    expect(inputs.events[0]).toMatchObject({
      id: 'sloppy',
      title: '',
      commentCount: 0,
      maxAttendees: null,
      createdBy: null,
      organizerOrgIds: ['org-1'],
      imageURL: null,
    });
    expect(inputs.registrations.map((r) => r.personId)).toEqual(['p-ok']);
  });

  it('draws and counts only people whose profile is explicitly public', async () => {
    await seedPerson('public', {});
    await seedPerson('private', { isPublic: false });
    await db().doc('municipalityPeople/unset').set({ municipalityId: MID, personId: 'unset', displayName: 'unset' });
    await seedPerson('elsewhere', { municipalityId: OTHER_MID });

    const g = await gather();

    expect(g.people.map((p) => p.personId)).toEqual(['public']);
    expect(g.inputs.censoCount).toBe(1);
    expect(g.inputs.censoPersonIds).toEqual(['public']);
  });

  it('keeps only active posters, across every year, and counts this year', async () => {
    const poster = (id: string, fields: Record<string, unknown>) =>
      db()
        .doc(`festivalPosters/${id}`)
        .set({ municipalityId: MID, year: 2026, status: 'active', title: id, images: [`https://x/${id}.jpg`], ...fields });
    await poster('p2026', {});
    await poster('p1998', { year: 1998, images: [] });
    await poster('hidden', { status: 'hidden' });
    await poster('pending', { status: 'pending' });
    await poster('no-year', { year: '2026' });

    const g = await gather();

    expect(g.posters.map((p) => p.id).sort()).toEqual(['p1998', 'p2026']);
    expect(g.posters.find((p) => p.id === 'p1998')?.imageURL).toBeNull();
    expect(g.inputs.posterCount).toBe(1);
  });

  // Articles are counted over the same range as everything else, so an admin
  // who widens it to take in the chronicle written before the fiestas gets it.
  it('keeps the active articles published inside the range, oldest first', async () => {
    const article = (id: string, publishedAt: string, fields: Record<string, unknown> = {}) =>
      db()
        .doc(`news/${id}`)
        .set({
          municipalityId: MID,
          title: id,
          status: 'active',
          publishedAt: admin.firestore.Timestamp.fromDate(new Date(publishedAt)),
          coverImage: null,
          images: [],
          ...fields,
        });
    await article('closing', '2026-08-17T23:30:00+02:00');
    await article('opening', '2026-08-14T00:30:00+02:00');
    await article('before', '2026-08-13T23:30:00+02:00');
    await article('after', '2026-08-18T00:30:00+02:00');
    await article('hidden', '2026-08-15T10:00:00+02:00', { status: 'hidden' });
    await article('draft', '2026-08-15T10:00:00+02:00', { publishedAt: null });
    await article('elsewhere', '2026-08-15T10:00:00+02:00', { municipalityId: OTHER_MID });

    const g = await gather();

    expect(g.news.map((n) => n.id)).toEqual(['opening', 'closing']);
    expect(g.news[0].imageURL).toBeNull();
  });

  // A cover the function cannot read (missing, or the runtime account lost
  // `storage.objects.get`) used to come back null with no trace, which is how
  // a prod Wrapped shipped blank article tiles behind a clean log.
  it('warns when an article cover cannot be read', async () => {
    const warn = vi.spyOn(logger, 'warn');
    await db()
      .doc('news/unreadable')
      .set({
        municipalityId: MID,
        title: 'unreadable',
        status: 'active',
        publishedAt: admin.firestore.Timestamp.fromDate(IN_WINDOW),
        coverImage: { storagePath: 'news/unreadable/images/missing.jpg', width: 10, height: 10 },
        images: [],
      });

    const g = await gather();

    expect(g.news[0].imageURL).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      'wrapped news image dropped',
      expect.objectContaining({ handler: 'gatherWrappedInputs', path: 'news/unreadable/images/missing.jpg' }),
    );
    warn.mockRestore();
  });

  it('resolves organizer orgs and creators of counted events only', async () => {
    await seedEvent('counted', { organizerOrgIds: ['org-a'], createdBy: 'maria' });
    await seedEvent('old', {
      organizerOrgIds: ['org-b'],
      createdBy: 'pedro',
      startDate: admin.firestore.Timestamp.fromDate(new Date('2025-08-15T20:00:00+02:00')),
    });
    await db().doc('organizations/org-a').set({ name: 'Ayuntamiento', images: ['https://x/a.png', 'https://x/a2.png'] });
    await db().doc('organizations/org-b').set({ name: 'Peña' });
    await db().doc('users/maria').set({ displayName: 'María' });
    await db().doc('users/pedro').set({ displayName: 'Pedro' });

    const { inputs } = await gather();

    expect(inputs.organizations).toEqual([{ id: 'org-a', name: 'Ayuntamiento', imageURL: 'https://x/a.png' }]);
    expect(inputs.organizerProfiles).toEqual([{ userId: 'maria', displayName: 'María', photoURL: null }]);
  });
});

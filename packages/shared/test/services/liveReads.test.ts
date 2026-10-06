// The `watch*` reads the per-user screens moved onto (mis inscripciones, the
// profile, the bell badge): what each one queries and how it shapes the rows,
// against the in-memory fake. Live re-emission is the emulator suite's job
// (test/integration/watchIntegration.test.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeFirestoreModule, fakeStore, resetFakeFirestore } from '../helpers/fakeFirestore';

vi.mock('../../src/firebase', () => ({ getDb: () => ({}), getFirebaseFunctions: vi.fn(() => ({})) }));
vi.mock('firebase/firestore', () => createFakeFirestoreModule());

import { watchUserRegistrationsAcrossEvents } from '../../src/services/registrationService';
import { watchUnreadCount } from '../../src/services/notificationService';
import { watchPersonByUserId, watchPersonsByCreator } from '../../src/services/personService';
import { watchUserMemberships } from '../../src/services/villageMemberService';
import { watchOrgMembershipsByUser } from '../../src/services/orgMemberService';
import { watchEventsByIds } from '../../src/services/eventService';
import { watchMunicipalitiesByIds } from '../../src/services/municipalityService';
import { watchOrganizationsByMunicipality } from '../../src/services/organizationService';
import { watchVillageVocabularyDefinitions } from '../../src/services/vocabularyService';
import type { Unwatch, WatchError } from '../../src/services/watch';

/** The first value a watcher emits; the fake answers synchronously. */
function firstEmission<A extends unknown[], T>(
  watch: (...args: [...A, (value: T) => void, WatchError]) => Unwatch,
  ...args: A
): T {
  const values: T[] = [];
  watch(
    ...args,
    (value: T) => values.push(value),
    (error: Error) => {
      throw error;
    },
  );
  if (values.length === 0) throw new Error('the watcher never emitted');
  return values[0];
}

beforeEach(() => {
  resetFakeFirestore();
});

describe('watchUserRegistrationsAcrossEvents', () => {
  it("emits the user's registrations across events, each with its event path", () => {
    const store = fakeStore();
    store['events/e1/registrations/r1'] = { userId: 'u1', status: 'confirmed' };
    store['events/e2/registrations/r2'] = { userId: 'u1', status: 'waitlist' };
    store['events/e2/registrations/r3'] = { userId: 'u2', status: 'confirmed' };

    const rows = firstEmission(watchUserRegistrationsAcrossEvents, 'u1');

    expect(rows.map((r) => [r.id, r.eventPath]).sort()).toEqual([
      ['r1', 'events/e1'],
      ['r2', 'events/e2'],
    ]);
  });
});

describe('watchUnreadCount', () => {
  it('counts only the unread notifications of that user', () => {
    const store = fakeStore();
    store['users/u1/notifications/n1'] = { read: false };
    store['users/u1/notifications/n2'] = { read: true };
    store['users/u1/notifications/n3'] = { read: false };
    store['users/u2/notifications/n4'] = { read: false };

    expect(firstEmission(watchUnreadCount, 'u1')).toBe(2);
  });
});

describe('person watchers', () => {
  beforeEach(() => {
    const store = fakeStore();
    store['persons/self'] = { userId: 'u1', createdBy: 'u1', isPublic: false };
    store['persons/kid'] = { userId: null, createdBy: 'u1', isPublic: true };
    store['persons/hidden'] = { userId: null, createdBy: 'u1', isPublic: false };
  });

  it("watchPersonByUserId shows the owner their own private persona, and a stranger nothing", () => {
    expect(firstEmission(watchPersonByUserId, 'u1', 'u1')?.id).toBe('self');
    expect(firstEmission(watchPersonByUserId, 'u1', null)).toBeNull();
  });

  it('watchPersonsByCreator pins the public-only branch for anyone but the creator', () => {
    const own = firstEmission(watchPersonsByCreator, 'u1', 'u1');
    const stranger = firstEmission(watchPersonsByCreator, 'u1', 'u2');
    expect(own.map((p) => p.id).sort()).toEqual(['hidden', 'kid', 'self']);
    expect(stranger.map((p) => p.id)).toEqual(['kid']);
  });
});

describe('watchUserMemberships', () => {
  it('keeps village memberships and drops org memberships from the shared group', () => {
    const joinedAt = new Date('2026-01-01');
    const store = fakeStore();
    store['municipalities/m1/members/u1'] = { userId: 'u1', role: 'admin', joinedAt, profileCompletedAt: null };
    store['organizations/o1/members/u1'] = { userId: 'u1', role: 'member' };
    store['municipalities/m2/members/u2'] = { userId: 'u2', role: 'user', joinedAt, profileCompletedAt: null };

    expect(firstEmission(watchUserMemberships, 'u1')).toEqual([
      { municipalityId: 'm1', role: 'admin', joinedAt, profileCompletedAt: null },
    ]);
  });
});

describe('watchOrgMembershipsByUser', () => {
  it('emits a role for each candidate org the user belongs to', () => {
    const store = fakeStore();
    store['organizations/o1/members/u1'] = { userId: 'u1', role: 'admin' };
    store['organizations/o3/members/u1'] = { userId: 'u1', role: 'member' };

    expect(
      firstEmission(watchOrgMembershipsByUser, 'u1', ['o1', 'o2', 'o3']),
    ).toEqual([
      { orgId: 'o1', role: 'admin' },
      { orgId: 'o3', role: 'member' },
    ]);
  });
});

describe('by-id watchers', () => {
  it('watchEventsByIds keeps the order asked for and drops a missing event', () => {
    const store = fakeStore();
    store['events/e1'] = { title: 'Uno' };
    store['events/e3'] = { title: 'Tres' };

    const events = firstEmission(watchEventsByIds, ['e3', 'gone', 'e1']);
    expect(events.map((e) => e.id)).toEqual(['e3', 'e1']);
  });

  it('watchMunicipalitiesByIds emits the empty list at once for no ids', () => {
    expect(firstEmission(watchMunicipalitiesByIds, [])).toEqual([]);
  });

  it('watchMunicipalitiesByIds emits each known municipality', () => {
    fakeStore()['municipalities/m1'] = { name: 'Matabuena', slug: 'matabuena' };
    const rows = firstEmission(watchMunicipalitiesByIds, ['m1', 'm9']);
    expect(rows.map((m) => m.name)).toEqual(['Matabuena']);
  });
});

describe('village list watchers', () => {
  it('watchOrganizationsByMunicipality narrows to a status when given one', () => {
    const store = fakeStore();
    store['organizations/o1'] = { municipalityId: 'm1', status: 'approved', name: 'A' };
    store['organizations/o2'] = { municipalityId: 'm1', status: 'pending', name: 'B' };
    store['organizations/o3'] = { municipalityId: 'm2', status: 'approved', name: 'C' };

    const approved = firstEmission(watchOrganizationsByMunicipality, 'm1', 'approved');
    const all = firstEmission(watchOrganizationsByMunicipality, 'm1', undefined);
    expect(approved.map((o) => o.id)).toEqual(['o1']);
    expect(all.map((o) => o.id).sort()).toEqual(['o1', 'o2']);
  });

  it("watchVillageVocabularyDefinitions emits the village's active meanings only", () => {
    const store = fakeStore();
    store['vocabularyDefinitions/d1'] = { municipalityId: 'm1', status: 'active' };
    store['vocabularyDefinitions/d2'] = { municipalityId: 'm1', status: 'hidden' };
    store['vocabularyDefinitions/d3'] = { municipalityId: 'm2', status: 'active' };

    const rows = firstEmission(watchVillageVocabularyDefinitions, 'm1');
    expect(rows.map((d) => d.id)).toEqual(['d1']);
  });
});

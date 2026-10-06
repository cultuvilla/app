import { renderHook, waitFor } from '@testing-library/react-native';
import { useProfileData } from '../useProfileData';
import { emitWatched, resetWatchers, setWatched, watchersOf } from '../../../test/watchers';

// Regression: opening someone else's /user/[uid] profile rendered a blank
// card — no photo, no name, every stat empty. The hook asked for the viewed
// user's personas via getPersonsByCreator(theirUid), a query the persons read
// rule can never authorize for anyone but that user (see
// packages/shared/test/e2e/personRules.test.ts, "list by createdBy"). The
// permission-denied rejected the Promise.all that also carried the persona
// and event reads, so the whole load aborted before a single field was set.

const VIEWED = 'uid-2';
const PERSON = {
  id: 'p2',
  userId: VIEWED,
  createdBy: VIEWED,
  givenName: 'Lucía',
  firstSurname: 'Vecina',
  photoURL: 'https://photo.test/lucia.jpg',
};

jest.mock('@cultuvilla/shared/services/personService', () => {
  const w = jest.requireActual<typeof import('../../../test/watchers')>('../../../test/watchers');
  return {
    watchPersonByUserId: w.mockWatcher('person'),
    watchPersonsByCreator: w.mockWatcher('personas'),
  };
});
jest.mock('@cultuvilla/shared/services/eventService', () => ({
  watchEventsByOrganizer: jest
    .requireActual<typeof import('../../../test/watchers')>('../../../test/watchers')
    .mockWatcher('events'),
}));
jest.mock('@cultuvilla/shared/services/newsService', () => ({
  watchNewsPostsByOrganizer: jest
    .requireActual<typeof import('../../../test/watchers')>('../../../test/watchers')
    .mockWatcher('news'),
}));
jest.mock('@cultuvilla/shared/services/organizationService', () => ({
  watchOrganizationsByMunicipality: jest
    .requireActual<typeof import('../../../test/watchers')>('../../../test/watchers')
    .mockWatcher('villageOrgs'),
}));
jest.mock('@cultuvilla/shared/services/orgMemberService', () => ({
  watchOrgMembershipsByUser: jest
    .requireActual<typeof import('../../../test/watchers')>('../../../test/watchers')
    .mockWatcher('orgMemberships'),
}));
jest.mock('@cultuvilla/shared/services/villageMemberService', () => ({
  watchUserMemberships: jest
    .requireActual<typeof import('../../../test/watchers')>('../../../test/watchers')
    .mockWatcher('memberships'),
}));
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  watchMunicipalitiesByIds: jest
    .requireActual<typeof import('../../../test/watchers')>('../../../test/watchers')
    .mockWatcher('municipalities'),
}));
jest.mock('../../firestoreErrorLog', () => ({ reportFirestoreError: jest.fn() }));

function permissionDenied() {
  return Object.assign(new Error('Missing or insufficient permissions.'), {
    code: 'permission-denied',
  });
}

function org(id: string, type: string) {
  return { id, name: `Org ${id}`, villageSlug: 'villa', type, images: [], commentCount: 0 };
}

beforeEach(() => {
  resetWatchers();
  setWatched('person', PERSON);
  setWatched('personas', []);
  setWatched('events', [{ id: 'e1' }, { id: 'e2' }]);
  setWatched('news', []);
  setWatched('villageOrgs', []);
  setWatched('orgMemberships', []);
  setWatched('memberships', []);
  setWatched('municipalities', []);
});

describe('useProfileData — viewing another user', () => {
  it('never issues the personas query the rules deny for a stranger', async () => {
    const { result } = renderHook(() => useProfileData(VIEWED, 'muni-1', 'other'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(watchersOf('personas')).toHaveLength(0);
  });

  it('reads the viewed persona through the public-only branch, and only active news', async () => {
    const { result } = renderHook(() => useProfileData(VIEWED, 'muni-1', 'other'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(watchersOf('person')[0]?.args).toEqual([VIEWED, null]);
    expect(watchersOf('news')[0]?.args).toEqual([VIEWED, { activeOnly: true }]);
  });

  it('still fills the photo and the stats when the news read is denied', async () => {
    setWatched('news', permissionDenied());
    const { result } = renderHook(() => useProfileData(VIEWED, 'muni-1', 'other'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.selfPerson).toEqual(PERSON);
    expect(result.current.eventsCreated).toBe(2);
    expect(result.current.newsError).toBe(true);
    expect(result.current.newsCount).toBeNull();
  });
});

describe('useProfileData — viewing your own profile', () => {
  it('reads your own personas and persona unfiltered, and every news post', async () => {
    setWatched('personas', [PERSON]);
    const { result } = renderHook(() => useProfileData(VIEWED, 'muni-1', 'self'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(watchersOf('person')[0]?.args).toEqual([VIEWED, VIEWED]);
    expect(watchersOf('personas')[0]?.args).toEqual([VIEWED, VIEWED]);
    expect(watchersOf('news')[0]?.args).toEqual([VIEWED, { activeOnly: false }]);
    expect(result.current.allPersonas).toEqual([PERSON]);
  });

  // The listener replaces the old reload-on-focus: a photo changed from the
  // profile, or a persona added on its form, arrives without a refetch.
  it('shows an edit to the persona as the listener delivers it', async () => {
    const { result } = renderHook(() => useProfileData(VIEWED, 'muni-1', 'self'));
    await waitFor(() => expect(result.current.selfPerson).toEqual(PERSON));
    emitWatched('person', { ...PERSON, photoURL: 'https://photo.test/new.jpg' });
    await waitFor(() => expect(result.current.selfPerson?.photoURL).toBe('https://photo.test/new.jpg'));
    expect(watchersOf('person')).toHaveLength(1);
  });

  it('lists the villages you belong to with their names, in membership order', async () => {
    setWatched('memberships', [
      { municipalityId: 'm2', role: 'user' },
      { municipalityId: 'm1', role: 'admin' },
    ]);
    setWatched('municipalities', [
      { id: 'm2', name: 'Riaza', comunidadAutonoma: 'Castilla y León' },
      { id: 'm1', name: 'Matabuena', comunidadAutonoma: 'Castilla y León' },
    ]);
    const { result } = renderHook(() => useProfileData(VIEWED, 'm1', 'self'));
    await waitFor(() => expect(result.current.villages).toHaveLength(2));
    expect(result.current.villages.map((v) => [v.name, v.role])).toEqual([
      ['Riaza', 'user'],
      ['Matabuena', 'admin'],
    ]);
    expect(watchersOf('municipalities')[0]?.args).toEqual([['m2', 'm1']]);
  });

  it("lists only the active village's approved orgs you belong to, with your role", async () => {
    setWatched('villageOrgs', [org('o1', 'peña'), org('o2', 'asociación'), org('o3', 'peña')]);
    setWatched('orgMemberships', [
      { orgId: 'o1', role: 'admin' },
      { orgId: 'o2', role: 'member' },
    ]);
    const { result } = renderHook(() => useProfileData(VIEWED, 'm1', 'self'));
    await waitFor(() => expect(result.current.orgs).toHaveLength(2));
    expect(result.current.orgs.map((o) => [o.id, o.role])).toEqual([
      ['o1', 'admin'],
      ['o2', 'member'],
    ]);
    expect(watchersOf('villageOrgs')[0]?.args).toEqual(['m1', 'approved']);
    expect(watchersOf('orgMemberships')[0]?.args).toEqual([VIEWED, ['o1', 'o2', 'o3']]);
  });

  it('watches no orgs without an active village', async () => {
    const { result } = renderHook(() => useProfileData(VIEWED, null, 'self'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(watchersOf('villageOrgs')).toHaveLength(0);
    expect(result.current.orgs).toEqual([]);
  });
});

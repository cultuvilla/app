import { renderHook } from '@testing-library/react-native';
import { buildOrganizationData } from '@cultuvilla/shared/models/organization/OrganizationDataModel';
import { emitWatched, resetWatchers, setWatched, watchersOf } from '../../../test/watchers';
import { useMyGroups } from '../useMyGroups';

jest.mock('@cultuvilla/shared/services/orgMemberService', () => ({
  watchUserOrgMemberships: jest.requireActual<typeof import('../../../test/watchers')>('../../../test/watchers').mockWatcher('memberships'),
}));
jest.mock('@cultuvilla/shared/services/organizationService', () => ({
  watchOrganizationsByIds: jest.requireActual<typeof import('../../../test/watchers')>('../../../test/watchers').mockWatcher('orgs'),
}));

function org(id: string, name: string) {
  return { id, ...buildOrganizationData({ name, type: 'asociación', municipalityId: 'm', villageSlug: 'v', requestedBy: 'x' }) };
}

beforeEach(() => resetWatchers());

describe('useMyGroups', () => {
  it('is ready and empty for a guest, without watching anything', () => {
    const { result } = renderHook(() => useMyGroups(null));
    expect(result.current).toEqual({ groups: [], status: 'ready' });
    expect(watchersOf('memberships')).toHaveLength(0);
  });

  it('stays loading until both the memberships and the orgs answer', () => {
    const { result } = renderHook(() => useMyGroups('u1'));
    expect(result.current.status).toBe('loading');
    emitWatched('memberships', [{ orgId: 'b', role: 'admin' }]);
    expect(result.current.status).toBe('loading');
    expect(watchersOf('orgs').at(-1)?.args[0]).toEqual(['b']);
  });

  it('pairs each org with its role and sorts by name', () => {
    setWatched('memberships', [{ orgId: 'b', role: 'admin' }, { orgId: 'a', role: 'member' }]);
    setWatched('orgs', [org('a', 'Peña Zeta'), org('b', 'Asociación Anduela')]);
    const { result } = renderHook(() => useMyGroups('u1'));
    expect(result.current.status).toBe('ready');
    expect(result.current.groups.map((g) => [g.org.id, g.role])).toEqual([['b', 'admin'], ['a', 'member']]);
  });

  it('is ready with no groups for a user in none', () => {
    setWatched('memberships', []);
    setWatched('orgs', []);
    const { result } = renderHook(() => useMyGroups('u1'));
    expect(result.current).toEqual({ groups: [], status: 'ready' });
  });

  it('reports an error from either watcher', () => {
    setWatched('memberships', new Error('denied'));
    const { result } = renderHook(() => useMyGroups('u1'));
    expect(result.current.status).toBe('error');
  });
});

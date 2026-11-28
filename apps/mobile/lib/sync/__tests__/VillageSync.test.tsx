import { act, render } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { Image } from 'expo-image';
import { VillageSync } from '../VillageSync';
import { isForeground } from '../useAppForeground';

const mockSync = jest.fn();
const mockClosed: string[] = [];
jest.mock('../villageSync', () => ({
  ...jest.requireActual('../villageSync'),
  syncVillage: (id: string, orgIds: string[], prefetch: (urls: string[]) => void) => {
    mockSync(id, orgIds, prefetch);
    return () => mockClosed.push(id);
  },
}));

let mockAuth: { user: { uid: string } | null; loading: boolean; profileChecked: boolean } = {
  user: { uid: 'u1' },
  loading: false,
  profileChecked: true,
};
jest.mock('../../auth/useAuth', () => ({ useAuth: () => mockAuth }));
let mockActive: string | null = 'active';
jest.mock('../../village/useActiveVillageId', () => ({ useActiveVillageId: () => mockActive }));
const mockOrgs = { orgIds: ['o1'], loading: false, refresh: jest.fn() };
jest.mock('../../orgs/useMyOrgIds', () => ({ useMyOrgIds: () => mockOrgs }));
jest.mock('../../firestoreErrorLog', () => ({ reportWatchError: jest.fn(), reportWatchStall: jest.fn() }));
type MockMembership = import('@cultuvilla/shared/services/villageMemberService').UserMembership;
let mockMemberships: { municipalityId: string }[] | 'pending' = [{ municipalityId: 'member' }, { municipalityId: 'active' }];
jest.mock('@cultuvilla/shared/services/villageMemberService', () => {
  const { fakeService, partialOf } = jest.requireActual<typeof import('../../../test/fakeModule')>('../../../test/fakeModule');
  return fakeService<typeof import('@cultuvilla/shared/services/villageMemberService')>(
    '@cultuvilla/shared/services/villageMemberService',
    () => ({
      watchUserMemberships: (_uid, onNext) => {
        if (mockMemberships !== 'pending') onNext(mockMemberships.map((m) => partialOf<MockMembership>(m)));
        return () => undefined;
      },
    }),
  );
});

let appStateHandler: ((s: AppStateStatus) => void) | null = null;

beforeEach(() => {
  mockSync.mockReset();
  mockClosed.length = 0;
  mockAuth = { user: { uid: 'u1' }, loading: false, profileChecked: true };
  mockActive = 'active';
  mockMemberships = [{ municipalityId: 'member' }, { municipalityId: 'active' }];
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    appStateHandler = handler as (s: AppStateStatus) => void;
    return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
  });
});

const synced = () => mockSync.mock.calls.map(([id]: [string]) => id);

it('only the background counts as away', () => {
  expect(isForeground('active')).toBe(true);
  expect(isForeground('inactive')).toBe(true);
  expect(isForeground('background')).toBe(false);
});

it('syncs the active village first, then each member village, once', () => {
  render(<VillageSync />);
  expect(synced()).toEqual(['active', 'member']);
  expect(mockSync.mock.calls[0][1]).toEqual(['o1']);
});

it('closes the listeners in the background and reopens them on return', () => {
  render(<VillageSync />);
  act(() => appStateHandler?.('background'));
  expect(mockClosed.sort()).toEqual(['active', 'member']);
  mockSync.mockReset();
  act(() => appStateHandler?.('active'));
  expect(synced()).toEqual(['active', 'member']);
});

it('waits for the memberships before opening anything', () => {
  mockMemberships = 'pending';
  render(<VillageSync />);
  expect(mockSync).not.toHaveBeenCalled();
});

it("syncs a guest's last opened village", () => {
  mockAuth = { user: null, loading: false, profileChecked: false };
  mockActive = 'guest-village';
  render(<VillageSync />);
  expect(synced()).toEqual(['guest-village']);
});

it('hands each image to expo-image once per session', () => {
  const prefetch = jest.spyOn(Image, 'prefetch').mockResolvedValue(true);
  render(<VillageSync />);
  const handOver = mockSync.mock.calls[0][2] as (urls: string[]) => void;
  handOver(['https://example.com/a.png', 'https://example.com/b.png']);
  handOver(['https://example.com/a.png']);
  expect(prefetch).toHaveBeenCalledTimes(1);
  expect(prefetch).toHaveBeenCalledWith(['https://example.com/a.png', 'https://example.com/b.png'], 'disk');
});

import { act, renderHook } from '@testing-library/react-native';
import { useInboxNames } from '../useInboxNames';

const mockGetMunicipality = jest.fn();
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  getMunicipality: (id: string) => mockGetMunicipality(id),
}));
const mockGetOrganization = jest.fn();
jest.mock('@cultuvilla/shared/services/organizationService', () => ({
  getOrganization: (id: string) => mockGetOrganization(id),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMunicipality.mockImplementation(async (id: string) => (id === 'm1' ? { name: 'Anaya' } : null));
  mockGetOrganization.mockImplementation(async (id: string) => {
    if (id === 'o1') return { name: 'Peña El Trago' };
    throw new Error('permission-denied');
  });
});

describe('useInboxNames', () => {
  it('reads each village once, however many times it is asked for', async () => {
    const { result } = renderHook(() => useInboxNames());

    await act(() => result.current.resolveMunicipalityNames(['m1', 'm1', 'gone']));
    await act(() => result.current.resolveMunicipalityNames(['m1', 'gone']));

    expect(result.current.municipalityNames).toEqual({ m1: 'Anaya', gone: 'gone' });
    expect(mockGetMunicipality).toHaveBeenCalledTimes(2);
  });

  it('lets a failed village read reject, for the screen to show', async () => {
    mockGetMunicipality.mockRejectedValue(new Error('unavailable'));
    const { result } = renderHook(() => useInboxNames());

    await expect(result.current.resolveMunicipalityNames(['m1'])).rejects.toThrow('unavailable');
  });

  it('keeps the id of an org it cannot read, and reads each org once', async () => {
    const { result } = renderHook(() => useInboxNames());

    await act(() => result.current.resolveOrgNames(['o1', 'o2']));
    await act(() => result.current.resolveOrgNames(['o1', 'o2']));

    expect(result.current.orgNames).toEqual({ o1: 'Peña El Trago', o2: 'o2' });
    expect(mockGetOrganization).toHaveBeenCalledTimes(2);
  });

  it('resolves each requester once, with the resolver the caller gives', async () => {
    const resolve = jest.fn(async (uid: string) => ({ name: `Name ${uid}`, photoURL: null }));
    const { result } = renderHook(() => useInboxNames());

    await act(() => result.current.resolveRequesters(['u1', 'u2'], resolve));
    await act(() => result.current.resolveRequesters(['u1'], resolve));

    expect(result.current.requesterByUid).toEqual({
      u1: { name: 'Name u1', photoURL: null },
      u2: { name: 'Name u2', photoURL: null },
    });
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('keeps its resolvers stable across renders', () => {
    const { result, rerender } = renderHook(() => useInboxNames());
    const first = result.current;
    rerender({});
    expect(result.current.resolveMunicipalityNames).toBe(first.resolveMunicipalityNames);
    expect(result.current.resolveRequesters).toBe(first.resolveRequesters);
    expect(result.current.resolveOrgNames).toBe(first.resolveOrgNames);
  });
});

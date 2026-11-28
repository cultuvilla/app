import { renderHook, waitFor } from '@testing-library/react-native';
import { useMentionSources } from '../useMentionSources';
import { getActiveCommunities } from '@cultuvilla/shared/services/municipalityService';

jest.mock('@cultuvilla/shared/services/organizationService', () => {
  const { fakeService } = jest.requireActual<typeof import('../../test/fakeModule')>('../../test/fakeModule');
  return fakeService<typeof import('@cultuvilla/shared/services/organizationService')>(
    '@cultuvilla/shared/services/organizationService',
    () => ({
      getOrganizationsByMunicipality: jest.fn().mockResolvedValue([]),
    }),
  );
});
jest.mock('@cultuvilla/shared/services/eventService', () => {
  const { fakeService } = jest.requireActual<typeof import('../../test/fakeModule')>('../../test/fakeModule');
  return fakeService<typeof import('@cultuvilla/shared/services/eventService')>(
    '@cultuvilla/shared/services/eventService',
    () => ({
      getEventsByMunicipality: jest.fn().mockResolvedValue([]),
    }),
  );
});
jest.mock('@cultuvilla/shared/services/newsService', () => {
  const { fakeService } = jest.requireActual<typeof import('../../test/fakeModule')>('../../test/fakeModule');
  return fakeService<typeof import('@cultuvilla/shared/services/newsService')>(
    '@cultuvilla/shared/services/newsService',
    () => ({
      getNewsPostsByMunicipality: jest.fn().mockResolvedValue([]),
    }),
  );
});
jest.mock('@cultuvilla/shared/services/festivalPosterService', () => {
  const { fakeService } = jest.requireActual<typeof import('../../test/fakeModule')>('../../test/fakeModule');
  return fakeService<typeof import('@cultuvilla/shared/services/festivalPosterService')>(
    '@cultuvilla/shared/services/festivalPosterService',
    () => ({
      getFestivalPosters: jest.fn().mockResolvedValue([]),
    }),
  );
});
jest.mock('@cultuvilla/shared/services/municipalityService', () => {
  const { fakeService } = jest.requireActual<typeof import('../../test/fakeModule')>('../../test/fakeModule');
  return fakeService<typeof import('@cultuvilla/shared/services/municipalityService')>(
    '@cultuvilla/shared/services/municipalityService',
    () => ({
      getPlaces: jest.fn().mockResolvedValue([]),
      getBarrios: jest.fn().mockResolvedValue([]),
      getActiveCommunities: jest.fn().mockResolvedValue([]),
    }),
  );
});

const mockActive = getActiveCommunities as jest.Mock;

describe('useMentionSources village candidates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActive.mockResolvedValue([]);
  });

  // The compose screen opened with an unbounded read of every INE municipality
  // (~8.2k docs through the strict Zod converter), which janked the whole form
  // — the category dropdown took seconds to open. Only an activated village has
  // a /village/[id] screen to link to, so that is the only mentionable set.
  // The compose screen used to load every INE municipality (~8.2k docs through
  // the strict Zod converter), which janked the whole form for seconds on a
  // phone. A mention deep-links to /village/[id], which exists only once a
  // community is activated, so that is the only mentionable set.
  it('reads only the activated communities', async () => {
    renderHook(() => useMentionSources('m1'));

    await waitFor(() => expect(mockActive).toHaveBeenCalledTimes(1));
  });

  it('offers only villages with an activated community', async () => {
    mockActive.mockResolvedValue([{ id: 'm1', name: 'Aranjuez' }]);

    const { result } = renderHook(() => useMentionSources('m1'));

    await waitFor(() =>
      expect(result.current.candidates).toEqual([
        { entityType: 'village', entityId: 'm1', label: 'Aranjuez' },
      ]),
    );
  });
});

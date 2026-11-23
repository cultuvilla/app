import { describe, it, expect, vi, beforeEach } from 'vitest';

const sources = vi.hoisted(() => ({
  getOrganizationsByMunicipality: vi.fn(),
  getEventsByMunicipality: vi.fn(),
  getPlaces: vi.fn(),
  getBarrios: vi.fn(),
  getActiveCommunities: vi.fn(),
  getFestivalPosters: vi.fn(),
  getNewsPostsByMunicipality: vi.fn(),
}));

vi.mock('../../src/services/organizationService', () => ({
  getOrganizationsByMunicipality: sources.getOrganizationsByMunicipality,
}));
vi.mock('../../src/services/eventService', () => ({ getEventsByMunicipality: sources.getEventsByMunicipality }));
vi.mock('../../src/services/municipalityService', () => ({
  getPlaces: sources.getPlaces,
  getBarrios: sources.getBarrios,
  getActiveCommunities: sources.getActiveCommunities,
}));
vi.mock('../../src/services/festivalPosterService', () => ({ getFestivalPosters: sources.getFestivalPosters }));
vi.mock('../../src/services/newsService', () => ({
  getNewsPostsByMunicipality: sources.getNewsPostsByMunicipality,
}));

import { getMentionCandidates } from '../../src/services/mentionCandidateService';

function seedAll() {
  sources.getOrganizationsByMunicipality.mockResolvedValue([{ id: 'o1', name: 'Peña El Botijo' }]);
  sources.getEventsByMunicipality.mockResolvedValue([{ id: 'e1', title: 'Verbena' }]);
  sources.getPlaces.mockResolvedValue([{ id: 'p1', name: 'Ermita' }]);
  sources.getBarrios.mockResolvedValue([{ id: 'b1', name: 'Barrio Alto' }]);
  sources.getActiveCommunities.mockResolvedValue([{ id: 'm2', name: 'Matabuena' }]);
  sources.getFestivalPosters.mockResolvedValue([
    { id: 'f1', title: 'Fiestas de agosto', year: 2026 },
    { id: 'f2', year: 2025 },
  ]);
  sources.getNewsPostsByMunicipality.mockResolvedValue([
    { id: 'n1', title: 'Crónica' },
    { id: 'n2', title: 'Borrador en edición' },
  ]);
}

describe('getMentionCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedAll();
  });

  it('maps every source to its entity type and label', async () => {
    const out = await getMentionCandidates('m1');
    expect(out).toEqual([
      { entityType: 'organization', entityId: 'o1', label: 'Peña El Botijo' },
      { entityType: 'event', entityId: 'e1', label: 'Verbena' },
      { entityType: 'place', entityId: 'p1', label: 'Ermita' },
      { entityType: 'barrio', entityId: 'b1', label: 'Barrio Alto' },
      { entityType: 'village', entityId: 'm2', label: 'Matabuena' },
      { entityType: 'festivalPoster', entityId: 'f1', label: 'Fiestas de agosto' },
      // An untitled poster is labelled by its year.
      { entityType: 'festivalPoster', entityId: 'f2', label: '2025' },
      { entityType: 'news', entityId: 'n1', label: 'Crónica' },
      { entityType: 'news', entityId: 'n2', label: 'Borrador en edición' },
    ]);
  });

  it('asks only for approved orgs and active news of this village', async () => {
    await getMentionCandidates('m1');
    expect(sources.getOrganizationsByMunicipality).toHaveBeenCalledWith('m1', 'approved');
    expect(sources.getNewsPostsByMunicipality).toHaveBeenCalledWith('m1', { status: 'active' });
    for (const fn of [sources.getEventsByMunicipality, sources.getPlaces, sources.getBarrios, sources.getFestivalPosters]) {
      expect(fn).toHaveBeenCalledWith('m1');
    }
  });

  it('drops the article being edited, and nothing else', async () => {
    const out = await getMentionCandidates('m1', 'n2');
    expect(out.filter((c) => c.entityType === 'news').map((c) => c.entityId)).toEqual(['n1']);
    expect(out).toHaveLength(8);
  });

  it('a failing source contributes nothing and the rest still load', async () => {
    sources.getEventsByMunicipality.mockRejectedValue(new Error('permission-denied'));
    sources.getActiveCommunities.mockRejectedValue(new Error('unavailable'));
    const out = await getMentionCandidates('m1');
    expect(out.some((c) => c.entityType === 'event' || c.entityType === 'village')).toBe(false);
    expect(out).toHaveLength(7);
  });
});

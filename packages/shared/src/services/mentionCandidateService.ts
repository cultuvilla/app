import type { MentionEntityType } from '../models/news/NewsPostDataModel';
import { getEventsByMunicipality } from './eventService';
import { getFestivalPosters } from './festivalPosterService';
import { getActiveCommunities, getBarrios, getPlaces } from './municipalityService';
import { getNewsPostsByMunicipality } from './newsService';
import { getOrganizationsByMunicipality } from './organizationService';

/** Something an article's `@`-mention can point at. */
export interface MentionCandidate {
  entityType: MentionEntityType;
  entityId: string;
  label: string;
}

/**
 * Every entity an article in this pueblo may `@`-mention — approved
 * organizations (peñas/asociaciones/…), events, places, barrios, activated
 * villages, festival posters, and other visible news posts. Content entities
 * are filtered to `status: 'active'` (server-side in their services); people are
 * deliberately not mentionable (members have no public profile screen). A
 * village's directory is small enough to hold in memory and filter as the
 * author types. A source that fails to load just contributes nothing.
 *
 * `excludeNewsId` drops the article being edited so a post can't mention itself.
 */
export async function getMentionCandidates(
  municipalityId: string,
  excludeNewsId?: string,
): Promise<MentionCandidate[]> {
  const [orgs, events, places, barrios, villages, posters, news] = await Promise.all([
    getOrganizationsByMunicipality(municipalityId, 'approved').catch(() => []),
    getEventsByMunicipality(municipalityId).catch(() => []),
    getPlaces(municipalityId).catch(() => []),
    getBarrios(municipalityId).catch(() => []),
    // Activated communities only — never the full INE municipality list.
    // A mention deep-links to the village page, which exists only once a
    // community is active, and reading all ~8.2k docs through the strict
    // converter janked the whole compose form for seconds on a phone.
    getActiveCommunities().catch(() => []),
    getFestivalPosters(municipalityId).catch(() => []),
    getNewsPostsByMunicipality(municipalityId, { status: 'active' }).catch(() => []),
  ]);
  return [
    ...orgs.map((o): MentionCandidate => ({ entityType: 'organization', entityId: o.id, label: o.name })),
    ...events.map((e): MentionCandidate => ({ entityType: 'event', entityId: e.id, label: e.title })),
    ...places.map((pl): MentionCandidate => ({ entityType: 'place', entityId: pl.id, label: pl.name })),
    ...barrios.map((b): MentionCandidate => ({ entityType: 'barrio', entityId: b.id, label: b.name })),
    ...villages.map((v): MentionCandidate => ({ entityType: 'village', entityId: v.id, label: v.name })),
    ...posters.map(
      (p): MentionCandidate => ({ entityType: 'festivalPoster', entityId: p.id, label: p.title ?? String(p.year) }),
    ),
    ...news
      .filter((n) => n.id !== excludeNewsId)
      .map((n): MentionCandidate => ({ entityType: 'news', entityId: n.id, label: n.title })),
  ];
}

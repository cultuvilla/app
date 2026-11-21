import { useEffect, useState } from 'react';
import { getBarrios, getPlaces } from '@cultuvilla/shared/services/municipalityService';
import { getOrganizationsByMunicipality } from '@cultuvilla/shared/services/organizationService';
import { getEventsByMunicipality } from '@cultuvilla/shared/services/eventService';
import { getFestivalPosters } from '@cultuvilla/shared/services/festivalPosterService';
import { getNewsPostsByMunicipality } from '@cultuvilla/shared/services/newsService';
import { newsImageDownloadURL } from '@cultuvilla/shared/services/imageService';
import { resolveFieldDisplay } from '@cultuvilla/shared/services/censoFieldResolver';
import type { ProfileFormField, OptionsSource } from '@cultuvilla/shared/models/municipality/CensoTypes';
import type { ChoiceOption } from './ChoiceList';

export function useEntityOptions(villageId: string, fields: ProfileFormField[]) {
  const [optionsByField, setOptionsByField] = useState<Record<string, ChoiceOption[]>>({});
  const [loading, setLoading] = useState(false);

  const fieldSources: Array<[string, OptionsSource]> = [];
  const sources = new Set<OptionsSource>();
  for (const f of fields) {
    const src = resolveFieldDisplay(f).optionsSource;
    if (src) {
      sources.add(src);
      fieldSources.push([f.key, src]);
    }
  }
  const sourceKey = [...sources].sort().join(',');

  useEffect(() => {
    if (!villageId || sources.size === 0) {
      setOptionsByField({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const [barrios, places, orgs, events, posters, news] = await Promise.all([
        sources.has('barrios') ? getBarrios(villageId) : Promise.resolve([]),
        sources.has('places') ? getPlaces(villageId) : Promise.resolve([]),
        sources.has('organizations') ? getOrganizationsByMunicipality(villageId) : Promise.resolve([]),
        sources.has('events') ? getEventsByMunicipality(villageId) : Promise.resolve([]),
        sources.has('festivalPosters') ? getFestivalPosters(villageId) : Promise.resolve([]),
        sources.has('news') ? getNewsPostsByMunicipality(villageId, { status: 'active' }) : Promise.resolve([]),
      ]);
      const newsOptions = await Promise.all(news.map(async (post) => {
        const storagePath = post.coverImage?.storagePath ?? post.images[0]?.storagePath;
        const imageUri = storagePath
          ? await newsImageDownloadURL(storagePath).catch(() => null)
          : null;
        return { value: post.id, label: post.title, imageUri };
      }));
      const bySource: Record<OptionsSource, ChoiceOption[]> = {
        barrios: barrios.map((b) => ({ value: b.id, label: b.name, imageUri: b.images[0] ?? null })),
        places: places.map((p) => ({ value: p.id, label: p.name, imageUri: p.images[0] ?? null })),
        organizations: orgs.map((o) => ({ value: o.id, label: o.name, imageUri: o.images[0] ?? null })),
        events: events.map((e) => ({ value: e.id, label: e.title, imageUri: e.imageURL ?? e.villageCoverImage })),
        festivalPosters: posters.map((p) => ({ value: p.id, label: p.title ?? String(p.year), imageUri: p.images[0] ?? null })),
        news: newsOptions,
      };
      const map: Record<string, ChoiceOption[]> = {};
      for (const [key, src] of fieldSources) {
        map[key] = bySource[src];
      }
      if (!cancelled) {
        setOptionsByField(map);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [villageId, sourceKey]);

  return { optionsByField, loading };
}

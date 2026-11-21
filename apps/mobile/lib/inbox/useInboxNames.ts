import { useCallback, useRef, useState } from 'react';
import { getMunicipality } from '@cultuvilla/shared/services/municipalityService';
import { getOrganization } from '@cultuvilla/shared/services/organizationService';

export type InboxRequester = { name: string; photoURL: string | null };

type NameMap = Record<string, string>;

/**
 * The Buzón's id → display-name hydration: villages, requesters and orgs.
 *
 * Each map is mirrored in a ref, and the resolvers read the ref, so they stay
 * stable across renders and skip every id already resolved. (Reading the state
 * from a callback's closure saw the first render's empty maps and refetched
 * every name on each reload.)
 */
export function useInboxNames() {
  const [municipalityNames, setMunicipalityNames] = useState<NameMap>({});
  const [requesterByUid, setRequesterByUid] = useState<Record<string, InboxRequester>>({});
  const [orgNames, setOrgNames] = useState<NameMap>({});
  const municipalityRef = useRef<NameMap>({});
  const requesterRef = useRef<Record<string, InboxRequester>>({});
  const orgRef = useRef<NameMap>({});

  /** Falls back to the id for a village that no longer exists; a failed read rejects. */
  const resolveMunicipalityNames = useCallback(async (ids: Iterable<string>) => {
    const missing = [...new Set(ids)].filter((id) => !(id in municipalityRef.current));
    if (missing.length === 0) return;
    const resolved = await Promise.all(
      missing.map(async (id) => [id, (await getMunicipality(id))?.name ?? id] as const),
    );
    municipalityRef.current = { ...municipalityRef.current, ...Object.fromEntries(resolved) };
    setMunicipalityNames(municipalityRef.current);
  }, []);

  /** `resolve` owns the fallback, since the request kinds differ in theirs. */
  const resolveRequesters = useCallback(
    async (uids: Iterable<string>, resolve: (uid: string) => Promise<InboxRequester>) => {
      const missing = [...new Set(uids)].filter((uid) => !(uid in requesterRef.current));
      if (missing.length === 0) return;
      const resolved = await Promise.all(missing.map(async (uid) => [uid, await resolve(uid)] as const));
      requesterRef.current = { ...requesterRef.current, ...Object.fromEntries(resolved) };
      setRequesterByUid(requesterRef.current);
    },
    [],
  );

  /** Best-effort: an unreadable org keeps its id. */
  const resolveOrgNames = useCallback(async (ids: Iterable<string>) => {
    const missing = [...new Set(ids)].filter((id) => !(id in orgRef.current));
    if (missing.length === 0) return;
    const resolved = await Promise.all(
      missing.map(async (id) => {
        const org = await getOrganization(id).catch(() => null);
        return [id, org?.name ?? id] as const;
      }),
    );
    orgRef.current = { ...orgRef.current, ...Object.fromEntries(resolved) };
    setOrgNames(orgRef.current);
  }, []);

  return {
    municipalityNames,
    requesterByUid,
    orgNames,
    resolveMunicipalityNames,
    resolveRequesters,
    resolveOrgNames,
  };
}

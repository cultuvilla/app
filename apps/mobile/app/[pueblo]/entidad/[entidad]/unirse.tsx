import { Redirect, useLocalSearchParams } from 'expo-router';
import { entityRefHref, routes } from '../../../../lib/navigation/routes';

// An org invite link is `/<pueblo>/entidad/<ref>/unirse` (see deepLinkService).
// Web routing resolves URLs by route file, so the suffix needs a file of its
// own; it redirects into the org detail carrying the join intent, which renders
// the "invited" banner.
export default function OrgJoinRedirect() {
  const { pueblo, entidad } = useLocalSearchParams<{ pueblo: string; entidad: string }>();
  if (!pueblo || !entidad) return <Redirect href={routes.home} />;
  return <Redirect href={entityRefHref('organization', pueblo, entidad, 'intent=join')} />;
}

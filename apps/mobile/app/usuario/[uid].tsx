import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen, Text } from '../../components/primitives';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { ProfileView } from '../../components/feature/profile/ProfileView';
import { useT } from '../../lib/i18n';
import { getPublicProfile } from '@cultuvilla/shared/services/userService';
import { getPersonByUserId } from '@cultuvilla/shared/services/personService';
import { buildDisplayName } from '@cultuvilla/shared/models/person';

export default function UserProfileScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const { t } = useT();
  const [headerName, setHeaderName] = useState('');
  const [activeMunicipalityId, setActiveMunicipalityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!uid) return;
    setLoading(true);
    void (async () => {
      const [profile, person] = await Promise.all([
        getPublicProfile(uid),
        // Best-effort: the header falls back to the user doc's displayName.
        getPersonByUserId(uid).catch(() => null),
      ]);
      if (cancelled) return;
      if (!profile) setNotFound(true);
      setActiveMunicipalityId(profile?.activeMunicipalityId ?? null);
      setHeaderName(person ? buildDisplayName(person) : profile?.displayName ?? '');
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [uid]);

  if (!uid) return null;

  return (
    <Screen padded={false}>
      <ScreenHeader title={headerName || t('userProfile.title')} />
      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>
      ) : notFound ? (
        <View className="p-4"><Text tone="muted">{t('userProfile.notFound')}</Text></View>
      ) : (
        <ProfileView
          uid={uid}
          activeMunicipalityId={activeMunicipalityId}
          variant="other"
          fallbackName={headerName}
        />
      )}
    </Screen>
  );
}

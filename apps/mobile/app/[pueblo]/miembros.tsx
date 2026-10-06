import { villageHref } from '../../lib/navigation/routes';
import { useVillageRoute, withVillageRoute } from '../../lib/navigation/VillageRouteGate';
import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Screen } from '../../components/primitives';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { MembersList } from '../../components/feature/MembersList';
import { useEntityCapabilities } from '../../lib/auth/useEntityCapabilities';
import { useIsAppAdmin } from '../../lib/auth/useIsAppAdmin';
import { isVillageMember } from '@cultuvilla/shared/services/villageMemberService';
import { useT } from '../../lib/i18n';

// Villagers roster ("Personas") — reached by tapping the personas stat on the
// village home. Members-only: non-members who deep-link here are bounced back to
// the village. The team keeps the row actions via MembersList's `canManage`
// (the Embajador and app admins can also hand over the title); non-admin
// members see the same table read-only.
function VillageMembersScreen() {
  const { municipalityId: villageId, slug: villageSlug } = useVillageRoute();
  const { canManage, uid, loading } = useEntityCapabilities(villageId);
  const { isAppAdmin } = useIsAppAdmin();
  const { t } = useT();
  const [isMember, setIsMember] = useState<boolean | null>(null);

  useEffect(() => {
    if (!villageId || !uid) {
      setIsMember(false);
      return;
    }
    let cancelled = false;
    setIsMember(null);
    isVillageMember(villageId, uid).then((ok) => {
      if (!cancelled) setIsMember(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [villageId, uid]);

  if (!villageId) return null;

  if (loading || isMember === null) {
    return (
      <Screen padded={false} topInset={false}>
        <ScreenHeader title={t('village.villagers.title')} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  // App/village admins can always view; everyone else must be a member.
  if (!isMember && !canManage) return <Redirect href={villageHref(villageSlug)} />;

  return (
    <Screen padded={false} topInset={false}>
      <ScreenHeader title={t('village.villagers.title')} />
      <MembersList
        villageId={villageId}
        canManage={canManage}
        isAppAdmin={isAppAdmin}
        currentUserId={uid}
      />
    </Screen>
  );
}

export default withVillageRoute(VillageMembersScreen);

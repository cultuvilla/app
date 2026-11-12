import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { isRecordsDoor } from '@cultuvilla/shared/utils';
import { Screen } from '../../../../components/primitives';
import { ScreenHeader } from '../../../../components/layout/ScreenHeader';
import { ActasAdmin } from '../../../../components/feature/groups/ActasAdmin';
import { LibroSocios } from '../../../../components/feature/groups/LibroSocios';
import { YearSummaryAdmin } from '../../../../components/feature/groups/YearSummaryAdmin';
import { GroupContactGate } from '../../../../components/feature/groups/GroupContactGate';
import { useAuth } from '../../../../lib/auth/useAuth';
import { useT } from '../../../../lib/i18n';
import { groupHref, groupSectionHref, routes } from '../../../../lib/navigation/routes';
import { canOpenGroupSection } from '../../../../lib/orgs/groupSections';
import { useMyGroups } from '../../../../lib/orgs/useMyGroups';

/** One door of a group's Registros — the libro de socios, the actas or the accounts — on a screen of its own. */
export default function GroupRecordsDoorScreen() {
  const { t } = useT();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { grupo, puerta } = useLocalSearchParams<{ grupo: string; puerta: string }>();
  const { groups, status } = useMyGroups(uid);
  const group = groups.find((g) => g.org.id === grupo) ?? null;
  const door = puerta && isRecordsDoor(puerta) ? puerta : null;

  if (!door) return <Redirect href={grupo ? groupSectionHref(grupo, 'registros') : routes.groups} />;
  if (uid && status !== 'loading' && (!group || !canOpenGroupSection(group, 'registros'))) {
    return <Redirect href={grupo ? groupHref(grupo) : routes.groups} />;
  }

  return (
    <Screen padded={false} topInset={false}>
      <ScreenHeader accent title={t(`groups.records.doors.${door}`)} />
      <GroupContactGate group={group} uid={uid}>
        {!uid || !group ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView contentContainerClassName="px-4 pt-3 pb-16" keyboardShouldPersistTaps="handled" testID={`records-door-screen-${door}`}>
            {door === 'libro' ? (
              <LibroSocios key={group.org.id} orgId={group.org.id} orgName={group.org.name} />
            ) : door === 'actas' ? (
              <ActasAdmin key={group.org.id} orgId={group.org.id} orgName={group.org.name} uid={uid} />
            ) : (
              <YearSummaryAdmin key={group.org.id} orgId={group.org.id} orgName={group.org.name} uid={uid} />
            )}
          </ScrollView>
        )}
      </GroupContactGate>
    </Screen>
  );
}

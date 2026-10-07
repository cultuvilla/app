import { useState } from 'react';
import { ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, VStack, HStack, Text, Input, Button } from '../../../components/primitives';
import { PhoneField } from '../../../components/feature/PhoneField';
import { AmbassadorCarnet } from '../../../components/feature/AmbassadorCarnet';
import { ScreenHeader } from '../../../components/layout/ScreenHeader';
import { useT } from '../../../lib/i18n';
import { useAuth } from '../../../lib/auth/useAuth';
import { useCallable } from '../../../lib/useCallable';
import { useOrganizerPhone } from '../../../lib/useOrganizerPhone';
import { useWatch } from '../../../lib/hooks/useWatch';
import { requestOrganizeVillage } from '@cultuvilla/shared/services/organizerRequestService';
import { patchUserProfile } from '@cultuvilla/shared/services/userService';
import { watchPersonByUserId } from '@cultuvilla/shared/services/personService';
import { watchMunicipality } from '@cultuvilla/shared/services/municipalityService';
import { escudoFullUrl, type MunicipalityData } from '@cultuvilla/shared/models/municipality';
import { buildDisplayName, type PersonData } from '@cultuvilla/shared/models/person';

type PersonDoc = PersonData & { id: string };
type MunicipalityDoc = MunicipalityData & { id: string };

const EXPLAINER_POINTS = ['info', 'welcome', 'upToDate', 'public'] as const;

/**
 * Request to organize an already-active village that has no organizer yet.
 * Activation is decoupled: the village is already started, so this only asks to
 * be granted the organizer (admin) role. Still superadmin-approved. We also
 * capture a contact phone (prefilled from / saved back to the profile).
 *
 * The carnet on top shows the applicant how the title will read on them: the
 * role is public, so they should see their own face on it before asking.
 */
export default function OrganizeVillageScreen() {
  const { municipalityId } = useLocalSearchParams<{ municipalityId: string }>();
  const { t } = useT();
  const { user, profile } = useAuth();
  const organizerPhone = useOrganizerPhone(profile?.telephone);
  const [motivation, setMotivation] = useState('');
  const uid = user?.uid ?? null;
  const { data: person } = useWatch<PersonDoc | null>('organize.person', uid, (onNext, onError) =>
    watchPersonByUserId(uid ?? '', uid, onNext, onError),
  );
  const { data: municipality } = useWatch<MunicipalityDoc | null>(
    'organize.municipality',
    municipalityId ?? null,
    (onNext, onError) => watchMunicipality(municipalityId ?? '', onNext, onError),
  );
  const carnetName = person ? buildDisplayName(person) : (profile?.displayName ?? '');

  const { fire: submit, isPending } = useCallable({
    callable: async () => {
      if (user) await patchUserProfile(user.uid, { telephone: organizerPhone.e164 });
      await requestOrganizeVillage({
        municipalityId: municipalityId ?? '',
        motivation: motivation.trim() || null,
      });
    },
    onSuccess: () => {
      router.back();
    },
    swallow: true,
  });

  return (
    <Screen padded={false}>
      <ScreenHeader title={t('organize.title')} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <VStack gap={4}>
          {municipality && carnetName ? (
            <AmbassadorCarnet
              testID="organize-carnet"
              name={carnetName}
              photoURL={person?.photoURL ?? null}
              sex={person?.sex ?? null}
              villageName={municipality.name}
              escudoUrl={escudoFullUrl(municipality)}
            />
          ) : null}
          <VStack gap={2} testID="organize-explainer">
            <Text variant="bodySm">{t('organize.intro')}</Text>
            {EXPLAINER_POINTS.map((key) => (
              <HStack key={key} gap={2} className="items-start pl-1">
                <Text variant="bodySm">•</Text>
                <Text variant="bodySm" className="flex-1">
                  {t(`organize.points.${key}`)}
                </Text>
              </HStack>
            ))}
          </VStack>
          <PhoneField {...organizerPhone.fieldProps} />
          <Input
            testID="organizer-motivation"
            label={t('requests.organizer.motivationLabel')}
            value={motivation}
            onChangeText={setMotivation}
            multiline
            numberOfLines={4}
          />
          <Button
            onPress={() => {
              if (!municipalityId) return;
              if (!organizerPhone.validateForSubmit()) return;
              void submit();
            }}
            loading={isPending}
            disabled={!municipalityId}
            fullWidth
            testID="organize-submit"
          >
            <Text tone="onAccent">{t('organize.submit')}</Text>
          </Button>
        </VStack>
      </ScrollView>
    </Screen>
  );
}

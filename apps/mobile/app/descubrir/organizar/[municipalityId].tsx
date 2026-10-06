import { useState } from 'react';
import { ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, VStack, Text, Input, Button, Pressable } from '../../../components/primitives';
import { PhoneField } from '../../../components/feature/PhoneField';
import { AmbassadorCarnet } from '../../../components/feature/AmbassadorCarnet';
import { ScreenHeader } from '../../../components/layout/ScreenHeader';
import { useT } from '../../../lib/i18n';
import { useAuth } from '../../../lib/auth/useAuth';
import { useCallable } from '../../../lib/useCallable';
import { useOrganizerPhone } from '../../../lib/useOrganizerPhone';
import { useWatch } from '../../../lib/hooks/useWatch';
import { userHref } from '../../../lib/navigation/routes';
import { requestOrganizeVillage } from '@cultuvilla/shared/services/organizerRequestService';
import { patchUserProfile } from '@cultuvilla/shared/services/userService';
import { watchPersonByUserId } from '@cultuvilla/shared/services/personService';
import { watchMunicipality } from '@cultuvilla/shared/services/municipalityService';
import { escudoThumbDisplayUrl, type MunicipalityData } from '@cultuvilla/shared/models/municipality';
import { buildDisplayName, type PersonData } from '@cultuvilla/shared/models/person';

type PersonDoc = PersonData & { id: string };
type MunicipalityDoc = MunicipalityData & { id: string };

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
            <VStack gap={2}>
              <Text variant="caption" tone="muted" className="uppercase font-semibold">
                {t('organize.carnet.preview')}
              </Text>
              <AmbassadorCarnet
                testID="organize-carnet"
                name={carnetName}
                photoURL={person?.photoURL ?? null}
                sex={person?.sex ?? null}
                villageName={municipality.name}
                escudoUrl={escudoThumbDisplayUrl(municipality)}
              />
              {uid && !person?.photoURL ? (
                <Pressable
                  testID="organize-carnet-add-photo"
                  onPress={() => router.push(userHref(uid))}
                  accessibilityRole="link"
                >
                  <Text variant="bodySm" className="font-semibold text-accent">
                    {t('organize.carnet.addPhoto')}
                  </Text>
                </Pressable>
              ) : null}
            </VStack>
          ) : null}
          <Text tone="muted" variant="bodySm">
            {t('organize.explainer')}
          </Text>
          <PhoneField {...organizerPhone.fieldProps} />
          <Input
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

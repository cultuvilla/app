import { routes } from '../../lib/navigation/routes';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { iconSizes } from '@cultuvilla/shared/design-system';
import { Screen, VillagePicker, BarrioPicker, Checkbox, Text, Pressable } from '../../components/primitives';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { PersonForm } from '../../components/feature/PersonForm';
import type { PersonFormPhoto, PersonFormValues } from '../../components/feature/PersonForm';
import { useAuth } from '../../lib/auth/useAuth';
import { useT } from '../../lib/i18n';
import {
  createPerson,
  updatePerson,
  getPersonByUserId,
  updateResidenceBarrio,
} from '@cultuvilla/shared/services/personService';
import {
  createUserProfile,
  patchUserProfile,
} from '@cultuvilla/shared/services/userService';
import { ensureVillageMembership } from '@cultuvilla/shared/services/villageMemberService';
import { uploadUserPhoto } from '@cultuvilla/shared/services/imageService';
import { recordOccupation } from '@cultuvilla/shared/services/occupationService';
import { isCatalogOccupation } from '@cultuvilla/shared/models/occupation';
import { buildResidenceLinks } from '@cultuvilla/shared/models/person';
import type { MunicipalityLink, PartialDate } from '@cultuvilla/shared/models/person';
import { CURRENT_TERMS_VERSION, MIN_SELF_REGISTRATION_AGE } from '@cultuvilla/shared/models/user';
import { readPendingVillage, clearPendingVillage } from '../../lib/auth/pendingVillage';
import { showConfirm } from '../../lib/dialogs';
import { observability, OBSERVABILITY_EVENTS } from '@cultuvilla/shared';

function toPartialDate(d: Date | null): PartialDate | null {
  if (!d) return null;
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

export default function CompleteProfileScreen() {
  const { user, profile, refreshProfile, abandonSignUp } = useAuth();
  const { t } = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Onboarding residence: a single village (defaulting to the one just joined)
  // plus its barrio. The village is rarely changed here but stays editable.
  const [municipalityId, setMunicipalityId] = useState<string | null>(
    profile?.activeMunicipalityId ?? null,
  );
  const [barrioId, setBarrioId] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // A guest who tapped "sign in to join" on a village carried it here via
  // pendingVillage; pre-select it so they land already pointed at that pueblo.
  // The functional updater keeps any selection the user has already made, so a
  // late async resolve never clobbers a manual pick.
  useEffect(() => {
    if (profile?.activeMunicipalityId) return;
    void readPendingVillage().then((id) => {
      if (id) setMunicipalityId((current) => current ?? id);
    });
    // Seed once, on mount, for a fresh profile-less user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AuthGate routes a user with no personId here and to nowhere else, so this
  // is the only place a wrong-email sign-in can be undone — without it the sole
  // way forward is creating the account you were trying not to create.
  function onAbandon() {
    showConfirm(
      t('onboarding.completeProfile.abandonTitle'),
      t('onboarding.completeProfile.abandonBody', { email: user?.email ?? '' }),
      () => void abandonSignUp(),
      { confirmText: t('auth.signOut'), cancelText: t('common.cancel') },
    );
  }

  function handleVillageChange(id: string | null) {
    setMunicipalityId(id);
    setBarrioId(null);
  }

  async function onSubmit(values: PersonFormValues, photo: PersonFormPhoto | null) {
    if (!user) return;
    setError(null);
    setLoading(true);
    try {
      const birthPlaceLink: MunicipalityLink | null = values.birthPlaceMunicipalityId
        ? { municipalityId: values.birthPlaceMunicipalityId, barrioId: null }
        : null;
      const municipalityLinks = buildResidenceLinks(municipalityId, barrioId);

      // Free-text (non-catalog) entries are also tallied for suggestions —
      // fire-and-forget per entry, doesn't block onboarding.
      await Promise.all(
        values.occupations.filter((o) => !isCatalogOccupation(o)).map(recordOccupation),
      );

      let personId: string;
      if (profile?.personId) {
        personId = profile.personId;
      } else {
        const existing = await getPersonByUserId(user.uid, user.uid);
        personId = existing
          ? existing.id
          : await createPerson({
              givenName: values.givenName.trim(),
              firstSurname: values.firstSurname.trim() || null,
              secondSurname: values.secondSurname.trim() || null,
              nickname: values.nickname.trim() || null,
              sex: values.sex,
              birthday: toPartialDate(values.birthday),
              birthPlace: birthPlaceLink,
              municipalityLinks,
              biography: values.biography.trim() || null,
              occupations: values.occupations,
              userId: user.uid,
              createdBy: user.uid,
            });
      }

      // Write the account doc BEFORE joining a village. joinVillage's
      // setActiveMunicipality does an updateDoc on users/{uid}, and an updateDoc
      // against a not-yet-created doc makes the rules dereference a null
      // `resource.data`, which Firestore denies ("Missing or insufficient
      // permissions"). Creating the profile first guarantees the doc exists —
      // we don't rely on the syncPersonDenormalization trigger having landed
      // its displayName stub yet.
      const profilePatch = {
        activeMunicipalityId: municipalityId,
        personId,
      };
      if (profile) {
        await patchUserProfile(user.uid, profilePatch);
      } else {
        // First-time account creation: record acceptance of the current legal
        // version. createUserProfile stamps termsAcceptedAt server-side.
        await createUserProfile(user.uid, {
          email: user.email ?? '',
          ...profilePatch,
          termsVersion: CURRENT_TERMS_VERSION,
        });
      }

      // Picking a village at registration makes you a villager: create the
      // members/{uid} doc (activating the community first if it's still dormant)
      // so the village lands under "your villages" and as the active pueblo.
      // Runs before the residence upsert so the explicit barrio wins over the
      // whole-village residence link startVillage seeds on activation.
      if (municipalityId) {
        await ensureVillageMembership(municipalityId, user.uid, barrioId);
        // Residence barrio is single-source-of-truth on the person's
        // municipalityLinks. createPerson (new-person branch) already seeded it;
        // for an existing person, upsert it here. Idempotent either way.
        await updateResidenceBarrio(user.uid, municipalityId, barrioId);
      }

      if (photo) {
        const url = await uploadUserPhoto(user.uid, {
          blob: photo.blob,
          filename: `avatar-${Date.now()}.jpg`,
          contentType: photo.blob.type || 'image/jpeg',
        });
        await updatePerson(personId, { photoURL: url });
      }

      void clearPendingVillage();
      await refreshProfile();
      observability.trackEvent(
        OBSERVABILITY_EVENTS.ONBOARDING_COMPLETED,
        municipalityId ? { municipalityId } : {},
      );
      // AuthGate (_layout.tsx) owns post-onboarding routing.
    } catch (e) {
      setError(e instanceof Error ? e.message : t('onboarding.completeProfile.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen padded={false} bottomInset={false} topInset={false}>
      <ScreenHeader
        accent
        hideBack
        title={t('onboarding.completeProfile.title')}
        rightSlot={
          <Pressable
            onPress={onAbandon}
            accessibilityLabel={t('auth.signOut')}
            testID="onboarding-abandon"
            className="p-1 -mr-1"
          >
            {/* Same ink as the header's back chevron (ScreenHeader accent). */}
            <Ionicons name="log-out-outline" size={iconSizes.lg} color="#f9f0e8" />
          </Pressable>
        }
      />
      <PersonForm
        requireFullName
        selfProfile
        submitLabel={t('onboarding.completeProfile.submit')}
        loading={loading}
        error={error}
        renderResidence={() => (
          <>
            <VillagePicker
              label={t('profile.personForm.village')}
              value={municipalityId}
              onChange={handleVillageChange}
              testID="onboarding-village"
            />
            <BarrioPicker
              label={t('profile.personForm.barrio')}
              municipalityId={municipalityId}
              value={barrioId}
              onChange={setBarrioId}
              wholeVillageLabel={t('profile.personForm.wholeVillage')}
              testID="onboarding-barrio"
            />
          </>
        )}
        minAgeYears={MIN_SELF_REGISTRATION_AGE}
        consentSatisfied={acceptedTerms}
        renderConsent={() => (
          <Checkbox
            value={acceptedTerms}
            onValueChange={setAcceptedTerms}
            testID="accept-terms"
            label={
              <Text>
                {t('onboarding.completeProfile.acceptPrefix')}{' '}
                <Text
                  className="text-accent underline"
                  onPress={() => router.push(routes.terms)}
                >
                  {t('menu.terms')}
                </Text>
                {' '}
                {t('common.and')}
                {' '}
                <Text
                  className="text-accent underline"
                  onPress={() => router.push(routes.privacy)}
                >
                  {t('menu.privacy')}
                </Text>
              </Text>
            }
          />
        )}
        onSubmit={onSubmit}
      />
    </Screen>
  );
}

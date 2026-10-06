import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  BirthDateField,
  FieldLabel,
  HStack,
  ImagePickerField,
  Input,
  Pressable,
  Text,
  Toggle,
  VStack,
  VillagePicker,
} from '../primitives';
import { useT } from '../../lib/i18n';
import { pickImageAsBlob } from '../../lib/images';
import type { Sex } from '@cultuvilla/shared/models/core';
import type { UploadableImage } from '@cultuvilla/shared/services/imageService';
import {
  OCCUPATION_CATALOG,
  isCatalogOccupation,
  occupationI18nKey,
} from '@cultuvilla/shared/models/occupation';
import { maxBirthdayForAge } from '@cultuvilla/shared/utils';
import { Stepper, type StepConfig } from './Stepper';

export interface PersonFormValues {
  givenName: string;
  firstSurname: string;
  secondSurname: string;
  nickname: string;
  sex: Sex | null;
  birthday: Date | null;
  birthPlaceMunicipalityId: string | null;
  biography: string;
  /** Catalog keys (OCCUPATION_CATALOG) and/or free-text strings entered via
   * the "otro" input. Free-text entries are recorded via recordOccupation
   * by the caller on submit. */
  occupations: string[];
  /** Whether anyone may open this persona's card. Only meaningful for a
   * dependent persona — an account holder's own persona is always public. */
  isPublic: boolean;
}

/** Avatar photo picked in the form. Aliases the shared UploadableImage so the
 * form and the proposable surfaces share one image-input path (pickImageAsBlob). */
export type PersonFormPhoto = UploadableImage;

export interface PersonFormProps {
  initial?: Partial<PersonFormValues> & { photoURL?: string | null };
  submitLabel: string;
  loading?: boolean;
  error?: string | null;
  /**
   * Require given name + both surnames + birthday (self-registration at
   * onboarding). Implies `requireFirstSurname`.
   */
  requireFullName?: boolean;
  /**
   * Require given name + first surname + sex + birthday, without forcing the
   * second surname. Used by the linked-persona create flow — a lighter gate than
   * `requireFullName` (no second surname, no age floor).
   */
  requireFirstSurname?: boolean;
  /** Editing an existing person → every step is directly clickable. */
  editing?: boolean;
  /** True when the form edits the account owner's own persona (their profile),
   * vs. a linked persona. Switches the biography field from the neutral
   * "Biografía (opcional)" to a first-person invitation. */
  selfProfile?: boolean;
  /**
   * Residence editor injected into the Residence step, below birthplace. The
   * parent owns the residence model — membership-driven barrio pickers for the
   * caller's own persona, a multi-village links editor for non-account persons,
   * or a single village+barrio at onboarding — so PersonForm stays agnostic to
   * how residence is stored.
   */
  renderResidence?: () => ReactNode;
  /**
   * Consent UI (e.g. a terms-acceptance checkbox) rendered at the bottom of the
   * final step. Onboarding injects it; other consumers omit it.
   */
  renderConsent?: () => ReactNode;
  /**
   * When defined, gates the final step's submit on consent being satisfied.
   * `undefined` (the default) leaves the form ungated for consumers that don't
   * collect consent.
   */
  consentSatisfied?: boolean;
  /**
   * Minimum age (years) the birthday must satisfy. Set only for the account
   * owner's own profile at onboarding (Terms: self-registration is 14+); left
   * undefined for family personas, which have no age floor.
   */
  minAgeYears?: number;
  onSubmit: (values: PersonFormValues, photo: PersonFormPhoto | null) => Promise<void> | void;
}

export function PersonForm({
  initial,
  submitLabel,
  loading,
  error,
  requireFullName = false,
  requireFirstSurname = false,
  editing = false,
  selfProfile = false,
  renderResidence,
  renderConsent,
  consentSatisfied,
  minAgeYears,
  onSubmit,
}: PersonFormProps) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [photo, setPhoto] = useState<PersonFormPhoto | null>(null);
  const [givenName, setGivenName] = useState(initial?.givenName ?? '');
  const [firstSurname, setFirstSurname] = useState(initial?.firstSurname ?? '');
  const [secondSurname, setSecondSurname] = useState(initial?.secondSurname ?? '');
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  const [sex, setSex] = useState<Sex | null>(initial?.sex ?? null);
  const [birthday, setBirthday] = useState<Date | null>(initial?.birthday ?? null);
  // New personas default to public; editing keeps whatever the doc says.
  const [isPublic, setIsPublic] = useState(initial?.isPublic ?? true);
  const [birthPlace, setBirthPlace] = useState<string | null>(
    initial?.birthPlaceMunicipalityId ?? null
  );
  const [biography, setBiography] = useState(initial?.biography ?? '');
  const initialOccupations = initial?.occupations ?? [];
  const initialCustom = initialOccupations.filter((o) => !isCatalogOccupation(o));
  // 'otro' is a reveal toggle, not a stored occupation. Re-select it when the
  // person already has free-text entries so the custom UI shows on edit.
  const [selectedCatalog, setSelectedCatalog] = useState<string[]>(() => {
    const catalog = initialOccupations.filter(isCatalogOccupation).filter((k) => k !== 'otro');
    return initialCustom.length > 0 ? [...catalog, 'otro'] : catalog;
  });
  const [customOccupations, setCustomOccupations] = useState<string[]>(initialCustom);
  const [customOccupationInput, setCustomOccupationInput] = useState('');
  const showCustomOccupation = selectedCatalog.includes('otro');

  function toggleCatalogOccupation(key: string) {
    // Deselecting 'otro' discards free-text entries the user can no longer see.
    if (key === 'otro' && selectedCatalog.includes('otro')) {
      setCustomOccupations([]);
      setCustomOccupationInput('');
    }
    setSelectedCatalog((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function addCustomOccupation() {
    const value = customOccupationInput.trim();
    if (!value || customOccupations.includes(value)) return;
    setCustomOccupations((prev) => [...prev, value]);
    setCustomOccupationInput('');
  }

  function removeCustomOccupation(value: string) {
    setCustomOccupations((prev) => prev.filter((o) => o !== value));
  }

  async function handleSubmit() {
    await onSubmit(
      {
        givenName,
        firstSurname,
        secondSurname,
        nickname,
        sex,
        birthday,
        birthPlaceMunicipalityId: birthPlace,
        biography,
        occupations: [...selectedCatalog.filter((k) => k !== 'otro'), ...customOccupations],
        // An account persona is public by contract (firestore.rules rejects
        // anything else), so the form never sends false for one.
        isPublic: selfProfile ? true : isPublic,
      },
      photo
    );
  }

  function stepBody(children: ReactNode) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <VStack gap={3}>{children}</VStack>
      </ScrollView>
    );
  }

  // Self-registration age floor (Terms: 14+). The date picker caps by year, so
  // a same-year birthday can still be under-age — hence the explicit check that
  // also gates submit. Undefined minAgeYears (family personas) never gates.
  const birthdayMax = minAgeYears != null ? maxBirthdayForAge(minAgeYears, new Date()) : undefined;
  const birthdayTooYoung =
    birthdayMax != null && birthday != null && birthday.getTime() > birthdayMax.getTime();

  const steps: StepConfig[] = [
    {
      key: 'identity',
      title: t('profile.personForm.stepIdentity'),
      icon: 'person-outline',
      // Gate the first step (and thus any progress) on consent when the
      // consumer collects it. `=== false` so consumers that omit the prop are
      // never gated (undefined leaves the step valid).
      validate: () => {
        const errs: string[] = [];
        if (!givenName.trim()) errs.push('givenName');
        if ((requireFullName || requireFirstSurname) && !firstSurname.trim()) errs.push('firstSurname');
        if (requireFullName && !secondSurname.trim()) errs.push('secondSurname');
        if (!sex) errs.push('sex');
        if (consentSatisfied === false) errs.push('consent');
        return errs;
      },
      render: () =>
        stepBody(
          <>
            <Input
              label={t('onboarding.completeProfile.givenName')}
              value={givenName}
              onChangeText={setGivenName}
              testID="person-given-name"
            />
            <Input
              label={t('onboarding.completeProfile.firstSurname')}
              value={firstSurname}
              onChangeText={setFirstSurname}
              testID="person-first-surname"
            />
            <Input
              label={t('onboarding.completeProfile.secondSurname')}
              value={secondSurname}
              onChangeText={setSecondSurname}
              testID="person-second-surname"
            />
            <Input
              label={t('onboarding.completeProfile.nickname')}
              value={nickname}
              onChangeText={setNickname}
              testID="person-nickname"
            />
            <VStack gap={1}>
              <FieldLabel>{t('onboarding.completeProfile.sex')}</FieldLabel>
              <HStack gap={2}>
                {(['female', 'male', 'other'] as const).map((opt) => {
                  const active = sex === opt;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => setSex(opt)}
                      testID={`person-sex-${opt}`}
                      accessibilityLabel={t(`onboarding.completeProfile.sex_${opt}`)}
                      className={`flex-1 py-2.5 rounded-md border items-center justify-center ${
                        active ? 'bg-accent border-accent' : 'bg-surface border-subtle'
                      }`}
                    >
                      <Text variant="bodySm" tone={active ? 'onAccent' : 'primary'}>
                        {t(`onboarding.completeProfile.sex_${opt}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </HStack>
            </VStack>
            {selfProfile ? null : (
              <VStack gap={2}>
                <FieldLabel>{t('profile.personForm.visibilityLabel')}</FieldLabel>
                <Toggle
                  value={isPublic}
                  onValueChange={setIsPublic}
                  label={t(
                    isPublic
                      ? 'profile.personForm.visibilityPublic'
                      : 'profile.personForm.visibilityPrivate',
                  )}
                  testID="person-is-public"
                />
                <Text tone="muted" variant="bodySm">
                  {t(
                    isPublic
                      ? 'profile.personForm.visibilityPublicHint'
                      : 'profile.personForm.visibilityPrivateHint',
                  )}
                </Text>
              </VStack>
            )}
            {renderConsent?.()}
          </>,
        ),
    },
    {
      key: 'residence',
      title: t('profile.personForm.stepResidence'),
      icon: 'location-outline',
      validate: () => {
        const errs: string[] = [];
        if ((requireFullName || requireFirstSurname) && !birthday) errs.push('birthday');
        if (birthdayTooYoung) errs.push('birthday-min-age');
        return errs;
      },
      render: () =>
        stepBody(
          <>
            <BirthDateField
              label={t('onboarding.completeProfile.birthday')}
              value={birthday}
              onChange={setBirthday}
              minimumDate={new Date(1900, 0, 1)}
              maximumDate={birthdayMax ?? new Date()}
              testID="birthday"
            />
            {birthdayTooYoung ? (
              <Text tone="danger" variant="bodySm" testID="birthday-min-age-error">
                {t('onboarding.completeProfile.minAge')}
              </Text>
            ) : null}
            <VillagePicker
              label={t('onboarding.completeProfile.birthPlace')}
              value={birthPlace}
              onChange={setBirthPlace}
            />
            {renderResidence?.()}
          </>,
        ),
    },
    {
      key: 'about',
      title: t('profile.personForm.stepAbout'),
      icon: 'document-text-outline',
      validate: () => [],
      render: () =>
        stepBody(
          <>
            <FieldLabel>{t('common.photo')}</FieldLabel>
            <ImagePickerField
              uri={photo?.previewUri ?? initial?.photoURL ?? null}
              onPress={async () => {
                const next = await pickImageAsBlob({ square: true });
                if (next) setPhoto(next);
              }}
              label={t('common.photo')}
            />
            <Input
              label={t(
                selfProfile
                  ? 'onboarding.completeProfile.biographySelf'
                  : 'onboarding.completeProfile.biography',
              )}
              value={biography}
              onChangeText={setBiography}
              multiline
              numberOfLines={4}
            />
            <VStack gap={2}>
              <FieldLabel>{t('occupations.picker.label')}</FieldLabel>
              <View className="flex-row flex-wrap gap-2">
                {OCCUPATION_CATALOG.map((key) => {
                  const active = selectedCatalog.includes(key);
                  return (
                    <Pressable
                      key={key}
                      onPress={() => toggleCatalogOccupation(key)}
                      testID={`occupation-${key}`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: active }}
                      className={`px-3 py-1.5 rounded-full border ${
                        active ? 'bg-accent border-accent' : 'bg-surface border-subtle'
                      }`}
                    >
                      <Text variant="bodySm" tone={active ? 'onAccent' : 'primary'}>
                        {t(occupationI18nKey(key))}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {showCustomOccupation && (
                <>
                  {customOccupations.length > 0 && (
                    <View className="flex-row flex-wrap gap-2">
                      {customOccupations.map((value) => (
                        <Pressable
                          key={value}
                          onPress={() => removeCustomOccupation(value)}
                          className="px-3 py-1.5 rounded-full border bg-accent border-accent"
                        >
                          <Text variant="bodySm" tone="onAccent">
                            {value} ✕
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  <HStack gap={2}>
                    <View className="flex-1">
                      <Input
                        label={t('occupations.picker.customLabel')}
                        value={customOccupationInput}
                        onChangeText={setCustomOccupationInput}
                        placeholder={t('occupations.picker.customPlaceholder')}
                        testID="occupation-custom-input"
                      />
                    </View>
                    <Button
                      variant="secondary"
                      onPress={addCustomOccupation}
                      disabled={!customOccupationInput.trim()}
                      testID="occupation-custom-add"
                    >
                      {t('occupations.picker.add')}
                    </Button>
                  </HStack>
                </>
              )}
            </VStack>
          </>,
        ),
    },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stepper
        steps={steps}
        onComplete={handleSubmit}
        submitLabel={submitLabel}
        loading={loading}
        submitError={error}
        allStepsReachable={editing}
        primaryTestID="person-form-primary"
      />
    </KeyboardAvoidingView>
  );
}

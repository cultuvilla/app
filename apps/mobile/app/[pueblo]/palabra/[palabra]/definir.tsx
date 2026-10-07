import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '../../../../components/primitives/Screen';
import { VStack } from '../../../../components/primitives/VStack';
import { Text } from '../../../../components/primitives/Text';
import { ScreenTitle } from '../../../../components/primitives/ScreenTitle';
import { ScreenHeader } from '../../../../components/layout/ScreenHeader';
import { Stepper, type StepConfig } from '../../../../components/feature/Stepper';
import {
  DefinitionFields,
  EMPTY_DEFINITION_DRAFT,
  type DefinitionDraft,
} from '../../../../components/feature/vocabulary/DefinitionFields';
import {
  DigitizationPicker,
  EMPTY_DIGITIZATION_CREDIT,
  type DigitizationCredit,
} from '../../../../components/feature/vocabulary/DigitizationPicker';
import { useT } from '../../../../lib/i18n';
import { useEntityCapabilities } from '../../../../lib/auth/useEntityCapabilities';
import { useVillageRoute, withVillageRoute } from '../../../../lib/navigation/VillageRouteGate';
import { vocabularyTermId } from '@cultuvilla/shared/models';
import {
  addVocabularyDefinition,
  getVocabularyTerm,
  type VocabularyTermWithId,
} from '@cultuvilla/shared/services/vocabularyService';

function stepBody(children: ReactNode) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

/**
 * "Añadir significado": another meaning for a word the pueblo already has, and
 * who digitalized it. The word's own credit is untouched — it belongs to
 * whoever first recorded the word — so this credit lands on the meaning only.
 */
function DefineVocabularyTermScreen() {
  const { municipalityId: villageId } = useVillageRoute();
  const { palabra } = useLocalSearchParams<{ palabra: string }>();
  const termId = palabra ? vocabularyTermId(villageId, palabra) : '';
  const { t } = useT();
  const { uid, isMember } = useEntityCapabilities(villageId);

  const [term, setTerm] = useState<VocabularyTermWithId | null>(null);
  const [draft, setDraft] = useState<DefinitionDraft>(EMPTY_DEFINITION_DRAFT);
  const [credit, setCredit] = useState<DigitizationCredit>(EMPTY_DIGITIZATION_CREDIT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!termId) return;
    let cancelled = false;
    void getVocabularyTerm(termId).then((loaded) => {
      if (!cancelled) setTerm(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [termId]);

  async function submit() {
    if (!term || !uid || !isMember || !draft.definition.trim()) return;
    setSaving(true);
    try {
      await addVocabularyDefinition({
        municipalityId: term.municipalityId,
        termId: term.id,
        createdBy: uid,
        contributorUserIds: credit.userIds,
        contributorOrgIds: credit.orgIds,
        ...draft,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  }

  const steps: StepConfig[] = [
    {
      key: 'meaning',
      title: t('village.vocabulary.stepMeaning'),
      icon: 'create-outline',
      validate: () => (draft.definition.trim() ? [] : ['definition']),
      render: () =>
        stepBody(
          <>
            {term ? (
              <VStack gap={0}>
                <Text tone="muted" variant="bodySm">
                  {t('village.vocabulary.addingMeaningTo')}
                </Text>
                <ScreenTitle>{term.term}</ScreenTitle>
              </VStack>
            ) : null}
            <DefinitionFields value={draft} onChange={setDraft} />
          </>,
        ),
    },
    {
      key: 'digitization',
      title: t('village.vocabulary.stepDigitization'),
      icon: 'people-outline',
      render: () =>
        stepBody(
          villageId && uid ? (
            <DigitizationPicker
              municipalityId={villageId}
              authorId={uid}
              value={credit}
              onChange={setCredit}
            />
          ) : null,
        ),
    },
  ];

  return (
    <Screen padded={false} bottomInset={false}>
      <ScreenHeader title={t('village.vocabulary.addDefinition')} />
      <View style={{ flex: 1 }}>
        <Stepper
          steps={steps}
          onComplete={() => void submit()}
          submitLabel={t('village.vocabulary.save')}
          loading={saving}
          primaryTestID="vocabulary-definition-submit"
        />
      </View>
    </Screen>
  );
}

export default withVillageRoute(DefineVocabularyTermScreen);

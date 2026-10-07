import { wordHref } from '../../../lib/navigation/routes';
import { termSlugFromId } from '@cultuvilla/shared/models';
import { useVillageRoute, withVillageRoute } from '../../../lib/navigation/VillageRouteGate';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../../../components/primitives/Screen';
import { VStack } from '../../../components/primitives/VStack';
import { HStack } from '../../../components/primitives/HStack';
import { Text } from '../../../components/primitives/Text';
import { Input } from '../../../components/primitives/Input';
import { Pressable } from '../../../components/primitives/Pressable';
import { FieldLabel } from '../../../components/primitives/FieldLabel';
import { ScreenHeader } from '../../../components/layout/ScreenHeader';
import { Stepper, type StepConfig } from '../../../components/feature/Stepper';
import {
  DefinitionFields,
  EMPTY_DEFINITION_DRAFT,
  type DefinitionDraft,
} from '../../../components/feature/vocabulary/DefinitionFields';
import { ExistingWordSuggestions } from '../../../components/feature/vocabulary/ExistingWordSuggestions';
import {
  DigitizationPicker,
  EMPTY_DIGITIZATION_CREDIT,
  type DigitizationCredit,
} from '../../../components/feature/vocabulary/DigitizationPicker';
import { useT } from '../../../lib/i18n';
import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';
import { addVocabularyEntry } from '@cultuvilla/shared/services/vocabularyService';
import {
  VOCABULARY_TERM_KINDS,
  type VocabularyTermKind,
} from '@cultuvilla/shared/models/vocabulary';

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
 * "Añadir palabra": the word and its first meaning, then who digitalized it.
 *
 * The term is keyed by its own slug, so submitting a word somebody already
 * recorded attaches your meaning to theirs rather than failing or forking the
 * entry. The one credit picked here goes on the word (when it is new) and on
 * the meaning.
 */
function NewVocabularyTermScreen() {
  const { municipalityId: villageId, slug: villageSlug } = useVillageRoute();
  const { t } = useT();
  const { uid, isMember } = useEntityCapabilities(villageId);

  const [term, setTerm] = useState('');
  const [kind, setKind] = useState<VocabularyTermKind>('palabra');
  // Set when the villager took an existing word from the suggestions: their
  // village is joining a word other pueblos already have, so the spelling and
  // the kind are the word's, not theirs to restate.
  const [joining, setJoining] = useState<{ term: string; villageCount: number } | null>(null);
  const [draft, setDraft] = useState<DefinitionDraft>(EMPTY_DEFINITION_DRAFT);
  const [credit, setCredit] = useState<DigitizationCredit>(EMPTY_DIGITIZATION_CREDIT);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!villageId || !uid || !isMember || !term.trim() || !draft.definition.trim()) return;
    setSaving(true);
    try {
      const termId = await addVocabularyEntry({
        municipalityId: villageId,
        term,
        kind,
        createdBy: uid,
        contributorUserIds: credit.userIds,
        contributorOrgIds: credit.orgIds,
        ...draft,
      });
      router.replace(wordHref(villageSlug, termSlugFromId(termId)));
    } finally {
      setSaving(false);
    }
  }

  const steps: StepConfig[] = [
    {
      key: 'word',
      title: t('village.vocabulary.stepWord'),
      icon: 'create-outline',
      validate: () => [
        ...(term.trim() ? [] : ['term']),
        ...(draft.definition.trim() ? [] : ['definition']),
      ],
      render: () =>
        stepBody(
          <>
            <Input
              label={t('village.vocabulary.term')}
              value={term}
              onChangeText={(next) => {
                setTerm(next);
                // Editing the word again means they are no longer taking the
                // suggested one.
                if (joining && next !== joining.term) setJoining(null);
              }}
              placeholder={t('village.vocabulary.termPlaceholder')}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={80}
              testID="vocabulary-term-input"
            />
            {joining ? (
              <Text tone="muted" variant="bodySm" testID="vocabulary-joining-notice">
                {t('village.vocabulary.joiningWord', { count: joining.villageCount })}
              </Text>
            ) : (
              <ExistingWordSuggestions
                query={term}
                onPick={(word) => {
                  setTerm(word.term);
                  setKind(word.kind);
                  setJoining({ term: word.term, villageCount: word.villageCount });
                }}
              />
            )}
            <VStack gap={2}>
              <FieldLabel>{t('village.vocabulary.kindLabel')}</FieldLabel>
              <HStack gap={2} className="flex-wrap">
                {VOCABULARY_TERM_KINDS.map((option) => (
                  <Pressable
                    key={option}
                    onPress={() => setKind(option)}
                    className={`px-3 py-2 rounded-md border ${
                      kind === option ? 'bg-accent border-accent' : 'border-subtle'
                    }`}
                    testID={`vocabulary-kind-${option}`}
                  >
                    <Text variant="bodySm" tone={kind === option ? 'onAccent' : 'primary'}>
                      {t(`village.vocabulary.kind.${option}`)}
                    </Text>
                  </Pressable>
                ))}
              </HStack>
            </VStack>
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
      <ScreenHeader title={t('village.vocabulary.add')} />
      <View style={{ flex: 1 }}>
        <Stepper
          steps={steps}
          onComplete={() => void submit()}
          submitLabel={t('village.vocabulary.save')}
          loading={saving}
          primaryTestID="vocabulary-submit"
        />
      </View>
    </Screen>
  );
}

export default withVillageRoute(NewVocabularyTermScreen);

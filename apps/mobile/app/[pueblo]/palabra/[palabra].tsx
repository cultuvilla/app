import { useCallback, useState } from 'react';
import { Platform, KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { iconSizes, colors } from '@cultuvilla/shared/design-system';
import { Screen } from '../../../components/primitives/Screen';
import { Text } from '../../../components/primitives/Text';
import { HStack } from '../../../components/primitives/HStack';
import { VStack } from '../../../components/primitives/VStack';
import { Pressable } from '../../../components/primitives/Pressable';
import { Fab } from '../../../components/primitives/Fab';
import { ScreenHeader } from '../../../components/layout/ScreenHeader';
import { ScreenTitle } from '../../../components/primitives/ScreenTitle';
import { DetailSectionHeading } from '../../../components/feature/DetailSectionHeading';
import { EntityComments } from '../../../components/feature/EntityComments';
import { OtherVillagesSaying } from '../../../components/feature/vocabulary/OtherVillagesSaying';
import { EntityContributors } from '../../../components/feature/EntityContributors';
import { ReportSheet, type ReportTarget } from '../../../components/feature/ReportSheet';
import { useT } from '../../../lib/i18n';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useAuth } from '../../../lib/auth/useAuth';
import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';
import {
  deleteVocabularyDefinition,
  deleteVocabularyTerm,
  watchVocabularyDefinitions,
  watchVocabularyTerm,
  type VocabularyDefinitionWithId,
  type VocabularyTermWithId,
} from '@cultuvilla/shared/services/vocabularyService';
import { recordEntityView } from '@cultuvilla/shared/services/commentsService';
import { formatDate } from '@cultuvilla/shared/utils';
import { termSlugFromId, vocabularyTermId } from '@cultuvilla/shared/models';
import { defineWordHref } from '../../../lib/navigation/routes';
import { useVillageRoute, withVillageRoute } from '../../../lib/navigation/VillageRouteGate';

/**
 * One headword and every meaning the pueblo has given it.
 *
 * Deliberately NOT an `EntityDetailScaffold` consumer: a word has no hero image
 * and no card scroll, so it is a plain `ScreenHeader` screen. It does carry
 * comments, which is why `vocabularyTerm` is in `ENTITY_KINDS` — that list is
 * "comment-capable kinds", not the hero-detail entity family.
 */
function VocabularyTermScreen() {
  const {
    municipalityId: villageId,
    slug: villageSlug,
    name: villageName,
  } = useVillageRoute();
  const { palabra } = useLocalSearchParams<{ palabra: string }>();
  // A term's doc id is `<municipalityId>__<slug>`; the URL carries the slug.
  const termId = palabra ? vocabularyTermId(villageId, palabra) : '';
  const { t } = useT();
  const { user } = useAuth();
  const { canManage, isMember } = useEntityCapabilities(villageId);

  const termWatch = useWatch<VocabularyTermWithId | null>(
    'vocabularyTerm:watchVocabularyTerm',
    termId || null,
    (next, error) => watchVocabularyTerm(termId, next, error),
  );
  const definitionsWatch = useWatch<VocabularyDefinitionWithId[]>(
    'vocabularyTerm:watchVocabularyDefinitions',
    termId || null,
    (next, error) => watchVocabularyDefinitions(termId, next, error),
  );
  const loading = termWatch.status === 'loading' || definitionsWatch.status === 'loading';
  const term = loading ? null : (termWatch.data ?? null);
  const definitions = definitionsWatch.data ?? [];
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!termId || !villageId) return;
      void recordEntityView({
        entityKind: 'vocabularyTerm',
        entityId: termId,
        municipalityId: villageId,
      }).catch(() => {});
    }, [termId, villageId]),
  );

  async function removeDefinition(definitionId: string) {
    await deleteVocabularyDefinition(definitionId);
  }

  /**
   * Removing the last meaning leaves an empty headword, which is not a word the
   * pueblo has any record of — so the author's delete takes the term with it.
   * Firestore rules permit that only at `definitionCount === 0`, and the count
   * is trigger-owned, so the live term listener is what makes this reachable.
   */
  async function removeTerm() {
    if (!term) return;
    await deleteVocabularyTerm(term.id);
    router.back();
  }

  const isOwnTerm = Boolean(user && term && term.createdBy === user.uid);
  const canDeleteTerm =
    Boolean(term) && (canManage || (isOwnTerm && (term?.definitionCount ?? 0) === 0));

  return (
    <Screen padded={false} bottomInset={false}>
      <ScreenHeader
        title={t('village.vocabulary.title', { village: villageName })}
        rightSlot={
          canDeleteTerm ? (
            <Pressable onPress={() => void removeTerm()} testID="vocabulary-delete-term">
              <Ionicons name="trash-outline" size={iconSizes.md} color={colors.light.fg.muted} />
            </Pressable>
          ) : null
        }
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 96 }}>
          {!term ? (
            <Text tone="muted">{loading ? '' : t('village.vocabulary.notFound')}</Text>
          ) : (
            <>
              <VStack gap={3} className="items-center py-4">
                <View
                  className="rounded-full bg-accent-subtle"
                  style={{ paddingHorizontal: 12, paddingVertical: 4 }}
                >
                  <Text
                    variant="caption"
                    className="font-semibold uppercase text-accent"
                    style={{ letterSpacing: 1 }}
                    testID="vocabulary-term-kind"
                  >
                    {t(`village.vocabulary.kind.${term.kind}`)}
                  </Text>
                </View>
                <ScreenTitle className="text-center">{term.term}</ScreenTitle>
              </VStack>

              <EntityContributors
                userIds={term.contributorUserIds}
                orgIds={term.contributorOrgIds}
                label={t('village.contributors.label')}
              />

              <VStack gap={3}>
                <DetailSectionHeading>
                  {t('village.vocabulary.definitions')}
                </DetailSectionHeading>
                {definitions.map((definition, index) => (
                  <View key={definition.id} className="border-b border-subtle pb-3">
                    <HStack gap={3} className="items-start">
                      <Text tone="muted" variant="bodySm">
                        {index + 1}.
                      </Text>
                      <VStack gap={1} className="flex-1">
                        <Text>{definition.definition}</Text>
                        {definition.example ? (
                          <Text tone="muted" variant="bodySm" className="italic">
                            “{definition.example}”
                          </Text>
                        ) : null}
                        {definition.castellano ? (
                          <Text tone="muted" variant="bodySm">
                            {t('village.vocabulary.castellano')}: {definition.castellano}
                          </Text>
                        ) : null}
                        <EntityContributors
                          variant="inline"
                          userIds={definition.contributorUserIds}
                          orgIds={definition.contributorOrgIds}
                          label={formatDate(definition.createdAt)}
                        />
                      </VStack>
                      {user ? (
                        <Pressable
                          onPress={() =>
                            definition.createdBy === user.uid || canManage
                              ? void removeDefinition(definition.id)
                              : setReportTarget({
                                  kind: 'vocabularyTerm',
                                  id: term.id,
                                  municipalityId: term.municipalityId,
                                  authorUserId: definition.createdBy,
                                })
                          }
                          testID={`vocabulary-definition-action-${definition.id}`}
                        >
                          <Ionicons
                            name={
                              definition.createdBy === user.uid || canManage
                                ? 'trash-outline'
                                : 'flag-outline'
                            }
                            size={iconSizes.sm}
                            color={colors.light.fg.muted}
                          />
                        </Pressable>
                      ) : null}
                    </HStack>
                  </View>
                ))}

              </VStack>

              <OtherVillagesSaying
                normalized={term.normalized}
                municipalityId={term.municipalityId}
              />

              <EntityComments
                entityKind="vocabularyTerm"
                entityId={term.id}
                municipalityId={term.municipalityId}
                canModerate={canManage}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      {term && isMember ? (
        <Fab
          label={t('village.vocabulary.addDefinition')}
          onPress={() => router.push(defineWordHref(villageSlug, termSlugFromId(term.id)))}
          testID="vocabulary-add-definition"
        />
      ) : null}
      <ReportSheet
        visible={reportTarget != null}
        target={reportTarget}
        reporterUserId={user?.uid ?? ''}
        onClose={() => setReportTarget(null)}
      />
    </Screen>
  );
}

export default withVillageRoute(VocabularyTermScreen);

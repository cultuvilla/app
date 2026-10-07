import { useEffect, useReducer, useState } from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, Text, Button, Pressable } from '../primitives';
import { useT } from '../../lib/i18n';
import { getMunicipality } from '@cultuvilla/shared/services/municipalityService';
import { updateCensoSchema } from '@cultuvilla/shared/services/censoService';
import {
  collectUsedValues,
  answeredCountByKey,
  getVillageCensoAnswers,
} from '@cultuvilla/shared/services/membershipProfileService';
import { censoEditorReducer, fieldErrors, type EditorAction } from './censo/censoEditorReducer';
import { QuestionCard } from './censo/QuestionCard';
import { QuestionTypeSheet, type SheetPick } from './censo/QuestionTypeSheet';
import { ACCENT } from './VillageSections';

/**
 * Organizer-only census authoring, styled after a forms builder: a stack of
 * question cards on a canvas, one expanded at a time. Fields already answered
 * by members are "locked" (cannot be removed or retyped). Content-only (no
 * Screen/Header) so it embeds in the shared censo screen behind a role check.
 */
export function CensoSchemaEditor({ villageId }: { villageId: string }) {
  const { t } = useT();
  const [fields, dispatch] = useReducer(censoEditorReducer, []);
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Index of the expanded card; null = all collapsed (overview).
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [answeredCounts, setAnsweredCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [mun, answers] = await Promise.all([
        getMunicipality(villageId),
        getVillageCensoAnswers(villageId),
      ]);
      const used = collectUsedValues(answers);
      if (cancelled) return;
      setLocked(new Set(Object.entries(used).filter(([, v]) => v.size > 0).map(([k]) => k)));
      setAnsweredCounts(answeredCountByKey(answers));
      dispatch({ kind: 'reset', fields: mun?.community?.profileForm?.fields ?? [] });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [villageId]);

  const errors = fieldErrors(fields);

  function addQuestion(pick: SheetPick) {
    const newIndex = fields.length;
    if (pick.kind === 'entity') {
      dispatch({ kind: 'addCustom', type: 'select' });
      dispatch({ kind: 'setSource', index: newIndex, source: pick.source });
    } else {
      dispatch({ kind: 'addCustom', type: pick.type });
    }
    setActiveIndex(newIndex);
  }

  async function save() {
    setSaveError(null);
    setSaving(true);
    try {
      await updateCensoSchema(villageId, fields);
      router.back();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t('censo.error'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Text className="p-4">{t('common.loading')}</Text>;

  return (
    <ScrollView contentContainerClassName="p-4 pb-12">
      <VStack gap={3}>
        {/* Intro line above the first card */}
        <Text variant="h2" style={{ color: '#566047' }} className="px-1">
          {t('censo.builder.headerDescription')}
        </Text>

        {fields.map((f, i) => (
          <QuestionCard
            key={i}
            field={f}
            index={i}
            dispatch={dispatch as (a: EditorAction) => void}
            locked={locked.has(f.key)}
            answeredCount={answeredCounts[f.key] ?? 0}
            error={errors[i]}
            active={activeIndex === i}
            onActivate={() => setActiveIndex(i)}
            onMove={(dir) => {
              dispatch({ kind: 'move', index: i, dir });
              const j = i + dir;
              if (j >= 0 && j < fields.length) setActiveIndex(j);
            }}
            onRemove={() => {
              dispatch({ kind: 'remove', index: i });
              setActiveIndex(null);
            }}
          />
        ))}

        {/* Add a new question */}
        <Pressable
          onPress={() => setAddSheetOpen(true)}
          className="border border-dashed border-subtle rounded-xl p-4"
        >
          <HStack gap={2} align="center" justify="center">
            <Ionicons name="add-circle-outline" size={22} color={ACCENT} />
            <Text style={{ color: ACCENT }} className="font-medium">{t('censo.builder.addQuestion')}</Text>
          </HStack>
        </Pressable>

        {saveError !== null && <Text tone="danger">{saveError}</Text>}

        <Button onPress={save} loading={saving} disabled={Object.keys(errors).length > 0}>
          {t('common.save')}
        </Button>
      </VStack>

      <QuestionTypeSheet
        visible={addSheetOpen}
        onSelect={addQuestion}
        onClose={() => setAddSheetOpen(false)}
      />
    </ScrollView>
  );
}

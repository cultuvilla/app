import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@cultuvilla/shared/design-system';
import { Input, Toggle, Pressable, Text, HStack } from '../../primitives';
import { OptionsEditor } from '../questions/OptionsEditor';
import { QuestionCardShell } from '../questions/QuestionCardShell';
import { QuestionTypeSheet, type SheetPick } from './QuestionTypeSheet';
import { resolveFieldDisplay } from '@cultuvilla/shared/services/censoFieldResolver';
import type { EditorAction } from './censoEditorReducer';
import type { OptionsSource, ProfileFormField } from '@cultuvilla/shared/models/municipality/CensoTypes';
import { useT } from '../../../lib/i18n';
import { showConfirm } from '../../../lib/dialogs';

const SOURCE_LABEL: Record<OptionsSource, string> = {
  barrios: 'censo.builder.sourceBarrios',
  places: 'censo.builder.sourcePlaces',
  organizations: 'censo.builder.sourceOrganizations',
  events: 'censo.builder.sourceEvents',
  festivalPosters: 'censo.builder.sourceFestivalPosters',
  news: 'censo.builder.sourceNews',
};

export function QuestionCard({
  field,
  index,
  dispatch,
  locked,
  answeredCount,
  error,
  active,
  onActivate,
  onMove,
  onRemove,
}: {
  field: ProfileFormField;
  index: number;
  dispatch: (a: EditorAction) => void;
  locked: boolean;
  answeredCount: number;
  error?: string;
  active: boolean;
  onActivate: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { t } = useT();
  const [sheetOpen, setSheetOpen] = useState(false);
  const r = resolveFieldDisplay(field);
  const isCustom = field.source === 'custom';
  const isChoice = r.type === 'select' || r.type === 'multiselect';
  const isEntity = isChoice && r.optionsSource !== undefined;
  const optionCount = field.source === 'custom' ? field.options?.length ?? 0 : 0;

  const title = r.label.trim() || t('questions.untitled');
  const typeLabel = isEntity
    ? t(SOURCE_LABEL[r.optionsSource as OptionsSource])
    : t(`censo.types.${r.type}`);
  const subline = isEntity
    ? typeLabel
    : isChoice
      ? `${typeLabel} · ${t('questions.optionsCount', { count: optionCount })}`
      : typeLabel;

  function handleRemove() {
    if (answeredCount > 0) {
      showConfirm(
        t('censo.builder.deleteAnsweredTitle'),
        t('censo.builder.deleteAnsweredBody', { count: answeredCount }),
        onRemove,
        { confirmText: t('common.delete') },
      );
      return;
    }
    onRemove();
  }

  // Translate a sheet pick into reducer actions. A generic choice type forces
  // static options via setOptions (which clears any optionsSource); an entity
  // pick ensures a choice type then sets the village source.
  function applyPick(pick: SheetPick) {
    if (pick.kind === 'entity') {
      if (!isChoice) dispatch({ kind: 'changeType', index, type: 'select' });
      dispatch({ kind: 'setSource', index, source: pick.source });
      return;
    }
    dispatch({ kind: 'changeType', index, type: pick.type });
    if (pick.type === 'select' || pick.type === 'multiselect') {
      const existing = field.source === 'custom' && field.optionsSource === undefined ? field.options ?? [] : [];
      dispatch({ kind: 'setOptions', index, options: existing });
    }
  }

  return (
    <QuestionCardShell
      index={index}
      title={title}
      subline={subline}
      error={error ? t(`questions.${error}`) : undefined}
      required={r.required}
      onRequiredChange={(b) => dispatch({ kind: 'setRequired', index, required: b })}
      active={active}
      onActivate={onActivate}
      onMove={onMove}
      onRemove={handleRemove}
      locked={locked}
    >
      {isCustom ? (
        <Input
          value={r.label}
          onChangeText={(v) => dispatch({ kind: 'setLabel', index, label: v })}
          placeholder={t('questions.emptyLabel')}
        />
      ) : (
        <Text variant="body">{r.label}</Text>
      )}

      {/* Type selector — opens the bottom sheet. Predefined/locked fields
          can't change type, so they show it read-only. */}
      {isCustom && !locked ? (
        <Pressable
          onPress={() => setSheetOpen(true)}
          className="border border-subtle rounded-lg px-3 py-2"
        >
          <HStack gap={2} align="center" justify="between">
            <Text>{typeLabel}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.light.fg.icon} />
          </HStack>
        </Pressable>
      ) : (
        <Text variant="bodySm" tone="muted">{typeLabel}</Text>
      )}

      {/* Choice configuration */}
      {isCustom && isChoice && (
        isEntity ? (
          !locked && (
            <Toggle
              label={t('censo.builder.allowMultiple')}
              value={r.type === 'multiselect'}
              onValueChange={(multi) =>
                dispatch({ kind: 'changeType', index, type: multi ? 'multiselect' : 'select' })
              }
            />
          )
        ) : (
          field.source === 'custom' && (
            <OptionsEditor
              options={field.options ?? []}
              mode={r.type === 'multiselect' ? 'multi' : 'single'}
              onChange={(opts) => dispatch({ kind: 'setOptions', index, options: opts })}
            />
          )
        )
      )}

      <QuestionTypeSheet
        visible={sheetOpen}
        current={isEntity ? { kind: 'entity', source: r.optionsSource as OptionsSource } : { kind: 'type', type: r.type }}
        onSelect={applyPick}
        onClose={() => setSheetOpen(false)}
      />
    </QuestionCardShell>
  );
}

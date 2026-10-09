import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Input, Pressable, Text, VStack, HStack } from '../../primitives';
import { OptionsEditor } from '../questions/OptionsEditor';
import { QuestionCardShell } from '../questions/QuestionCardShell';
import { TypeSheet, type TypeSheetSection } from '../questions/TypeSheet';
import {
  MAX_SIGNUP_FIELDS,
  makeSignupFieldId,
  type SignupFieldSpec,
  type SignupFieldType,
} from '@cultuvilla/shared/models/event/SignupFieldModel';
import { useT } from '../../../lib/i18n';
import { ACCENT } from '../VillageSections';

const TYPE_SECTIONS: TypeSheetSection[] = [
  {
    rows: [
      { id: 'text', labelKey: 'event.signupFields.type.text', icon: 'text-outline' },
      { id: 'select', labelKey: 'event.signupFields.type.select', icon: 'radio-button-on-outline' },
      { id: 'number', labelKey: 'event.signupFields.type.number', icon: 'calculator-outline' },
      { id: 'checkbox', labelKey: 'event.signupFields.type.checkbox', icon: 'toggle-outline' },
      { id: 'date', labelKey: 'event.signupFields.type.date', icon: 'calendar-outline' },
    ],
  },
];

/** index -> i18n error key suffix under `questions`, mirroring the census builder. */
export function signupFieldErrors(fields: SignupFieldSpec[]): Record<number, string> {
  const errs: Record<number, string> = {};
  fields.forEach((f, i) => {
    if (!f.label.trim()) {
      errs[i] = 'emptyLabel';
      return;
    }
    if (f.type === 'select' && f.options.filter((o) => o.trim()).length === 0) {
      errs[i] = 'needsOptions';
    }
  });
  return errs;
}

export interface SignupQuestionsEditorProps {
  value: SignupFieldSpec[];
  onChange: (next: SignupFieldSpec[]) => void;
  /**
   * How many questions were already on the event when it last had a sign-up.
   * Those entries are frozen: answers are stored under their ids and matched by
   * position, so removing, reordering or retyping one strands the data. Mirrors
   * `isAdditiveSignupFieldChange` and the rules-level size gate.
   */
  lockedCount?: number;
}

/**
 * Creator-side editor for an event's custom sign-up questions — the last step of
 * the event form. Same forms-builder presentation as the village census builder
 * (`CensoSchemaEditor`): a stack of question cards, one expanded at a time, with
 * a bottom sheet for the question type.
 */
export function SignupQuestionsEditor({
  value,
  onChange,
  lockedCount = 0,
}: SignupQuestionsEditorProps) {
  const { t } = useT();
  // Index of the expanded card; null = all collapsed (overview).
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [typeSheetIndex, setTypeSheetIndex] = useState<number | null>(null);

  const errors = signupFieldErrors(value);

  const patch = (index: number, changes: Partial<SignupFieldSpec>) => {
    onChange(value.map((f, i) => (i === index ? { ...f, ...changes } : f)));
  };

  function addQuestion(type: SignupFieldType) {
    if (value.length >= MAX_SIGNUP_FIELDS) return;
    onChange([...value, { id: makeSignupFieldId(), label: '', type, required: false, options: [] }]);
    setActiveIndex(value.length);
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    // Locked rows must keep their position: the additive-only rule compares the
    // leading slice of the list by (id, type).
    if (j < lockedCount || j >= value.length) return;
    const next = value.slice();
    const a = next[index];
    const b = next[j];
    if (a === undefined || b === undefined) return;
    next[index] = b;
    next[j] = a;
    onChange(next);
    setActiveIndex(j);
  }

  return (
    <VStack gap={3}>
      <VStack gap={1} className="px-1">
        <Text variant="h2" style={{ color: '#566047' }}>
          {t('event.signupFields.headerTitle')}
        </Text>
        <Text variant="bodySm" tone="muted">
          {t('event.signupFields.headerDescription')}
        </Text>
      </VStack>

      {value.map((field, index) => {
        const locked = index < lockedCount;
        return (
          <QuestionCardShell
            key={field.id}
            index={index}
            testID={`signup-question-${String(index)}`}
            title={field.label.trim() || t('questions.untitled')}
            subline={
              field.type === 'select'
                ? `${t('event.signupFields.type.select')} · ${t('questions.optionsCount', { count: field.options.length })}`
                : t(`event.signupFields.type.${field.type}`)
            }
            error={errors[index] ? t(`questions.${errors[index]}`) : undefined}
            required={field.required}
            onRequiredChange={(required) => patch(index, { required })}
            active={activeIndex === index}
            onActivate={() => setActiveIndex(index)}
            onMove={locked ? undefined : (dir) => move(index, dir)}
            onRemove={
              locked ? undefined : () => {
                onChange(value.filter((_, i) => i !== index));
                setActiveIndex(null);
              }
            }
            locked={locked}
          >
            <Input
              value={field.label}
              onChangeText={(label) => patch(index, { label })}
              placeholder={t('questions.emptyLabel')}
              testID={`signup-question-label-${String(index)}`}
            />

            {/* Type selector. Frozen once answers exist — retyping would leave
                the collected values mismatched against their spec. */}
            {locked ? (
              <Text variant="bodySm" tone="muted">{t(`event.signupFields.type.${field.type}`)}</Text>
            ) : (
              <Pressable
                onPress={() => setTypeSheetIndex(index)}
                testID={`signup-question-type-${String(index)}`}
                className="border border-subtle rounded-lg px-3 py-2"
              >
                <HStack gap={2} align="center" justify="between">
                  <Text>{t(`event.signupFields.type.${field.type}`)}</Text>
                  <Ionicons name="chevron-down" size={18} color="#6b7280" />
                </HStack>
              </Pressable>
            )}

            {field.type === 'select' ? (
              <OptionsEditor
                options={field.options}
                mode="single"
                onChange={(options) => patch(index, { options })}
                testIDPrefix={`signup-question-${String(index)}`}
              />
            ) : null}
          </QuestionCardShell>
        );
      })}

      {value.length < MAX_SIGNUP_FIELDS ? (
        <Pressable
          onPress={() => setAddSheetOpen(true)}
          testID="signup-question-add"
          accessibilityRole="button"
          accessibilityLabel={t('event.signupFields.add')}
          className="border border-dashed border-subtle rounded-xl p-4"
        >
          <HStack gap={2} align="center" justify="center">
            <Ionicons name="add-circle-outline" size={22} color={ACCENT} />
            <Text style={{ color: ACCENT }} className="font-medium">{t('event.signupFields.add')}</Text>
          </HStack>
        </Pressable>
      ) : null}

      {lockedCount > 0 ? (
        <Text variant="caption" tone="muted">
          {t('event.signupFields.lockedNotice')}
        </Text>
      ) : null}

      <TypeSheet
        visible={addSheetOpen}
        titleKey="questions.typeSheetTitle"
        sections={TYPE_SECTIONS}
        onSelect={(id) => addQuestion(id as SignupFieldType)}
        onClose={() => setAddSheetOpen(false)}
      />

      <TypeSheet
        visible={typeSheetIndex !== null}
        titleKey="questions.typeSheetTitle"
        sections={TYPE_SECTIONS}
        currentId={typeSheetIndex !== null ? value[typeSheetIndex]?.type : undefined}
        onSelect={(id) => {
          if (typeSheetIndex === null) return;
          // A stale option list on a retyped question would be dead data.
          patch(typeSheetIndex, { type: id as SignupFieldType, options: [] });
        }}
        onClose={() => setTypeSheetIndex(null)}
      />
    </VStack>
  );
}

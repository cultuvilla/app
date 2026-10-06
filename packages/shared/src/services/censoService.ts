import { httpsCallable } from '../firebase/sdk/functions';
import { getFirebaseFunctions } from '../firebase';
import type { ProfileFormField, ProfileAnswers } from '../models/municipality/CensoTypes';
import { isPredefinedFieldKey } from '../models/municipality/profileFieldRegistry';

export interface SchemaTransitionViolation {
  code:
    | 'duplicate_key'
    | 'unknown_predefined'
    | 'invalid_custom_key'
    | 'type_changed'
    | 'key_changed'
    | 'field_removed_with_answers'
    | 'option_removed_with_answers'
    | 'source_changed'
    | 'missing_options'
    | 'options_source_conflict'
    | 'options_source_invalid_type';
  fieldKey: string;
  detail?: string;
}

export interface SchemaTransitionResult {
  ok: boolean;
  violations: SchemaTransitionViolation[];
}

/**
 * Pure: given prev + next field arrays and a per-key set of values that
 * have been used by members, returns whether the transition is legal.
 * `usedValuesByKey` lets us validate option removal too.
 */
export function validateSchemaTransition(
  prev: ProfileFormField[],
  next: ProfileFormField[],
  usedValuesByKey: Record<string, Set<string | number | boolean>>,
): SchemaTransitionResult {
  const violations: SchemaTransitionViolation[] = [];
  const seenKeys = new Set<string>();
  for (const f of next) {
    if (seenKeys.has(f.key)) {
      violations.push({ code: 'duplicate_key', fieldKey: f.key });
    }
    seenKeys.add(f.key);
    if (f.source === 'predefined' && !isPredefinedFieldKey(f.key)) {
      violations.push({ code: 'unknown_predefined', fieldKey: f.key });
    }
    if (f.source === 'custom' && !/^[a-z0-9_]{1,40}$/.test(f.key)) {
      violations.push({ code: 'invalid_custom_key', fieldKey: f.key });
    }
    if (f.source === 'custom') {
      const isChoice = f.type === 'select' || f.type === 'multiselect';
      const hasStatic = Array.isArray(f.options) && f.options.length > 0;
      const hasSource = f.optionsSource !== undefined;
      if (f.optionsSource !== undefined && !isChoice) {
        violations.push({ code: 'options_source_invalid_type', fieldKey: f.key });
      }
      if (isChoice) {
        if (hasStatic && hasSource) {
          violations.push({ code: 'options_source_conflict', fieldKey: f.key });
        } else if (!hasStatic && !hasSource) {
          violations.push({ code: 'missing_options', fieldKey: f.key });
        }
      }
    }
  }

  const prevByKey = new Map(prev.map((f) => [f.key, f]));
  const nextByKey = new Map(next.map((f) => [f.key, f]));

  for (const [key, prevField] of prevByKey.entries()) {
    const nextField = nextByKey.get(key);
    if (!nextField) {
      // Record/index signature: read once and check for undefined explicitly,
      // since downstream consumers (e.g. apps/mobile) enable
      // noUncheckedIndexedAccess and require the narrowing.
      const used = usedValuesByKey[key] as Set<unknown> | undefined;
      const hasAnswers = used !== undefined && used.size > 0;
      if (hasAnswers) {
        violations.push({ code: 'field_removed_with_answers', fieldKey: key });
      }
      continue;
    }
    if (prevField.source !== nextField.source) {
      violations.push({ code: 'source_changed', fieldKey: key });
    }
    if (prevField.source === 'custom' && nextField.source === 'custom') {
      if (prevField.type !== nextField.type) {
        violations.push({ code: 'type_changed', fieldKey: key });
      }
      if (nextField.optionsSource === undefined && prevField.optionsSource === undefined) {
        const prevOpts = new Set(prevField.options ?? []);
        const nextOpts = new Set(nextField.options ?? []);
        const removed = [...prevOpts].filter((o) => !nextOpts.has(o));
        const used = usedValuesByKey[key] ?? new Set();
        for (const r of removed) {
          if (used.has(r)) {
            violations.push({
              code: 'option_removed_with_answers',
              fieldKey: key,
              detail: r,
            });
          }
        }
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Pure: returns the list of required field keys missing from a member's answers.
 */
export function missingRequiredAnswers(
  fields: ProfileFormField[],
  answers: ProfileAnswers,
): string[] {
  return fields
    .filter((f) => f.required)
    .filter((f) => isAnswerEmpty(answers[f.key]))
    .map((f) => f.key);
}

function isAnswerEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * Pure: is the censo complete given the fields and answers?
 */
export function isCensoComplete(
  fields: ProfileFormField[],
  answers: ProfileAnswers,
): boolean {
  return missingRequiredAnswers(fields, answers).length === 0;
}

/**
 * Calls the updateCenso Cloud Function. The function validates the transition
 * server-side against current member answers and writes atomically.
 */
export async function updateCensoSchema(
  municipalityId: string,
  fields: ProfileFormField[],
): Promise<void> {
  const fn = httpsCallable<{ municipalityId: string; fields: ProfileFormField[] }, { ok: true }>(
    getFirebaseFunctions(),
    'updateCenso',
  );
  await fn({ municipalityId, fields });
}

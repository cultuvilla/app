import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable as RNPressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../primitives/Button';
import { KeyboardAvoider } from '../primitives/KeyboardAvoider';
import { Text } from '../primitives/Text';
import { VStack } from '../primitives/VStack';
import { HStack } from '../primitives/HStack';
import { PhoneField } from './PhoneField';
import { SignupAnswerFields } from './SignupAnswerFields';
import type { RegistrationStatus } from '@cultuvilla/shared/models/event/RegistrationDataModel';
import {
  validateSignupAnswers,
  type SignupAnswers,
  type SignupAnswerValue,
  type SignupFieldSpec,
} from '@cultuvilla/shared/models/event/SignupFieldModel';
import {
  DEFAULT_PHONE_COUNTRY,
  formatPhoneE164,
  isValidPhoneNumber,
  type PhoneCountry,
} from '@cultuvilla/shared/utils';
import { useT } from '../../lib/i18n';

export interface AttendeeOption {
  id: string;
  name: string;
  /** Present when this persona is already registered on the event. */
  status?: RegistrationStatus;
}

export interface AttendeeSheetProps {
  visible: boolean;
  /** The user's personas — own persona first, then personas a cargo. */
  attendees: AttendeeOption[];
  telephoneRequired: boolean;
  /** The event's custom sign-up fields, asked once per ticked persona. */
  signupFields?: SignupFieldSpec[];
  busy: boolean;
  /** Personas to pre-tick (e.g. a dependent just created via onCreateNew). */
  autoSelectIds?: string[];
  onClose: () => void;
  onCreateNew: () => void;
  /**
   * Reports the ticked persona ids (in attendee order), the shared phone, and
   * each newly-ticked persona's answers to the event's custom fields.
   */
  onConfirm: (
    selectedIds: string[],
    phone?: string,
    answersByPersonId?: Record<string, SignupAnswers>,
  ) => void;
}

/**
 * Bottom-modal attendee picker for event sign-up. Lists the caller's personas,
 * pre-ticking whoever is already registered, and lets them add personas a cargo
 * (or create a new one). Confirm reports the ticked set; the parent diffs it
 * against the registered set to decide what to register vs cancel.
 *
 * The card grows with its content up to 90% of the viewport, so a long persona
 * list (or one with custom sign-up fields expanded) gets the room it needs
 * instead of being squeezed into a fixed-height scroll box.
 *
 * Styles live on `style`/`className` per the existing modal pattern; the Modal
 * + window-confirm fallbacks keep it working on the RN-Web build.
 */
export function AttendeeSheet({
  visible,
  attendees,
  telephoneRequired,
  signupFields = [],
  busy,
  autoSelectIds,
  onClose,
  onCreateNew,
  onConfirm,
}: AttendeeSheetProps) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const listRef = useRef<ScrollView>(null);
  // Row offsets inside the scroll list, so a rejected confirm can bring the
  // offending persona's question into view instead of leaving the error
  // off-screen below the fold.
  const rowOffsets = useRef<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Custom answers are per persona, unlike the single shared phone below.
  const [answers, setAnswers] = useState<Record<string, Record<string, SignupAnswerValue>>>({});
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountry>(DEFAULT_PHONE_COUNTRY);
  // Whether the user has pressed Confirmar at least once. The invalid-phone
  // error stays hidden until then — validating on every keystroke nags before
  // the user has finished typing.
  const [confirmAttempted, setConfirmAttempted] = useState(false);

  const registeredIds = new Set(attendees.filter((a) => a.status).map((a) => a.id));

  // Each time the sheet opens, seed the ticks with whoever is already
  // registered so the user starts from the current state.
  useEffect(() => {
    if (visible) {
      setSelected(new Set(attendees.filter((a) => a.status).map((a) => a.id)));
      setAnswers({});
      setPhone('');
      setPhoneCountry(DEFAULT_PHONE_COUNTRY);
      setConfirmAttempted(false);
    }
    // attendees identity intentionally excluded — re-seed only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Merge in any auto-select ids (a freshly created dependent returning from
  // /person/new) without clearing the user's existing ticks.
  const autoKey = (autoSelectIds ?? []).join(',');
  useEffect(() => {
    if (!autoSelectIds || autoSelectIds.length === 0) return;
    setSelected((prev) => {
      const next = new Set(prev);
      autoSelectIds.forEach((id) => next.add(id));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKey]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedInOrder = attendees.filter((a) => selected.has(a.id)).map((a) => a.id);
  const hasNewSelection = selectedInOrder.some((id) => !registeredIds.has(id));
  // Only personas being newly registered answer; someone already signed up
  // isn't re-asked (their answers were collected when they registered).
  const newlySelected = selectedInOrder.filter((id) => !registeredIds.has(id));

  // Same validator the Cloud Function runs, so the button and the server agree
  // on what counts as a complete answer set.
  const validationByPersonId = new Map(
    newlySelected.map((id) => [id, validateSignupAnswers(signupFields, answers[id] ?? {})]),
  );
  const invalidIdsFor = (personId: string): string[] => {
    const result = validationByPersonId.get(personId);
    return result && !result.ok ? [result.fieldId] : [];
  };
  const answersValid = [...validationByPersonId.values()].every((r) => r.ok);
  const changed =
    selected.size !== registeredIds.size || selectedInOrder.some((id) => !registeredIds.has(id));
  const needsPhone = telephoneRequired && hasNewSelection;
  const phoneValid = isValidPhoneNumber(phone, phoneCountry.dialCode);
  // The button gates on the selection change, NOT on phone validity — an
  // invalid phone must still let the press through so it can surface the error.
  const canConfirm = changed && !busy;
  // Show the invalid-phone error only after a confirm attempt (not per keystroke).
  const phoneError = confirmAttempted && needsPhone && !phoneValid;

  function handleConfirm() {
    if (!canConfirm) return;
    if ((needsPhone && !phoneValid) || !answersValid) {
      setConfirmAttempted(true);
      scrollToFirstInvalidAnswer();
      return;
    }
    // Personas with nothing to report are left out entirely, so an event with
    // no custom fields reports an empty map rather than one empty entry each.
    const collected: Record<string, SignupAnswers> = {};
    for (const [personId, result] of validationByPersonId) {
      if (result.ok && Object.keys(result.value).length > 0) collected[personId] = result.value;
    }
    onConfirm(
      selectedInOrder,
      needsPhone ? formatPhoneE164(phone, phoneCountry.dialCode) : undefined,
      collected,
    );
  }

  function scrollToFirstInvalidAnswer() {
    const firstInvalid = newlySelected.find((id) => !validationByPersonId.get(id)?.ok);
    if (firstInvalid === undefined) return;
    const y = rowOffsets.current[firstInvalid];
    if (y === undefined) return;
    listRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <KeyboardAvoider>
        <RNPressable
          accessible={false}
          onPress={() => {
            if (!busy) onClose();
          }}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          className="justify-end"
        >
          {/* Inner catcher: taps inside the card must not dismiss. Pad the bottom
              by the safe-area inset so the confirm button clears the home
              indicator / nav bar. */}
          <RNPressable
            accessible={false}
            onPress={() => {}}
            className="rounded-t-2xl bg-surface-elevated p-5 border-t border-subtle"
            style={{ paddingBottom: insets.bottom + 20, maxHeight: windowHeight * 0.9 }}
          >
            <VStack gap={3} className="shrink">
              <Text variant="h3">{t('event.register.attendeesTitle')}</Text>

              <ScrollView ref={listRef} style={{ flexShrink: 1 }} testID="attendee-list">
                <VStack gap={2}>
                  {attendees.map((a) => {
                    const isSelected = selected.has(a.id);
                    // Fields are asked per attendee, so the group hangs off this
                    // persona's row and only while they are newly ticked.
                    const showFields =
                      isSelected && !registeredIds.has(a.id) && signupFields.length > 0;
                    return (
                      <View
                        key={a.id}
                        testID={`attendee-row-wrap-${a.id}`}
                        onLayout={(e) => {
                          rowOffsets.current[a.id] = e.nativeEvent.layout.y;
                        }}
                      >
                      <RNPressable
                        testID={`attendee-row-${a.id}`}
                        onPress={() => toggle(a.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isSelected }}
                        className={`flex-row items-center justify-between rounded-lg border p-3 ${
                          isSelected ? 'border-accent bg-surface' : 'border-subtle'
                        }`}
                      >
                        <HStack gap={3} className="items-center flex-1">
                          <Text style={{ fontSize: 18 }}>{isSelected ? '☑' : '☐'}</Text>
                          <Text className="flex-1">{a.name}</Text>
                        </HStack>
                        {a.status ? (
                          <Text tone={a.status === 'waitlisted' ? 'muted' : 'success'} variant="caption">
                            {a.status === 'waitlisted'
                              ? t('event.register.waitlisted')
                              : t('event.register.signedUp')}
                          </Text>
                        ) : null}
                      </RNPressable>
                      {showFields ? (
                        <SignupAnswerFields
                          fields={signupFields}
                          values={answers[a.id] ?? {}}
                          onChange={(fieldId, value) =>
                            setAnswers((prev) => ({
                              ...prev,
                              [a.id]: { ...prev[a.id], [fieldId]: value },
                            }))
                          }
                          invalidIds={confirmAttempted ? invalidIdsFor(a.id) : []}
                          testIDPrefix={`attendee-answer-${a.id}`}
                        />
                      ) : null}
                      </View>
                    );
                  })}

                  {/* Same rectangle shape as a persona row, but a dashed outline
                      and a + to read as "add another". */}
                  <RNPressable
                    onPress={onCreateNew}
                    testID="attendee-create"
                    accessibilityRole="button"
                    accessibilityLabel={t('event.register.createPersona')}
                    className="flex-row items-center rounded-lg border border-dashed border-subtle p-3"
                  >
                    <HStack gap={3} className="items-center flex-1">
                      <Text tone="muted" style={{ fontSize: 18 }}>
                        ＋
                      </Text>
                      <Text tone="muted" className="flex-1">
                        {t('event.register.createPersona')}
                      </Text>
                    </HStack>
                  </RNPressable>
                </VStack>
              </ScrollView>

              {needsPhone ? (
                <PhoneField
                  label={t('event.register.phoneTitle')}
                  value={phone}
                  onChangeText={setPhone}
                  country={phoneCountry}
                  onCountryChange={setPhoneCountry}
                  placeholder={t('event.register.phonePlaceholder')}
                  searchPlaceholder={t('event.register.phoneSearch')}
                  noResultsLabel={t('event.register.phoneNoResults')}
                  error={phoneError ? t('event.register.phoneInvalid') : undefined}
                  testID="attendee-phone"
                />
              ) : null}

              <Button
                onPress={handleConfirm}
                loading={busy}
                disabled={!canConfirm}
                fullWidth
                testID="attendee-confirm"
              >
                {t('event.register.confirm')}
              </Button>
            </VStack>
          </RNPressable>
        </RNPressable>
      </KeyboardAvoider>
    </Modal>
  );
}

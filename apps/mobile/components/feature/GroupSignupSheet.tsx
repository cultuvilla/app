import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable as RNPressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { Button } from '../primitives/Button';
import { KeyboardAvoider } from '../primitives/KeyboardAvoider';
import { Text } from '../primitives/Text';
import { VStack } from '../primitives/VStack';
import { HStack } from '../primitives/HStack';
import { PhoneField } from './PhoneField';
import { SignupAnswerFields } from './SignupAnswerFields';
import type { AttendeeOption } from './AttendeeSheet';
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

const ACCENT = colors.light.fg.accent;

/** One seat the caller already holds on this event. */
export interface MyGroupSeat {
  regId: string;
  name: string;
  status: RegistrationStatus;
  isOpenSeat: boolean;
  /** Present on an unclaimed seat the caller owns: the link to share. */
  token?: string;
}

export interface GroupSignupSheetProps {
  visible: boolean;
  /** Seats that must be filled together — the event's `signupGroupSize`. */
  groupSize: number;
  /** The caller's personas — own persona first, then personas a cargo. */
  attendees: AttendeeOption[];
  /** The caller's own persona id — pre-ticked, since a group without them is a stranger's booking. */
  ownPersonId: string;
  /** Seats the caller already holds; non-empty switches the sheet to summary. */
  mySeats: MyGroupSeat[];
  telephoneRequired: boolean;
  signupFields?: SignupFieldSpec[];
  busy: boolean;
  autoSelectIds?: string[];
  onClose: () => void;
  onCreateNew: () => void;
  onShareSeat: (token: string) => void;
  onCancelGroup: (regId: string) => void;
  onConfirm: (
    selectedIds: string[],
    openSeats: number,
    phone?: string,
    answersByPersonId?: Record<string, SignupAnswers>,
  ) => void;
}

/**
 * Sign-up sheet for an event that seats people in groups (`signupGroupSize`
 * > 1): parejas, tríos, grupos de cuatro.
 *
 * Two modes, and which one you get depends only on whether you already hold
 * seats:
 *
 * **Builder** — pick exactly `groupSize` seats, your own persona already
 * ticked. Each seat is either a persona you own or an *open seat*: a held place
 * carrying a link you send to whoever is coming with you. Open seats are rows
 * you tick like any persona, so "me + a friend" is two ticks rather than a tick
 * and a counter. Confirming books the whole group in one call, which is what
 * lets the server seat it atomically — a pareja is never split across the
 * capacity boundary.
 *
 * **Summary** — your group as it stands, each unclaimed seat carrying a
 * full-width row that sends its link, and one action to cancel the group. There is no partial
 * edit here on purpose: a group cannot shrink below its required size, so
 * "remove one seat" is not an operation the event admits. To change who is
 * coming, cancel and rebook, or have the guest give their seat back (which
 * reopens it without disturbing yours).
 */
export function GroupSignupSheet({
  visible,
  groupSize,
  attendees,
  ownPersonId,
  mySeats,
  telephoneRequired,
  signupFields = [],
  busy,
  autoSelectIds,
  onClose,
  onCreateNew,
  onShareSeat,
  onCancelGroup,
  onConfirm,
}: GroupSignupSheetProps) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const listRef = useRef<ScrollView>(null);
  const rowOffsets = useRef<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openSeats, setOpenSeats] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Record<string, SignupAnswerValue>>>({});
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountry>(DEFAULT_PHONE_COUNTRY);
  const [confirmAttempted, setConfirmAttempted] = useState(false);

  const hasGroup = mySeats.length > 0;

  // The booker is always in their own group, so their persona starts ticked —
  // it is the one seat the sheet can fill without asking. Still untickable, in
  // case they are booking for two personas a cargo rather than themselves.
  const ownIsBookable = attendees.some((a) => a.id === ownPersonId && a.status === undefined);

  useEffect(() => {
    if (visible) {
      setSelected(ownIsBookable ? new Set([ownPersonId]) : new Set());
      setOpenSeats(0);
      setAnswers({});
      setPhone('');
      setPhoneCountry(DEFAULT_PHONE_COUNTRY);
      setConfirmAttempted(false);
    }
    // Re-seed only on open — a persona list arriving mid-session must not wipe
    // ticks the user has already made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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

  const selectedInOrder = attendees.filter((a) => selected.has(a.id)).map((a) => a.id);
  const filled = selectedInOrder.length + openSeats;
  const remaining = groupSize - filled;

  // At most one seat short of the group: the booker occupies the other, so a
  // group of pure open seats is unreachable by construction rather than by a
  // check on confirm.
  const maxOpenSeats = groupSize - 1;

  function toggleOpenSeat(index: number) {
    // Ticks are contiguous — a row's state is "index < openSeats" — so tapping
    // row i either trims the count back to i or extends it to i + 1, whichever
    // the group still has room for.
    setOpenSeats((n) => {
      if (index < n) return index;
      const delta = index + 1 - n;
      return delta <= remaining ? index + 1 : n;
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      // A tick that would overflow the group is refused rather than silently
      // dropping someone else — the counter above the list already says how
      // many seats are left.
      else if (filled < groupSize) next.add(id);
      return next;
    });
  }

  // Same validator the Cloud Function runs, so the button and the server agree.
  const validationByPersonId = new Map(
    selectedInOrder.map((id) => [id, validateSignupAnswers(signupFields, answers[id] ?? {})]),
  );
  const invalidIdsFor = (personId: string): string[] => {
    const result = validationByPersonId.get(personId);
    return result && !result.ok ? [result.fieldId] : [];
  };
  const answersValid = [...validationByPersonId.values()].every((r) => r.ok);
  const phoneValid = isValidPhoneNumber(phone, phoneCountry.dialCode);
  const phoneError = confirmAttempted && telephoneRequired && !phoneValid;
  // The group must be exactly full, and you must be in it — a group of pure
  // open seats would be a stranger's booking made in your name.
  const canConfirm = !busy && remaining === 0 && selectedInOrder.length > 0;

  function handleConfirm() {
    if (!canConfirm) return;
    if ((telephoneRequired && !phoneValid) || !answersValid) {
      setConfirmAttempted(true);
      const firstInvalid = selectedInOrder.find((id) => !validationByPersonId.get(id)?.ok);
      const y = firstInvalid === undefined ? undefined : rowOffsets.current[firstInvalid];
      if (y !== undefined) listRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
      return;
    }
    const collected: Record<string, SignupAnswers> = {};
    for (const [personId, result] of validationByPersonId) {
      if (result.ok && Object.keys(result.value).length > 0) collected[personId] = result.value;
    }
    onConfirm(
      selectedInOrder,
      openSeats,
      telephoneRequired ? formatPhoneE164(phone, phoneCountry.dialCode) : undefined,
      collected,
    );
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
          <RNPressable
            accessible={false}
            onPress={() => {}}
            className="rounded-t-2xl bg-surface-elevated p-5 border-t border-subtle"
            style={{ paddingBottom: insets.bottom + 20, maxHeight: windowHeight * 0.9 }}
          >
            <VStack gap={3} className="shrink">
              <Text variant="h3">{t('event.group.title', { count: groupSize })}</Text>

              {hasGroup ? (
                <VStack gap={2} testID="group-summary">
                  <Text variant="bodySm" tone="muted">
                    {t('event.group.summaryHelp')}
                  </Text>
                  {mySeats.map((seat) => (
                    <VStack
                      key={seat.regId}
                      gap={0}
                      className="rounded-lg border border-subtle overflow-hidden"
                      testID={`group-seat-${seat.regId}`}
                    >
                      <VStack gap={0} className="p-3">
                        <Text numberOfLines={1}>
                          {seat.isOpenSeat ? t('event.group.openSeat') : seat.name}
                        </Text>
                        <Text
                          variant="caption"
                          tone={seat.status === 'waitlisted' ? 'muted' : 'success'}
                        >
                          {seat.status === 'waitlisted'
                            ? t('event.register.waitlisted')
                            : t('event.register.signedUp')}
                        </Text>
                      </VStack>
                      {/* The link is the whole point of an unclaimed seat, so it
                          gets a full row of its own rather than a button
                          squeezed against the seat's name. */}
                      {seat.isOpenSeat && seat.token ? (
                        <RNPressable
                          onPress={() => onShareSeat(seat.token as string)}
                          testID={`group-share-${seat.regId}`}
                          accessibilityRole="button"
                          accessibilityLabel={t('event.group.sendLink')}
                          className="flex-row items-center border-t border-subtle bg-surface p-3"
                        >
                          <HStack gap={3} className="items-center flex-1">
                            <Ionicons
                              name="paper-plane-outline"
                              size={iconSizes.sm}
                              color={ACCENT}
                            />
                            <Text className="flex-1" style={{ color: ACCENT, fontWeight: '600' }}>
                              {t('event.group.sendLink')}
                            </Text>
                          </HStack>
                          <Ionicons name="chevron-forward" size={iconSizes.sm} color={ACCENT} />
                        </RNPressable>
                      ) : null}
                    </VStack>
                  ))}
                  <Button
                    variant="danger"
                    onPress={() => {
                      const first = mySeats[0];
                      if (first) onCancelGroup(first.regId);
                    }}
                    loading={busy}
                    fullWidth
                    testID="group-cancel"
                  >
                    {t('event.group.cancel')}
                  </Button>
                </VStack>
              ) : (
                <>
                  <Text variant="bodySm" tone="muted" testID="group-remaining">
                    {remaining > 0
                      ? t('event.group.remaining', { count: remaining })
                      : t('event.group.complete')}
                  </Text>

                  <ScrollView ref={listRef} style={{ flexShrink: 1 }} testID="group-attendee-list">
                    <VStack gap={2}>
                      {attendees.map((a) => {
                        const isSelected = selected.has(a.id);
                        const alreadyIn = a.status !== undefined;
                        const showFields = isSelected && signupFields.length > 0;
                        return (
                          <View
                            key={a.id}
                            onLayout={(e) => {
                              rowOffsets.current[a.id] = e.nativeEvent.layout.y;
                            }}
                          >
                            <RNPressable
                              testID={`group-row-${a.id}`}
                              onPress={() => {
                                if (!alreadyIn) toggle(a.id);
                              }}
                              disabled={alreadyIn}
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: isSelected, disabled: alreadyIn }}
                              className={`flex-row items-center justify-between rounded-lg border p-3 ${
                                isSelected ? 'border-accent bg-surface' : 'border-subtle'
                              } ${alreadyIn ? 'opacity-50' : ''}`}
                            >
                              <HStack gap={3} className="items-center flex-1">
                                <Text style={{ fontSize: 18 }}>{isSelected ? '☑' : '☐'}</Text>
                                <Text className="flex-1">{a.name}</Text>
                              </HStack>
                              {alreadyIn ? (
                                <Text variant="caption" tone="muted">
                                  {t('event.register.signedUp')}
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
                                testIDPrefix={`group-answer-${a.id}`}
                              />
                            ) : null}
                          </View>
                        );
                      })}

                      <RNPressable
                        onPress={onCreateNew}
                        testID="group-create-persona"
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

                      {/* Open seats: held places you hand to someone by link.
                          Tickable rows rather than a counter, so a seat for a
                          friend reads exactly like a seat for a persona. */}
                      {Array.from({ length: maxOpenSeats }, (_, index) => {
                        const isTicked = index < openSeats;
                        const label =
                          index === 0
                            ? t('event.group.inviteSeat')
                            : t('event.group.inviteSeatMore');
                        return (
                          <RNPressable
                            key={`open-seat-${index}`}
                            testID={`group-open-seat-${index}`}
                            onPress={() => toggleOpenSeat(index)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: isTicked }}
                            accessibilityLabel={label}
                            className={`flex-row items-center rounded-lg border border-dashed p-3 ${
                              isTicked ? 'border-accent bg-surface' : 'border-subtle'
                            }`}
                          >
                            <HStack gap={3} className="items-center flex-1">
                              <Text style={{ fontSize: 18 }}>{isTicked ? '☑' : '☐'}</Text>
                              <VStack gap={0} className="flex-1">
                                <Text>{label}</Text>
                                {index === 0 ? (
                                  <Text variant="caption" tone="muted">
                                    {t('event.group.inviteSeatHelp')}
                                  </Text>
                                ) : null}
                              </VStack>
                            </HStack>
                          </RNPressable>
                        );
                      })}
                    </VStack>
                  </ScrollView>

                  {telephoneRequired ? (
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
                      testID="group-phone"
                    />
                  ) : null}

                  <Button
                    onPress={handleConfirm}
                    loading={busy}
                    disabled={!canConfirm}
                    fullWidth
                    testID="group-confirm"
                  >
                    {t('event.register.confirm')}
                  </Button>
                </>
              )}
            </VStack>
          </RNPressable>
        </RNPressable>
      </KeyboardAvoider>
    </Modal>
  );
}

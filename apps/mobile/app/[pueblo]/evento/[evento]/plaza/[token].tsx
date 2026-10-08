import { entityRefHref, personHref } from '../../../../../lib/navigation/routes';
import { parseEntityRef } from '@cultuvilla/shared/utils';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '../../../../../components/primitives/Screen';
import { VStack } from '../../../../../components/primitives/VStack';
import { Text } from '../../../../../components/primitives/Text';
import { Button } from '../../../../../components/primitives/Button';
import { ErrorState } from '../../../../../components/primitives/ErrorState';
import { ScreenHeader } from '../../../../../components/layout/ScreenHeader';
import { PhoneField } from '../../../../../components/feature/PhoneField';
import { SignupAnswerFields } from '../../../../../components/feature/SignupAnswerFields';
import { useAuth } from '../../../../../lib/auth/useAuth';
import { useRegisterGate } from '../../../../../lib/auth/RegisterGateContext';
import { useT } from '../../../../../lib/i18n';
import { initialPhone, rememberProfilePhone } from '../../../../../lib/profilePhone';
import { withFirestoreErrorLog } from '../../../../../lib/firestoreErrorLog';
import { getEvent } from '@cultuvilla/shared/services/eventService';
import { getPersonByUserId } from '@cultuvilla/shared/services/personService';
import { claimEventSeat } from '@cultuvilla/shared/services/registrationService';
import { buildNameWithNickname } from '@cultuvilla/shared/models/person/PersonDataModel';
import {
  validateSignupAnswers,
  type SignupAnswerValue,
} from '@cultuvilla/shared/models/event/SignupFieldModel';
import {
  DEFAULT_PHONE_COUNTRY,
  formatPhoneE164,
  isValidPhoneNumber,
  type PhoneCountry,
} from '@cultuvilla/shared/utils';
import { formatDate } from '@cultuvilla/shared/utils/format';
import type { EventData } from '@cultuvilla/shared/models/event/EventDataModel';

/**
 * Landing screen for a seat-claim link — `/<pueblo>/evento/<ref>/plaza/<token>`.
 *
 * The seat behind the token is already booked and already paid for in capacity
 * terms; claiming only moves it from the group owner's name to yours. So there
 * is nothing to reserve here and no race to lose: the only ways this fails are
 * a token already used, a cancelled group, or an event that closed.
 *
 * The event's own sign-up questions are asked here rather than inherited from
 * whatever the group owner typed on your behalf — being asked for your own
 * t-shirt size is the entire reason those fields are per-attendee.
 */
export default function ClaimSeatScreen() {
  const { pueblo, evento, token } = useLocalSearchParams<{ pueblo: string; evento: string; token: string }>();
  const eventId = parseEntityRef(evento ?? '') ?? '';
  const eventPath = entityRefHref('event', pueblo ?? '', evento ?? '');
  const { t } = useT();
  const { user, profile, refreshProfile } = useAuth();
  const gate = useRegisterGate();

  const [event, setEvent] = useState<(EventData & { id: string }) | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [personName, setPersonName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Record<string, SignupAnswerValue>>({});
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountry>(DEFAULT_PHONE_COUNTRY);
  const [attempted, setAttempted] = useState(false);

  // Seed from the saved number only while the field is untouched: the profile
  // can arrive after the form is already editable, and it must never
  // overwrite what the user has started typing.
  const phoneTouched = useRef(false);
  useEffect(() => {
    if (phoneTouched.current || !profile?.telephone) return;
    const seed = initialPhone(profile.telephone);
    setPhone(seed.national);
    setPhoneCountry(seed.country);
  }, [profile?.telephone]);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const ev = await withFirestoreErrorLog('claimSeat:getEvent', () => getEvent(eventId));
      setEvent(ev);
      if (user) {
        const person = await withFirestoreErrorLog('claimSeat:getPerson', () =>
          getPersonByUserId(user.uid),
        );
        if (person) {
          setPersonId(person.id);
          setPersonName(buildNameWithNickname(person));
        }
      }
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [eventId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const signupFields = event?.signupFields ?? [];
  const validation = validateSignupAnswers(signupFields, answers);
  const phoneValid = isValidPhoneNumber(phone, phoneCountry.dialCode);
  const needsPhone = !!event?.telephoneRequired;

  async function handleClaim() {
    if (!eventId || !token || !personId) return;
    if ((needsPhone && !phoneValid) || !validation.ok) {
      setAttempted(true);
      return;
    }
    setBusy(true);
    setClaimError(null);
    const e164 = needsPhone ? formatPhoneE164(phone, phoneCountry.dialCode) : undefined;
    try {
      await claimEventSeat(eventId, token, {
        personId,
        name: personName,
        ...(e164 ? { phone: e164 } : {}),
        ...(Object.keys(validation.value).length > 0 ? { answers: validation.value } : {}),
      });
      setClaimed(true);
      if (user) void rememberProfilePhone(user.uid, profile?.telephone, e164, refreshProfile);
    } catch (e) {
      setClaimError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!eventId || !token) {
    return (
      <Screen>
        <ScreenHeader title={t('event.claim.title')} />
        <ErrorState message={t('event.claim.invalid')} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <ScreenHeader title={t('event.claim.title')} />
      <VStack gap={4} className="p-4">
        {loading ? (
          <Text tone="muted">{t('common.loading')}</Text>
        ) : loadError || !event ? (
          <ErrorState message={loadError ?? t('event.claim.invalid')} />
        ) : claimed ? (
          <VStack gap={3} testID="claim-success">
            <Text variant="h3">{t('event.claim.successTitle')}</Text>
            <Text tone="muted">{t('event.claim.successBody', { title: event.title })}</Text>
            <Button
              onPress={() => router.replace(eventPath)}
              fullWidth
              testID="claim-go-to-event"
            >
              {t('event.claim.goToEvent')}
            </Button>
          </VStack>
        ) : (
          <VStack gap={3}>
            <Text variant="h3">{event.title}</Text>
            <Text tone="muted">{formatDate(event.startDate, 'datetime')}</Text>
            <Text>{t('event.claim.intro', { count: event.signupGroupSize })}</Text>

            {!user ? (
              <Button
                onPress={() =>
                  gate.requireAuth(`${eventPath}/plaza/${token}`, t('event.claim.authReason'))
                }
                fullWidth
                testID="claim-sign-in"
              >
                {t('event.claim.signIn')}
              </Button>
            ) : !personId ? (
              // Claiming writes a person onto a roster, so the claimer needs a
              // persona of their own first — the same precondition ordinary
              // sign-up has.
              <VStack gap={2}>
                <Text tone="muted">{t('event.register.needsPerson')}</Text>
                <Button onPress={() => router.push(personHref('new'))} fullWidth>
                  {t('event.register.createPersona')}
                </Button>
              </VStack>
            ) : (
              <VStack gap={3}>
                <Text tone="muted">{t('event.claim.claimingAs', { name: personName })}</Text>

                {signupFields.length > 0 ? (
                  <SignupAnswerFields
                    fields={signupFields}
                    values={answers}
                    onChange={(fieldId, value) =>
                      setAnswers((prev) => ({ ...prev, [fieldId]: value }))
                    }
                    invalidIds={attempted && !validation.ok ? [validation.fieldId] : []}
                    testIDPrefix="claim-answer"
                  />
                ) : null}

                {needsPhone ? (
                  <PhoneField
                    label={t('event.register.phoneTitle')}
                    value={phone}
                    onChangeText={(text) => {
                      phoneTouched.current = true;
                      setPhone(text);
                    }}
                    country={phoneCountry}
                    onCountryChange={(country) => {
                      phoneTouched.current = true;
                      setPhoneCountry(country);
                    }}
                    placeholder={t('event.register.phonePlaceholder')}
                    searchPlaceholder={t('event.register.phoneSearch')}
                    noResultsLabel={t('event.register.phoneNoResults')}
                    error={
                      attempted && !phoneValid ? t('event.register.phoneInvalid') : undefined
                    }
                    testID="claim-phone"
                  />
                ) : null}

                {claimError ? (
                  <Text tone="danger" testID="claim-error">
                    {claimError}
                  </Text>
                ) : null}

                <Button
                  onPress={() => void handleClaim()}
                  loading={busy}
                  disabled={busy}
                  fullWidth
                  testID="claim-confirm"
                >
                  {t('event.claim.confirm')}
                </Button>
              </VStack>
            )}
          </VStack>
        )}
      </VStack>
    </Screen>
  );
}

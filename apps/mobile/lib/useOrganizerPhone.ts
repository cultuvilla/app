import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_PHONE_COUNTRY,
  formatPhoneE164,
  isValidPhoneNumber,
  parsePhoneE164,
  type PhoneCountry,
} from '@cultuvilla/shared/utils';
import { useT } from './i18n';
import type { PhoneFieldProps } from '../components/feature/PhoneField';

/**
 * Shared state + validation for the organizer-request phone field, used by both
 * the "start village" and "organize village" screens. Mirrors the event sign-up
 * rules: the prefix picker drives validation, the number is stored in E.164
 * form, and the invalid-number error stays hidden until the user tries to
 * submit — validating on every keystroke nags before they've finished typing.
 */
export function useOrganizerPhone(profileTelephone?: string | null) {
  const { t } = useT();
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<PhoneCountry>(DEFAULT_PHONE_COUNTRY);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Prefill once from the saved profile number so the user verifies/corrects
  // it. Stored values are E.164; parsePhoneE164 also tolerates legacy raw.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !profileTelephone) return;
    const parsed = parsePhoneE164(profileTelephone);
    setCountry(parsed.country);
    setPhone(parsed.national);
    prefilled.current = true;
  }, [profileTelephone]);

  const isValid = isValidPhoneNumber(phone, country.dialCode);

  const fieldProps: PhoneFieldProps = {
    label: t('organize.phoneLabel'),
    placeholder: t('event.register.phonePlaceholder'),
    searchPlaceholder: t('event.register.phoneSearch'),
    noResultsLabel: t('event.register.phoneNoResults'),
    value: phone,
    onChangeText: setPhone,
    country,
    onCountryChange: setCountry,
    error: submitAttempted && !isValid ? t('event.register.phoneInvalid') : undefined,
    testID: 'organizer-phone',
  };

  return {
    fieldProps,
    isValid,
    /** E.164 value to persist, e.g. "+34600123456". */
    e164: formatPhoneE164(phone, country.dialCode),
    /**
     * Call from the submit handler. Returns true when the number is valid; on
     * false it flips the field into its error state so the message shows.
     */
    validateForSubmit(): boolean {
      if (isValid) return true;
      setSubmitAttempted(true);
      return false;
    },
  };
}

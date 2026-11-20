import { Pressable, HStack, Text } from '../primitives';
import { useT } from '../../lib/i18n';

export interface AnalyticsConsentChoiceProps {
  /** `null` until answered: neither option is preselected. */
  value: boolean | null;
  onChange: (granted: boolean) => void;
  disabled?: boolean;
}

/**
 * Sí / No for usage analytics, the two given the same weight on purpose: consent
 * only counts if refusing is as easy as accepting (RGPD art. 7, EDPB 05/2020).
 */
export function AnalyticsConsentChoice({ value, onChange, disabled = false }: AnalyticsConsentChoiceProps) {
  const { t } = useT();
  const options = [
    { granted: true, label: t('privacy.analyticsConsent.yes'), testID: 'analytics-consent-yes' },
    { granted: false, label: t('privacy.analyticsConsent.no'), testID: 'analytics-consent-no' },
  ];
  return (
    <HStack gap={2}>
      {options.map((o) => {
        const active = value === o.granted;
        return (
          <Pressable
            key={o.testID}
            onPress={() => onChange(o.granted)}
            disabled={disabled}
            testID={o.testID}
            accessibilityRole="radio"
            accessibilityState={{ checked: active, disabled }}
            className={`flex-1 py-3 rounded-md border items-center justify-center ${
              active ? 'bg-accent border-accent' : 'bg-surface border-accent'
            } ${disabled ? 'opacity-50' : ''}`}
          >
            <Text tone={active ? 'onAccent' : 'accent'} className="font-semibold">
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </HStack>
  );
}

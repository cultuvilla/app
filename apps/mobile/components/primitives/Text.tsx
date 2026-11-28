import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import type { TypographyVariant } from '@cultuvilla/shared/design-system';
import { TEXT_SCALING, type TextScalingPreset } from '../../lib/text/textScaling';

// Tone mirrors apps/web/components/primitives/Text.tsx exactly.
type Tone = 'primary' | 'muted' | 'onSubtle' | 'onAccent' | 'onSecondary' | 'danger' | 'success' | 'accent';

export interface TextProps extends Omit<RNTextProps, 'children'> {
  children: React.ReactNode;
  variant?: TypographyVariant;
  tone?: Tone;
  /** How far the text follows the OS font size; see lib/text/textScaling.ts. */
  scaling?: TextScalingPreset;
}

const TONE_CLASS: Record<Tone, string> = {
  primary: 'text-primary',
  muted: 'text-muted',
  onSubtle: 'text-on-subtle',
  onAccent: 'text-on-accent',
  onSecondary: 'text-on-secondary',
  danger: 'text-danger',
  success: 'text-success',
  accent: 'text-accent',
};

// Typography primitive. Mirrors apps/web/components/primitives/Text.tsx prop API
// (variant: TypographyVariant, tone: Tone). Uses NativeWind font-size utilities
// keyed by variant name (e.g. text-body, text-h1) that resolve to the shared
// typography tokens wired in tailwind.config.ts.
export function Text({
  children,
  variant = 'body',
  tone = 'primary',
  className = '',
  scaling = 'body',
  ...rest
}: TextProps) {
  const classes = [`text-${variant}`, TONE_CLASS[tone], className].filter(Boolean).join(' ');
  return (
    <RNText className={classes} {...TEXT_SCALING[scaling]} {...rest}>
      {children}
    </RNText>
  );
}

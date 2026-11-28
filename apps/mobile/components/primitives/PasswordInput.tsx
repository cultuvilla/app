import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Input, type InputProps } from './Input';
import { Pressable } from './Pressable';
import { useT } from '../../lib/i18n';

export type PasswordInputProps = Omit<InputProps, 'secureTextEntry' | 'rightAdornment'> & {
  testID?: string;
};

export function PasswordInput({ testID, value, onFocus, onBlur, ...rest }: PasswordInputProps) {
  const { t } = useT();
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);

  const hasValue = value != null && value.length > 0;
  const showToggle = focused || hasValue;

  // Use parameter type inference from InputProps' onFocus/onBlur (which under
  // react-native-web typings resolves to the DOM FocusEvent type, while on
  // native it's NativeSyntheticEvent<TextInputFocusEventData>). Casting
  // through `any` here keeps a single source file working across both.
  const handleFocus: NonNullable<InputProps['onFocus']> = (e) => {
    setFocused(true);
    onFocus?.(e as never);
  };
  const handleBlur: NonNullable<InputProps['onBlur']> = (e) => {
    setFocused(false);
    onBlur?.(e as never);
  };

  const toggle = showToggle ? (
    <Pressable
      onPress={() => setVisible((v) => !v)}
      accessibilityRole="button"
      accessibilityLabel={visible ? t('common.password.hide') : t('common.password.show')}
      testID={testID ? `${testID}-toggle` : undefined}
      hitSlop={8}
    >
      <Ionicons name={visible ? 'eye-off' : 'eye'} size={20} />
    </Pressable>
  ) : null;

  return (
    <Input
      {...rest}
      value={value}
      secureTextEntry={!visible}
      onFocus={handleFocus}
      onBlur={handleBlur}
      rightAdornment={toggle}
      testID={testID ? `${testID}-input` : undefined}
    />
  );
}

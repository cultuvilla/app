import { Alert } from 'react-native';

/** Single-button info dialog. */
export function showAlert(message: string, title?: string): void {
  if (title) Alert.alert(title, message);
  else Alert.alert(message);
}

/** Confirm dialog. Calls `onConfirm` only if the user accepts. */
export function showConfirm(
  title: string,
  message: string,
  onConfirm: () => void,
  { confirmText = 'OK', cancelText = 'Cancelar' }: { confirmText?: string; cancelText?: string } = {},
): void {
  Alert.alert(title, message, [
    { text: cancelText, style: 'cancel' },
    { text: confirmText, onPress: onConfirm },
  ]);
}

import { useState } from 'react';
import { Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from '../primitives/Pressable';
import { BlockingOverlay } from '../primitives/BlockingOverlay';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';

export type DeleteHeaderButtonProps = {
  /**
   * Runs the delete. Return the write+navigation promise so the overlay stays
   * up until the screen unmounts (or clears if the delete rejects).
   */
  onConfirm: () => void | Promise<void>;
  accessibilityLabel: string;
  confirmTitle: string;
  confirmMessage: string;
  confirmLabel: string;
  cancelLabel: string;
  /**
   * A second destructive choice offered next to `confirmLabel` — e.g. a weekly
   * event's "este y los siguientes" beside "solo este día".
   */
  alternative?: { label: string; onConfirm: () => void | Promise<void> };
  /** Per-entity wait message shown on the blocking overlay, e.g. "Eliminando evento…". */
  deletingLabel: string;
  /** Rendered inside an orange `ScreenHeader accent` bar → use the light tint. */
  onAccent?: boolean;
  testID?: string;
};

/**
 * Trash icon for an edit screen's `ScreenHeader` rightSlot. Runs a confirm
 * dialog before invoking `onConfirm`. This is the ONE place delete lives for an
 * entity — never in the entity detail header.
 *
 * While the delete is in flight it raises a non-dismissible `BlockingOverlay`
 * so the user knows to wait. Deletes navigate away with `router.replace` on
 * success, which unmounts this button and tears the overlay down with it; if
 * the delete rejects, the overlay clears so the screen isn't stuck.
 */
export function DeleteHeaderButton({
  onConfirm,
  accessibilityLabel,
  confirmTitle,
  confirmMessage,
  confirmLabel,
  cancelLabel,
  alternative,
  deletingLabel,
  onAccent = false,
  testID,
}: DeleteHeaderButtonProps) {
  const [deleting, setDeleting] = useState(false);

  const doDelete = (action: () => void | Promise<void>) => {
    setDeleting(true);
    Promise.resolve(action()).catch(() => setDeleting(false));
  };

  const run = () => {
    Alert.alert(confirmTitle, confirmMessage, [
      { text: cancelLabel, style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: () => doDelete(onConfirm) },
      ...(alternative
        ? [{ text: alternative.label, style: 'destructive' as const, onPress: () => doDelete(alternative.onConfirm) }]
        : []),
    ]);
  };

  return (
    <>
      <Pressable onPress={run} accessibilityLabel={accessibilityLabel} testID={testID} className="p-1 ml-2">
        <Ionicons
          name="trash-outline"
          size={iconSizes.md}
          color={onAccent ? '#f9f0e8' : colors.light.fg.accent}
        />
      </Pressable>
      <BlockingOverlay visible={deleting} label={deletingLabel} />
    </>
  );
}

import { BottomSheet, Pressable, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';

export interface SheetOption {
  key: string;
  label: string;
  selected?: boolean;
}

/** A bottom sheet of tappable choices — pick a cargo, pick a member to link. */
export function OptionsSheet({
  visible,
  title,
  hint,
  emptyLabel,
  options,
  onPick,
  onClose,
  testID,
}: {
  visible: boolean;
  title: string;
  hint?: string;
  emptyLabel?: string;
  options: SheetOption[];
  onPick: (key: string) => void;
  onClose: () => void;
  testID?: string;
}) {
  const { t } = useT();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} closeLabel={t('common.close')} testID={testID}>
      <VStack gap={1}>
        {hint ? (
          <Text tone="muted" variant="bodySm" className="pb-2">
            {hint}
          </Text>
        ) : null}
        {options.length === 0 && emptyLabel ? <Text tone="muted">{emptyLabel}</Text> : null}
        {options.map((o) => (
          <Pressable
            key={o.key}
            testID={`${testID ?? 'options'}-${o.key}`}
            accessibilityRole="button"
            accessibilityState={{ selected: o.selected ?? false }}
            onPress={() => onPick(o.key)}
            className="py-3"
          >
            <Text className={o.selected ? 'font-bold' : ''}>{o.label}</Text>
          </Pressable>
        ))}
      </VStack>
    </BottomSheet>
  );
}

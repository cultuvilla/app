import { useState } from 'react';
import { View } from 'react-native';
import { MAX_LEDGER_CATEGORY_NAME, type LedgerCategoryChoice } from '@cultuvilla/shared/models/organization';
import { Button, HStack, Input, Pressable, Text } from '../../primitives';
import { useT } from '../../../lib/i18n';

/**
 * The ledger categories of one kind as chips, at most one chosen (none is
 * "Sin categoría"), with a "+ Nueva" chip that names a new one on the spot.
 */
export function LedgerCategoryChips({
  choices,
  value,
  onPick,
  onCreate,
  testID = 'ledger-category',
}: {
  choices: readonly LedgerCategoryChoice[];
  value: string | null;
  onPick: (choice: LedgerCategoryChoice | null) => void;
  onCreate: (name: string) => void;
  testID?: string;
}) {
  const { t } = useT();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const add = () => {
    if (name.trim() === '') return;
    onCreate(name);
    setName('');
    setNaming(false);
  };

  return (
    <View testID={testID}>
      <View className="flex-row flex-wrap gap-2">
        {choices.map((c) => (
          <Chip
            key={c.name}
            label={c.name}
            chosen={c.name === value}
            testID={`${testID}-${c.name}`}
            onPress={() => onPick(c.name === value ? null : c)}
          />
        ))}
        <Chip label={t('groups.records.year.form.newCategory')} chosen={naming} testID={`${testID}-new`} onPress={() => setNaming((n) => !n)} />
      </View>
      {naming ? (
        <HStack gap={2} align="end" className="pt-2">
          <View className="flex-1">
            <Input
              placeholder={t('groups.records.year.form.newCategoryName')}
              value={name}
              onChangeText={setName}
              maxLength={MAX_LEDGER_CATEGORY_NAME}
              autoFocus
              onSubmitEditing={add}
              testID={`${testID}-name`}
            />
          </View>
          <Button size="md" variant="secondary" onPress={add} disabled={name.trim() === ''} testID={`${testID}-add`}>
            {t('groups.records.year.form.newCategoryAdd')}
          </Button>
        </HStack>
      ) : null}
    </View>
  );
}

function Chip({ label, chosen, onPress, testID }: { label: string; chosen: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: chosen }}
      onPress={onPress}
      className={`px-3 py-1.5 rounded-full border ${chosen ? 'bg-accent border-accent' : 'bg-surface border-subtle'}`}
    >
      <Text variant="bodySm" tone={chosen ? 'onAccent' : 'primary'} className={chosen ? 'font-bold' : ''}>
        {label}
      </Text>
    </Pressable>
  );
}

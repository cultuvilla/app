import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  cleanLedgerCategoryName,
  ledgerCategoryKey,
  MAX_LEDGER_CATEGORY_NAME,
  type LedgerEntryKind,
} from '@cultuvilla/shared/models/organization';
import {
  deleteLedgerCategory,
  renameLedgerCategory,
  watchLedgerCategories,
  type LedgerCategory,
} from '@cultuvilla/shared/services/ledgerCategoryService';
import { BottomSheet, Button, HStack, Input, Pressable, Text, VStack } from '../../primitives';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { showAlert, showConfirm } from '../../../lib/dialogs';

const KINDS: readonly LedgerEntryKind[] = ['expense', 'income'];
const HEADING: Record<LedgerEntryKind, string> = { expense: 'groups.records.year.expenses', income: 'groups.records.year.income' };

/**
 * The group's ledger categories, gastos and ingresos, for its admins to rename
 * or delete. They are created where they are used, in the entry sheet. Neither
 * change touches an entry already noted: entries keep the name as it was.
 */
export function LedgerCategoriesSheet({ visible, orgId, uid, onClose }: { visible: boolean; orgId: string; uid: string; onClose: () => void }) {
  const { t } = useT();
  const categories = useWatch<LedgerCategory[]>('groups:watchLedgerCategories', visible ? orgId : null, (next, error) =>
    watchLedgerCategories(orgId, next, error),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (visible) setEditingId(null);
  }, [visible]);

  const rows = categories.data ?? [];
  const startRename = (c: LedgerCategory) => {
    setEditingId(c.id);
    setName(c.name);
    setError(undefined);
  };
  const saveRename = (c: LedgerCategory) => {
    const cleaned = cleanLedgerCategoryName(name);
    if (cleaned === '') return setError(t('groups.records.categories.nameRequired'));
    const taken = rows.some((o) => o.id !== c.id && o.kind === c.kind && ledgerCategoryKey(o.name) === ledgerCategoryKey(cleaned));
    if (taken) return setError(t('groups.records.categories.nameTaken'));
    setEditingId(null);
    if (cleaned === c.name) return;
    renameLedgerCategory(orgId, c, cleaned, uid).catch(() => showAlert(t('groups.records.error')));
  };
  const remove = (c: LedgerCategory) =>
    showConfirm(
      t('groups.records.categories.confirmDeleteTitle'),
      t('groups.records.categories.confirmDeleteBody', { name: c.name }),
      () => {
        deleteLedgerCategory(orgId, c.id).catch(() => showAlert(t('groups.records.error')));
      },
      { confirmText: t('groups.records.categories.delete'), cancelText: t('common.cancel') },
    );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('groups.records.categories.title')}
      closeLabel={t('common.close')}
      testID="ledger-categories-sheet"
    >
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
        <VStack gap={3} className="px-5 pb-4">
          <Text variant="bodySm" tone="muted">
            {t('groups.records.categories.intro')}
          </Text>
          {KINDS.map((kind) => {
            const ofKind = rows.filter((r) => r.kind === kind).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
            return (
              <VStack key={kind} gap={1} testID={`ledger-categories-${kind}`}>
                <Text className="font-bold">{t(HEADING[kind])}</Text>
                {categories.status === 'ready' && ofKind.length === 0 ? (
                  <Text variant="bodySm" tone="muted">
                    {t('groups.records.categories.empty')}
                  </Text>
                ) : null}
                {ofKind.map((c) =>
                  editingId === c.id ? (
                    <HStack key={c.id} gap={2} align="start" className="py-1">
                      <View className="flex-1">
                        <Input
                          value={name}
                          onChangeText={setName}
                          maxLength={MAX_LEDGER_CATEGORY_NAME}
                          error={error}
                          autoFocus
                          onSubmitEditing={() => saveRename(c)}
                          testID={`ledger-category-rename-input-${c.id}`}
                        />
                      </View>
                      <Button size="md" variant="secondary" onPress={() => saveRename(c)} testID={`ledger-category-rename-save-${c.id}`}>
                        {t('groups.records.categories.save')}
                      </Button>
                    </HStack>
                  ) : (
                    <HStack key={c.id} gap={4} align="center" justify="between" className="py-2 border-b border-subtle" testID={`ledger-category-row-${c.id}`}>
                      <Text className="flex-1">{c.name}</Text>
                      <Pressable accessibilityRole="button" onPress={() => startRename(c)} testID={`ledger-category-rename-${c.id}`}>
                        <Text variant="bodySm" className="text-accent font-medium">
                          {t('groups.records.categories.rename')}
                        </Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" onPress={() => remove(c)} testID={`ledger-category-delete-${c.id}`}>
                        <Text variant="bodySm" tone="danger" className="font-medium">
                          {t('groups.records.categories.delete')}
                        </Text>
                      </Pressable>
                    </HStack>
                  ),
                )}
              </VStack>
            );
          })}
        </VStack>
      </ScrollView>
    </BottomSheet>
  );
}

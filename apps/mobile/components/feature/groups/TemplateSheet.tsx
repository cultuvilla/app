import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MAX_TEMPLATE_ITEMS, type TaskTemplateItem } from '@cultuvilla/shared/models/organization';
import { deleteTaskTemplate, saveTaskTemplate, type TaskTemplate } from '@cultuvilla/shared/services/groupTaskService';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { Button, HStack, Input, Pressable, Text, VStack } from '../../primitives';
import { FormModal } from '../../layout/FormModal';
import { useT } from '../../../lib/i18n';
import { showAlert, showConfirm } from '../../../lib/dialogs';
import { offsetLabel } from '../../../lib/orgs/tasks';
import { TemplateItemSheet } from './TemplateItemSheet';

/** Which task the item sheet is writing: an index into the list, or a new one. */
type Editing = { index: number | null } | null;

/**
 * Admin: write or edit a checklist template — a name and its tasks, each dated
 * by days before (negative) or after the date it is applied to.
 */
export function TemplateSheet({
  visible,
  orgId,
  uid,
  template,
  initial = null,
  onClose,
}: {
  visible: boolean;
  orgId: string;
  uid: string;
  /** null = a new template. */
  template: TaskTemplate | null;
  /** A new template's starting point — an event's checklist being saved. */
  initial?: { name: string; items: TaskTemplateItem[] } | null;
  onClose: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [items, setItems] = useState<TaskTemplateItem[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const start = template ?? initial;
    setName(start?.name ?? '');
    setItems(start?.items ?? []);
    setEditing(null);
    setError(null);
  }, [visible, template, initial]);

  const editIndex = editing?.index ?? null;

  const saveItem = (item: TaskTemplateItem) => {
    setItems((prev) => (editIndex === null ? [...prev, item] : prev.map((x, i) => (i === editIndex ? item : x))));
    setEditing(null);
    setError(null);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setEditing(null);
  };

  const save = () => {
    if (!name.trim()) return setError(t('groups.tasks.templates.nameRequired'));
    if (items.length === 0) return setError(t('groups.tasks.templates.itemsRequired'));
    setError(null);
    setSaving(true);
    saveTaskTemplate(orgId, template?.id ?? null, { name, items }, uid)
      .then(onClose)
      .catch(() => showAlert(t('groups.tasks.error')))
      .finally(() => setSaving(false));
  };

  const remove = () => {
    if (!template) return;
    showConfirm(
      t('groups.tasks.templates.delete'),
      t('groups.tasks.templates.deleteConfirm'),
      () => {
        deleteTaskTemplate(orgId, template.id)
          .then(onClose)
          .catch(() => showAlert(t('groups.tasks.error')));
      },
      { confirmText: t('common.delete'), cancelText: t('common.cancel') },
    );
  };

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title={t(template ? 'groups.tasks.templates.titleEdit' : 'groups.tasks.templates.titleNew')}
      testID="template-sheet"
      footer={
        <VStack gap={2} className="px-5 pt-3">
          {error ? (
            <Text variant="bodySm" tone="danger" testID="template-error">
              {error}
            </Text>
          ) : null}
          <Button onPress={save} loading={saving} fullWidth testID="template-save">
            {t('groups.tasks.templates.save')}
          </Button>
          {template ? (
            <Button variant="ghost" onPress={remove} fullWidth testID="template-delete">
              {t('groups.tasks.templates.delete')}
            </Button>
          ) : null}
        </VStack>
      }
    >
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        <VStack gap={4} className="px-4 pt-4 pb-6">
          <Input label={t('groups.tasks.templates.name')} value={name} onChangeText={setName} testID="template-name" />
          <VStack gap={2}>
            <Text className="font-bold">{t('groups.tasks.templates.tasksHeading')}</Text>
            {items.length === 0 ? (
              <Text variant="bodySm" tone="muted" testID="template-items-empty">
                {t('groups.tasks.templates.noItems')}
              </Text>
            ) : (
              items.map((item, i) => (
                <Pressable
                  key={`${String(i)}-${item.title}`}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  onPress={() => setEditing({ index: i })}
                  className="rounded-lg p-4 bg-surface-elevated shadow-sm"
                  testID={`template-item-${String(i)}`}
                >
                  <HStack gap={3} align="center">
                    <VStack className="flex-1" gap={1}>
                      <Text className="font-bold" numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text variant="bodySm" tone="muted" testID={`template-item-when-${String(i)}`}>
                        {[
                          offsetLabel(t, item.offsetDays),
                          ...(item.slots ? [t('groups.tasks.templates.slotsCount', { n: item.slots })] : []),
                        ].join(' · ')}
                      </Text>
                    </VStack>
                    <Ionicons name="chevron-forward" size={iconSizes.sm} color={colors.light.fg.muted} />
                  </HStack>
                </Pressable>
              ))
            )}
            {items.length < MAX_TEMPLATE_ITEMS ? (
              <Button variant="secondary" onPress={() => setEditing({ index: null })} testID="template-add-item">
                {t('groups.tasks.templates.addItem')}
              </Button>
            ) : null}
          </VStack>
        </VStack>
      </ScrollView>
      <TemplateItemSheet
        visible={editing !== null}
        item={editIndex === null ? null : (items[editIndex] ?? null)}
        onSave={saveItem}
        onRemove={editIndex === null ? null : () => removeItem(editIndex)}
        onClose={() => setEditing(null)}
      />
    </FormModal>
  );
}
